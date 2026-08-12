from __future__ import annotations

from datetime import datetime, timezone
import math
import re
from typing import Any

from app.services.memory_candidate_service import MemoryItemData, memory_candidate_service


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


def lexical_similarity(a: str, b: str) -> float:
    left, right = tokenize(a), tokenize(b)
    if not left or not right:
        return 0.0
    return len(left & right) / max(1, len(left | right))


def recency_score(created_at: str) -> float:
    try:
        dt = datetime.fromisoformat(created_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        days = max(0, (datetime.now(timezone.utc) - dt).days)
        return round(math.exp(-days / 90), 3)
    except Exception:
        return 0.5


class MemoryRetriever:
    def __init__(self, service=None) -> None:
        self.service = service or memory_candidate_service

    def retrieve(self, query: str, *, user_id: str | int, workspace_id: str = "default", intent: str = "", include_sensitive: bool = False, limit: int = 5, db: Any | None = None) -> list[dict[str, Any]]:
        candidates = self.service.list_memories(user_id=user_id, db=db)
        ranked: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc)
        for item in candidates:
            if not self._allowed(item, workspace_id=workspace_id, include_sensitive=include_sensitive, now=now):
                continue
            semantic = lexical_similarity(query, f"{item.content} {item.summary} {item.category}")
            workspace_match = 1.0 if item.workspace_id == workspace_id else 0.0
            intent_match = 1.0 if intent and intent.lower() in f"{item.category} {item.content}".lower() else 0.0
            feedback_score = item.confidence
            score = 0.35 * semantic + 0.20 * item.importance + 0.15 * recency_score(item.created_at) + 0.15 * workspace_match + 0.10 * intent_match + 0.05 * feedback_score
            ranked.append({"memory": item.to_dict(), "memory_score": round(score, 4)})
        ranked.sort(key=lambda row: row["memory_score"], reverse=True)
        return ranked[:limit]

    def _allowed(self, item: MemoryItemData, *, workspace_id: str, include_sensitive: bool, now: datetime) -> bool:
        if item.status not in {"active", "approved"}:
            return False
        if item.supersedes_memory_id and item.status == "superseded":
            return False
        if item.sensitivity == "high" and not include_sensitive:
            return False
        if item.workspace_id not in {workspace_id, "global", "default"}:
            return False
        if item.expires_at:
            try:
                expires = datetime.fromisoformat(item.expires_at)
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=timezone.utc)
                if expires < now:
                    return False
            except Exception:
                pass
        return True


memory_retriever = MemoryRetriever()
