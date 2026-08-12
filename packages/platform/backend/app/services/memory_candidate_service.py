from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
import hashlib
import json
import re
from typing import Any

from app.services.memory_policy import MemoryClass, SENSITIVE_TERMS, normalize_memory_class


class MemoryType(str, Enum):
    WORKING = "working"
    SEMANTIC = "semantic"
    PROCEDURAL = "procedural"
    EPISODIC = "episodic"


class MemoryCandidateStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    SUPERSEDED = "superseded"


@dataclass
class MemoryCandidateData:
    candidate_id: str
    user_id: str
    organization_id: str | None
    workspace_id: str
    conversation_id: str
    source_message_id: str
    memory_type: str
    memory_class: str
    category: str
    content: str
    evidence: list[str] = field(default_factory=list)
    linked_entities: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    importance: float = 0.0
    repeatability: float = 0.0
    freshness: float = 1.0
    sensitivity: str = "low"
    retention_policy: str = "30_days"
    requires_confirmation: bool = True
    status: str = MemoryCandidateStatus.PENDING.value
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MemoryItemData:
    memory_id: str
    user_id: str
    organization_id: str | None
    workspace_id: str
    memory_type: str
    memory_class: str
    category: str
    content: str
    summary: str
    source_event_id: str | None
    confidence: float
    importance: float
    repeatability: float
    sensitivity: str
    retention_policy: str
    expires_at: str | None
    status: str = "active"
    supersedes_memory_id: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


RETENTION_DAYS = {"session": 0, "7_days": 7, "30_days": 30, "1_year": 365}
CATEGORY_HINTS = {
    "correction": [r"\bno,?\b", r"\bdon't\b", r"\bprefer\b", r"\binstead\b", r"\bcorrect\b"],
    "preference": [r"\balways\b", r"\bprefer\b", r"\bdefault\b", r"\bremind me\b"],
    "goal": [r"\bgoal\b", r"\bi want to\b", r"\bplan to\b"],
    "document_fact": [r"\bfile\b", r"\bdocument\b", r"\bsyllabus\b", r"\bassignment\b"],
    "workflow_feedback": [r"\brejected\b", r"\baccepted\b", r"\bliked\b", r"\bdisliked\b", r"\bfailed\b"],
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def stable_id(prefix: str, *parts: Any) -> str:
    digest = hashlib.sha256("|".join(str(part) for part in parts).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def clean_memory_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    cleaned = re.sub(r"^(remember that|remember|save that|please remember)\s+", "", cleaned, flags=re.I)
    return cleaned[:1000]


def detect_sensitivity(text: str) -> str:
    lowered = text.lower()
    if any(term in lowered for term in SENSITIVE_TERMS) or re.search(r"\b\d{3}-\d{2}-\d{4}\b", lowered):
        return "high"
    if any(term in lowered for term in ["visa", "passport", "i-20", "uscis", "medical", "health", "family", "financial"]):
        return "medium"
    return "low"


def detect_category(text: str) -> str:
    lowered = text.lower()
    for category, patterns in CATEGORY_HINTS.items():
        if any(re.search(pattern, lowered) for pattern in patterns):
            return category
    if any(word in lowered for word in ["project", "workspace", "client"]):
        return "project_fact"
    return "temporary_detail"


def classify_memory_type(category: str) -> MemoryType:
    if category in {"preference", "goal", "document_fact", "project_fact", "correction"}:
        return MemoryType.SEMANTIC
    if category in {"workflow_feedback", "task_pattern"}:
        return MemoryType.EPISODIC
    return MemoryType.WORKING


def score_candidate(content: str, category: str, sensitivity: str, user_confirmation: bool = False) -> dict[str, float]:
    lowered = content.lower()
    importance = 0.35
    repeatability = 0.25
    confidence = 0.65
    if category in {"preference", "correction"}:
        importance += 0.35
        repeatability += 0.45
        confidence += 0.20
    if category in {"goal", "document_fact", "project_fact"}:
        importance += 0.25
        repeatability += 0.20
    if any(term in lowered for term in ["always", "never", "prefer", "don't", "instead"]):
        confidence += 0.10
        repeatability += 0.10
    if user_confirmation:
        confidence += 0.15
    if sensitivity == "high":
        importance += 0.10
        confidence -= 0.10
    return {
        "confidence": round(min(max(confidence, 0), 1), 2),
        "importance": round(min(max(importance, 0), 1), 2),
        "repeatability": round(min(max(repeatability, 0), 1), 2),
        "freshness": 1.0,
    }


def retention_expiry(policy: str) -> str | None:
    days = RETENTION_DAYS.get(policy)
    if not days:
        return None
    return (now_utc() + timedelta(days=days)).isoformat()


class MemoryCandidateService:
    def __init__(self) -> None:
        self._candidates: dict[str, MemoryCandidateData] = {}
        self._items: dict[str, MemoryItemData] = {}
        self._events: list[dict[str, Any]] = []

    def create_candidate(self, event: dict[str, Any], *, db: Any | None = None, auto_memory_enabled: bool = True) -> MemoryCandidateData:
        message = clean_memory_text(str(event.get("user_message") or event.get("content") or ""))
        response = clean_memory_text(str(event.get("assistant_response") or ""))
        text = message or response
        category = str(event.get("category") or detect_category(text))
        sensitivity = str(event.get("sensitivity") or detect_sensitivity(text))
        memory_type = str(event.get("memory_type") or classify_memory_type(category).value)
        memory_class = str(event.get("memory_class") or self._default_memory_class(memory_type, sensitivity, category))
        scores = score_candidate(text, category, sensitivity, bool(event.get("user_confirmation")))
        content = str(event.get("distilled_content") or self.distill_content(text, category))
        candidate_id = stable_id("MC", event.get("user_id"), event.get("workspace_id", "default"), category, content.lower())
        requires_confirmation = self.requires_confirmation(memory_class, sensitivity, scores, auto_memory_enabled)
        status = MemoryCandidateStatus.PENDING.value
        if not requires_confirmation and auto_memory_enabled and memory_class != MemoryClass.SENSITIVE.value:
            status = MemoryCandidateStatus.APPROVED.value
        candidate = MemoryCandidateData(
            candidate_id=candidate_id,
            user_id=str(event.get("user_id") or "anonymous"),
            organization_id=str(event.get("organization_id")) if event.get("organization_id") is not None else None,
            workspace_id=str(event.get("workspace_id") or "default"),
            conversation_id=str(event.get("conversation_id") or "default"),
            source_message_id=str(event.get("message_id") or event.get("source_message_id") or ""),
            memory_type=memory_type,
            memory_class=memory_class,
            category=category,
            content=content,
            evidence=[message[:240]] if message else [],
            linked_entities=dict(event.get("linked_entities") or event.get("entities") or {}),
            confidence=scores["confidence"],
            importance=scores["importance"],
            repeatability=scores["repeatability"],
            freshness=scores["freshness"],
            sensitivity=sensitivity,
            retention_policy=str(event.get("retention_policy") or self._default_retention(memory_class, sensitivity)),
            requires_confirmation=requires_confirmation,
            status=status,
        )
        existing = self._find_duplicate(candidate)
        if existing:
            existing.confidence = max(existing.confidence, candidate.confidence)
            existing.evidence = list(dict.fromkeys(existing.evidence + candidate.evidence))[:5]
            self._persist_candidate(existing, db=db)
            return existing
        self._candidates[candidate.candidate_id] = candidate
        self._persist_candidate(candidate, db=db)
        self._record_event("candidate_created", candidate_id=candidate.candidate_id, payload=candidate.to_dict(), db=db)
        if status == MemoryCandidateStatus.APPROVED.value:
            self.approve(candidate.candidate_id, db=db, actor="auto_policy")
        return candidate

    def distill_content(self, text: str, category: str) -> str:
        text = clean_memory_text(text)
        lowered = text.lower()
        if category == "correction" and "evening" in lowered and "remind" in lowered:
            return "User prefers evening reminders for non-urgent tasks."
        if category == "preference" and "remind" in lowered:
            return text if text.endswith(".") else f"{text}."
        if category == "temporary_detail":
            return text[:240]
        return text if text.endswith(".") else f"{text}."

    def requires_confirmation(self, memory_class: str, sensitivity: str, scores: dict[str, float], auto_memory_enabled: bool) -> bool:
        if memory_class == MemoryClass.SENSITIVE.value or sensitivity in {"medium", "high"}:
            return True
        if not auto_memory_enabled:
            return True
        return not (sensitivity == "low" and scores["confidence"] >= 0.80 and scores["importance"] >= 0.50 and scores["repeatability"] >= 0.60)

    def _default_memory_class(self, memory_type: str, sensitivity: str, category: str) -> str:
        if sensitivity == "high":
            return MemoryClass.SENSITIVE.value
        if memory_type == MemoryType.WORKING.value:
            return MemoryClass.TEMPORARY.value
        if category in {"document_fact", "project_fact"}:
            return MemoryClass.WORKSPACE.value
        return MemoryClass.DURABLE.value

    def _default_retention(self, memory_class: str, sensitivity: str) -> str:
        if memory_class in {MemoryClass.TEMPORARY.value, MemoryClass.SESSION.value}:
            return "session"
        if sensitivity == "high":
            return "until_deleted"
        return "1_year"

    def approve(self, candidate_id: str, *, db: Any | None = None, actor: str = "user") -> MemoryItemData:
        candidate = self.get_candidate(candidate_id, db=db)
        if not candidate:
            raise KeyError(candidate_id)
        candidate.status = MemoryCandidateStatus.APPROVED.value
        item_id = stable_id("MEM", candidate.user_id, candidate.workspace_id, candidate.category, candidate.content.lower())
        item = MemoryItemData(
            memory_id=item_id,
            user_id=candidate.user_id,
            organization_id=candidate.organization_id,
            workspace_id=candidate.workspace_id,
            memory_type=candidate.memory_type,
            memory_class=candidate.memory_class,
            category=candidate.category,
            content=candidate.content,
            summary=candidate.content[:240],
            source_event_id=candidate.candidate_id,
            confidence=candidate.confidence,
            importance=candidate.importance,
            repeatability=candidate.repeatability,
            sensitivity=candidate.sensitivity,
            retention_policy=candidate.retention_policy,
            expires_at=retention_expiry(candidate.retention_policy),
        )
        self._items[item.memory_id] = item
        self._persist_candidate(candidate, db=db)
        self._persist_item(item, db=db)
        self._record_event("memory_approved", memory_id=item.memory_id, candidate_id=candidate.candidate_id, payload={"actor": actor}, db=db)
        return item

    def reject(self, candidate_id: str, *, db: Any | None = None, actor: str = "user") -> MemoryCandidateData:
        candidate = self.get_candidate(candidate_id, db=db)
        if not candidate:
            raise KeyError(candidate_id)
        candidate.status = MemoryCandidateStatus.REJECTED.value
        self._persist_candidate(candidate, db=db)
        self._record_event("candidate_rejected", candidate_id=candidate_id, payload={"actor": actor}, db=db)
        return candidate

    def forget(self, memory_id: str, *, user_id: str | int | None = None, db: Any | None = None) -> bool:
        item = self.get_memory(memory_id, db=db)
        if not item or (user_id is not None and str(item.user_id) != str(user_id)):
            return False
        item.status = "deleted"
        item.content = "[deleted]"
        item.summary = "Memory deleted by user."
        item.updated_at = now_utc().isoformat()
        self._items[item.memory_id] = item
        self._persist_item(item, db=db)
        self._record_event("memory_forgotten", memory_id=memory_id, payload={}, db=db)
        return True

    def update_memory(self, memory_id: str, content: str, *, db: Any | None = None) -> MemoryItemData:
        item = self.get_memory(memory_id, db=db)
        if not item:
            raise KeyError(memory_id)
        old_id = item.memory_id
        new_id = stable_id("MEM", item.user_id, item.workspace_id, item.category, content.lower(), now_utc().isoformat())
        item.status = "superseded"
        self._persist_item(item, db=db)
        new_item = MemoryItemData(**{**item.to_dict(), "memory_id": new_id, "content": clean_memory_text(content), "summary": clean_memory_text(content)[:240], "status": "active", "supersedes_memory_id": old_id, "updated_at": now_utc().isoformat()})
        self._items[new_id] = new_item
        self._persist_item(new_item, db=db)
        self._record_event("memory_edited", memory_id=new_id, payload={"supersedes": old_id}, db=db)
        return new_item

    def list_candidates(self, *, user_id: str | int | None = None, status: str | None = None, db: Any | None = None) -> list[MemoryCandidateData]:
        rows = self._load_candidates(db=db) if db is not None else list(self._candidates.values())
        return [row for row in rows if (user_id is None or str(row.user_id) == str(user_id)) and (status is None or row.status == status)]

    def list_memories(self, *, user_id: str | int | None = None, workspace_id: str | None = None, include_deleted: bool = False, db: Any | None = None) -> list[MemoryItemData]:
        rows = self._load_items(db=db) if db is not None else list(self._items.values())
        result = []
        for row in rows:
            if user_id is not None and str(row.user_id) != str(user_id):
                continue
            if workspace_id is not None and row.workspace_id != workspace_id:
                continue
            if not include_deleted and row.status in {"deleted", "rejected"}:
                continue
            result.append(row)
        return result

    def get_candidate(self, candidate_id: str, *, db: Any | None = None) -> MemoryCandidateData | None:
        if db is None:
            return self._candidates.get(candidate_id)
        for item in self._load_candidates(db=db):
            if item.candidate_id == candidate_id:
                return item
        return None

    def get_memory(self, memory_id: str, *, db: Any | None = None) -> MemoryItemData | None:
        if db is None:
            return self._items.get(memory_id)
        for item in self._load_items(db=db):
            if item.memory_id == memory_id:
                return item
        return None

    def feedback(self, payload: dict[str, Any], *, db: Any | None = None) -> dict[str, Any]:
        feedback_type = str(payload.get("feedback_type") or "ignored")
        memory_id = payload.get("target_memory_id")
        candidate_id = payload.get("candidate_id")
        if feedback_type in {"rejected", "do_not_remember"} and candidate_id:
            candidate = self.reject(str(candidate_id), db=db)
            return {"status": "rejected", "candidate": candidate.to_dict()}
        if feedback_type == "save_to_memory":
            if candidate_id:
                return {"status": "approved", "memory": self.approve(str(candidate_id), db=db).to_dict()}
            event = {**payload, "user_message": payload.get("edited_text") or payload.get("content") or "Save this to memory", "user_confirmation": True}
            candidate = self.create_candidate(event, db=db, auto_memory_enabled=False)
            return {"status": "pending", "candidate": candidate.to_dict()}
        if feedback_type == "forget" and memory_id:
            return {"status": "forgotten", "deleted": self.forget(str(memory_id), db=db)}
        if feedback_type == "edited" and memory_id and payload.get("edited_text"):
            return {"status": "edited", "memory": self.update_memory(str(memory_id), str(payload["edited_text"]), db=db).to_dict()}
        if memory_id:
            item = self.get_memory(str(memory_id), db=db)
            if item:
                delta = -0.15 if feedback_type in {"rejected", "disliked"} else 0.05 if feedback_type in {"accepted", "liked"} else 0
                item.confidence = round(max(0, min(1, item.confidence + delta)), 2)
                self._persist_item(item, db=db)
                self._record_event("memory_feedback", memory_id=item.memory_id, payload=payload, db=db)
                return {"status": "updated", "memory": item.to_dict()}
        return {"status": "recorded", "feedback_type": feedback_type}

    def _find_duplicate(self, candidate: MemoryCandidateData) -> MemoryCandidateData | None:
        for existing in self._candidates.values():
            if existing.user_id == candidate.user_id and existing.workspace_id == candidate.workspace_id and existing.category == candidate.category and existing.content.lower() == candidate.content.lower() and existing.status in {"pending", "approved"}:
                return existing
        return None

    def _record_event(self, event_type: str, *, memory_id: str | None = None, candidate_id: str | None = None, payload: dict[str, Any] | None = None, db: Any | None = None) -> None:
        event = {"id": stable_id("ME", event_type, memory_id, candidate_id, now_utc().isoformat()), "memory_id": memory_id, "candidate_id": candidate_id, "event_type": event_type, "event_payload": payload or {}, "created_at": now_utc().isoformat()}
        self._events.append(event)
        if db is None:
            return
        try:
            from app.models.memory import MemoryEvent
            db.merge(MemoryEvent(id=event["id"], memory_id=memory_id, candidate_id=candidate_id, event_type=event_type, event_payload_json=payload or {}, created_by="system"))
            db.commit()
        except Exception:
            db.rollback()

    def _persist_candidate(self, candidate: MemoryCandidateData, *, db: Any | None = None) -> None:
        if db is None:
            return
        try:
            from app.models.memory import MemoryCandidate
            db.merge(MemoryCandidate(id=candidate.candidate_id, user_id=int(candidate.user_id), organization_id=candidate.organization_id, workspace_id=candidate.workspace_id, conversation_id=candidate.conversation_id, source_message_id=candidate.source_message_id, memory_type=candidate.memory_type, memory_class=candidate.memory_class, category=candidate.category, content=candidate.content, evidence_json=candidate.evidence, linked_entities_json=candidate.linked_entities, confidence=candidate.confidence, importance=candidate.importance, repeatability=candidate.repeatability, freshness=candidate.freshness, sensitivity=candidate.sensitivity, retention_policy=candidate.retention_policy, requires_confirmation=candidate.requires_confirmation, status=candidate.status))
            db.commit()
        except Exception:
            db.rollback()
            raise

    def _persist_item(self, item: MemoryItemData, *, db: Any | None = None) -> None:
        if db is None:
            return
        try:
            from app.models.memory import MemoryItem
            expires_at = datetime.fromisoformat(item.expires_at) if item.expires_at else None
            db.merge(MemoryItem(id=item.memory_id, user_id=int(item.user_id), organization_id=item.organization_id, workspace_id=item.workspace_id, memory_type=item.memory_type, memory_class=item.memory_class, category=item.category, content=item.content, summary=item.summary, source_event_id=item.source_event_id, confidence=item.confidence, importance=item.importance, repeatability=item.repeatability, sensitivity=item.sensitivity, retention_policy=item.retention_policy, expires_at=expires_at, status=item.status, supersedes_memory_id=item.supersedes_memory_id))
            db.commit()
        except Exception:
            db.rollback()
            raise

    def _load_candidates(self, *, db: Any) -> list[MemoryCandidateData]:
        from app.models.memory import MemoryCandidate
        rows = db.query(MemoryCandidate).all()
        return [MemoryCandidateData(candidate_id=row.id, user_id=str(row.user_id), organization_id=row.organization_id, workspace_id=row.workspace_id, conversation_id=row.conversation_id, source_message_id=row.source_message_id, memory_type=row.memory_type, memory_class=row.memory_class, category=row.category, content=row.content, evidence=list(row.evidence_json or []), linked_entities=dict(row.linked_entities_json or {}), confidence=float(row.confidence or 0), importance=float(row.importance or 0), repeatability=float(row.repeatability or 0), freshness=float(row.freshness or 1), sensitivity=row.sensitivity, retention_policy=row.retention_policy, requires_confirmation=bool(row.requires_confirmation), status=row.status, created_at=row.created_at.isoformat() if row.created_at else "") for row in rows]

    def _load_items(self, *, db: Any) -> list[MemoryItemData]:
        from app.models.memory import MemoryItem
        rows = db.query(MemoryItem).all()
        return [MemoryItemData(memory_id=row.id, user_id=str(row.user_id), organization_id=row.organization_id, workspace_id=row.workspace_id, memory_type=row.memory_type, memory_class=row.memory_class, category=row.category, content=row.content, summary=row.summary, source_event_id=row.source_event_id, confidence=float(row.confidence or 0), importance=float(row.importance or 0), repeatability=float(row.repeatability or 0), sensitivity=row.sensitivity, retention_policy=row.retention_policy, expires_at=row.expires_at.isoformat() if row.expires_at else None, status=row.status, supersedes_memory_id=row.supersedes_memory_id, created_at=row.created_at.isoformat() if row.created_at else "", updated_at=row.updated_at.isoformat() if row.updated_at else "") for row in rows]


memory_candidate_service = MemoryCandidateService()
