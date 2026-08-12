"""CEDA: Context Extraction, Decision & Adaptation Architecture.

CEDA stores distilled, policy-governed context rather than chat transcripts. Original
documents remain in user-selected locations; only references and approved instructions
are retained.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import hashlib
import json
import os
import re
import sqlite3
import threading
import uuid

from cryptography.fernet import Fernet

from app.core.config import settings


IMMIGRATION_DISCLAIMER = (
    "This timeline is informational and not legal advice. Verify dates and eligibility "
    "with your Designated School Official (DSO), your university, USCIS, or a qualified "
    "immigration attorney before submitting applications."
)

WORKSPACE_FOLDERS = (
    "00_System/policies", "00_System/context-index", "00_System/encryption",
    "00_System/audit-logs", "00_System/connector-settings",
    "01_Academic/courses", "01_Academic/assignments", "01_Academic/readings",
    "01_Academic/submissions", "01_Academic/notes", "01_Academic/exams",
    "02_Immigration/passport", "02_Immigration/visa", "02_Immigration/i20",
    "02_Immigration/sevis", "02_Immigration/cpt", "02_Immigration/opt",
    "02_Immigration/stem-opt", "02_Immigration/uscis", "02_Immigration/reminders",
    "03_Career/resumes", "03_Career/cover-letters", "03_Career/sop",
    "03_Career/references", "03_Career/recruiters", "03_Career/applications",
    "04_Social/linkedin", "04_Social/medium", "04_Social/reddit",
    "04_Social/instagram", "04_Social/facebook", "04_Social/whatsapp",
    "05_Important_Links/university", "05_Important_Links/immigration",
    "05_Important_Links/job-portals", "05_Important_Links/financial",
    "05_Important_Links/learning", "06_Secure_Vault/credentials",
    "06_Secure_Vault/api-keys", "06_Secure_Vault/client-ids",
    "06_Secure_Vault/tokens", "07_Generated_Output/drafts",
    "07_Generated_Output/reports", "07_Generated_Output/summaries",
    "07_Generated_Output/reminders", "07_Generated_Output/action-plans",
    "08_CEDA/new-context", "08_CEDA/user-choices", "08_CEDA/policy-updates",
    "08_CEDA/action-history", "08_CEDA/context-instructions",
)

DEFAULT_POLICIES = {
    "academic": {"save": "ask_first", "cloud": False, "exclude": ["immigration", "credentials"], "retention_days": 365},
    "immigration": {"save": "ask_first", "cloud": False, "public_output": False, "confirmation": True, "retention_days": 730},
    "career": {"save": "ask_first", "cloud": False, "exclude": ["immigration"], "retention_days": 730},
    "social": {"save": "ask_first", "cloud": False, "exclude": ["immigration", "grades", "credentials"], "confirmation": True, "retention_days": 365},
    "personal": {"save": "ask_first", "cloud": False, "retention_days": 365},
    "preferences": {"save": "ask_first", "cloud": False, "retention_days": 1095},
    "credentials": {"save": "never", "cloud": False, "public_output": False, "confirmation": True, "retention_days": 0},
}

CATEGORY_PATTERNS = {
    "immigration": r"\b(passport|visa|i-?20|sevis|cpt|opt|stem opt|ead|uscis|ds-?160|biometrics)\b",
    "academic": r"\b(assignment|syllabus|course|professor|exam|reading|grade|semester|class|research)\b",
    "career": r"\b(resume|cover letter|linkedin|interview|recruiter|job application|portfolio|sop)\b",
    "social": r"\b(linkedin post|medium|reddit|instagram|facebook|whatsapp|social post)\b",
    "preferences": r"\b(i prefer|always remind|never use|never include|my style|reminder style|writing style)\b",
    "personal": r"\b(remind|task|goal|habit|meeting|appointment|note|deadline)\b",
}

SECRET_PATTERN = re.compile(r"\b(password|passcode|secret|api[_ -]?key|client[_ -]?secret|ssn)\b", re.I)
DATE_PATTERN = re.compile(r"\b(?:due|expires?|expiration|appointment|deadline|ends?|starts?)\s*(?::|-)?\s*(?:on\s+)?([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})", re.I)
DURABLE_PATTERN = re.compile(r"\b(remember|save|store|due|deadline|expires?|always|never|prefer|remind|program end|appointment)\b", re.I)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class CEDAService:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or Path(settings.RUNTIME_ROOT) / "Student-LAD-Workspace"
        self._lock = threading.RLock()
        self._ensure_workspace()
        key_path = self.root / "00_System/encryption/ceda.key"
        if not key_path.exists():
            key_path.write_bytes(Fernet.generate_key())
            os.chmod(key_path, 0o600)
        self.cipher = Fernet(key_path.read_bytes().strip())
        self.db_path = self.root / "00_System/context-index/ceda.sqlite3"
        self._initialize_database()
        from app.services.policy_intelligence_service import PolicyIntelligenceEngine
        self.policy_engine = PolicyIntelligenceEngine(self)
        self._migrate_approved_candidates()

    def _ensure_workspace(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        for relative in WORKSPACE_FOLDERS:
            (self.root / relative).mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=15)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize_database(self) -> None:
        with self._connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS context_items (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, category TEXT NOT NULL,
                    kind TEXT NOT NULL, summary BLOB NOT NULL, instruction BLOB NOT NULL,
                    source TEXT NOT NULL, source_ref TEXT, tags TEXT NOT NULL,
                    policy TEXT NOT NULL, permission TEXT NOT NULL, status TEXT NOT NULL,
                    confidence REAL NOT NULL, action TEXT, requires_confirmation INTEGER NOT NULL,
                    expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    last_used_at TEXT
                );
                CREATE INDEX IF NOT EXISTS ix_ceda_context_user_status ON context_items(user_id, status);
                CREATE TABLE IF NOT EXISTS policies (
                    user_id INTEGER NOT NULL, category TEXT NOT NULL, rules BLOB NOT NULL,
                    updated_at TEXT NOT NULL, PRIMARY KEY(user_id, category)
                );
                CREATE TABLE IF NOT EXISTS reminders (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, context_id TEXT,
                    title BLOB NOT NULL, due_at TEXT, priority TEXT NOT NULL,
                    confidence REAL NOT NULL, status TEXT NOT NULL, official_verification INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS audit_log (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, action TEXT NOT NULL,
                    resource_type TEXT NOT NULL, resource_id TEXT, category TEXT,
                    detail BLOB, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS context_objects (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, domain TEXT NOT NULL,
                    object_type TEXT NOT NULL, title BLOB NOT NULL, payload BLOB NOT NULL,
                    source BLOB NOT NULL, retention_reason BLOB NOT NULL,
                    confidence REAL NOT NULL, policy_ids TEXT NOT NULL,
                    status TEXT NOT NULL, version INTEGER NOT NULL,
                    expires_at TEXT, last_used_at TEXT, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL, supersedes_id TEXT
                );
                CREATE INDEX IF NOT EXISTS ix_ceda_object_user_status
                    ON context_objects(user_id, status, domain);
                CREATE TABLE IF NOT EXISTS context_versions (
                    context_id TEXT NOT NULL, user_id INTEGER NOT NULL,
                    version INTEGER NOT NULL, snapshot BLOB NOT NULL,
                    reason TEXT NOT NULL, created_at TEXT NOT NULL,
                    PRIMARY KEY(context_id, version)
                );
                CREATE TABLE IF NOT EXISTS context_edges (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
                    source_id TEXT NOT NULL, target_id TEXT NOT NULL,
                    relation TEXT NOT NULL, metadata BLOB NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(user_id, source_id, target_id, relation)
                );
                CREATE TABLE IF NOT EXISTS ceda_events (
                    event_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
                    event_type TEXT NOT NULL, schema_version INTEGER NOT NULL,
                    source_module TEXT NOT NULL, correlation_id TEXT,
                    sensitivity TEXT NOT NULL, payload BLOB NOT NULL,
                    payload_hash TEXT NOT NULL, status TEXT NOT NULL,
                    created_at TEXT NOT NULL, processed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS ix_ceda_event_user_created
                    ON ceda_events(user_id, created_at);
            """)
            self._ensure_column(db, "context_items", "context_object_id", "TEXT")
            self._ensure_column(db, "reminders", "context_item_id", "TEXT")
            self._ensure_column(db, "reminders", "reminder_date", "TEXT")
            self._ensure_column(db, "reminders", "updated_at", "TEXT")
            self._ensure_column(db, "reminders", "version", "INTEGER NOT NULL DEFAULT 1")
            db.execute("""
                CREATE TABLE IF NOT EXISTS kamal_action_undo (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    action_id TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    before_state BLOB NOT NULL,
                    after_state BLOB NOT NULL,
                    consumed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    consumed_at TEXT
                )
            """)
            db.execute("CREATE INDEX IF NOT EXISTS ix_kamal_action_undo_user ON kamal_action_undo(user_id, created_at)")
            for column, declaration in (
                ("layer", "TEXT NOT NULL DEFAULT 'active'"),
                ("workspace", "TEXT NOT NULL DEFAULT 'Personal'"),
                ("short_summary", "BLOB"),
                ("detailed_summary", "BLOB"),
                ("keywords", "TEXT NOT NULL DEFAULT '[]'"),
                ("entities", "TEXT NOT NULL DEFAULT '[]'"),
                ("sensitivity", "TEXT NOT NULL DEFAULT 'private'"),
                ("permissions", "TEXT NOT NULL DEFAULT '[\"owner\"]'"),
                ("allowed_models", "TEXT NOT NULL DEFAULT '[\"local\"]'"),
                ("offline_available", "INTEGER NOT NULL DEFAULT 1"),
                ("cloud_available", "INTEGER NOT NULL DEFAULT 0"),
                ("quality_score", "REAL NOT NULL DEFAULT 0.5"),
                ("content_hash", "TEXT"),
                ("next_review_at", "TEXT"),
            ):
                self._ensure_column(db, "context_objects", column, declaration)
            db.execute("CREATE INDEX IF NOT EXISTS ix_context_objects_hash ON context_objects(user_id,content_hash,status)")

    @staticmethod
    def _ensure_column(db: sqlite3.Connection, table: str, column: str, declaration: str) -> None:
        columns = {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}
        if column not in columns:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")

    def _migrate_approved_candidates(self) -> None:
        """Promote legacy approved candidates without changing their instructions."""
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT * FROM context_items WHERE status='approved' AND context_object_id IS NULL").fetchall()
            for row in rows:
                context_id = self._create_context_object(db, row)
                db.execute("UPDATE context_items SET context_object_id=?,updated_at=? WHERE id=?", (context_id, utcnow(), row["id"]))

    def _encrypt(self, value: str | dict) -> bytes:
        text = json.dumps(value, separators=(",", ":")) if isinstance(value, dict) else value
        return self.cipher.encrypt(text.encode())

    def _decrypt(self, value: bytes) -> str:
        return self.cipher.decrypt(value).decode()

    def policies(self, user_id: int) -> dict:
        result = {key: dict(value) for key, value in DEFAULT_POLICIES.items()}
        with self._connect() as db:
            for row in db.execute("SELECT category, rules FROM policies WHERE user_id=?", (user_id,)):
                result[row["category"]] = json.loads(self._decrypt(row["rules"]))
        return result

    def update_policy(self, user_id: int, category: str, rules: dict) -> dict:
        if category not in DEFAULT_POLICIES:
            raise ValueError("Unknown CEDA policy category")
        merged = {**DEFAULT_POLICIES[category], **rules}
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO policies(user_id,category,rules,updated_at) VALUES(?,?,?,?)", (user_id, category, self._encrypt(merged), utcnow()))
        self.audit(user_id, "policy.updated", "policy", category, category, {"keys": sorted(rules)})
        return merged

    def classify(self, text: str) -> str:
        if re.search(CATEGORY_PATTERNS["preferences"], text, re.I):
            return "preferences"
        for category, pattern in CATEGORY_PATTERNS.items():
            if category == "preferences":
                continue
            if re.search(pattern, text, re.I):
                return category
        return "personal"

    def observe_event(
        self,
        user_id: int,
        event_type: str,
        payload: dict,
        source_module: str,
        event_id: str | None = None,
        correlation_id: str | None = None,
        sensitivity: str = "private",
        schema_version: int = 1,
    ) -> dict:
        """Process an idempotent event and erase its temporary payload after extraction."""
        event_id = event_id or str(uuid.uuid4())
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        payload_hash = hashlib.sha256(canonical.encode()).hexdigest()
        now = utcnow()
        with self._lock, self._connect() as db:
            existing = db.execute("SELECT * FROM ceda_events WHERE event_id=?", (event_id,)).fetchone()
            if existing:
                if existing["user_id"] != user_id or existing["payload_hash"] != payload_hash:
                    raise ValueError("Event ID already exists with different ownership or payload")
                return {"event_id": event_id, "status": existing["status"], "idempotent_replay": True}
            db.execute(
                """INSERT INTO ceda_events
                (event_id,user_id,event_type,schema_version,source_module,correlation_id,sensitivity,payload,payload_hash,status,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (event_id, user_id, event_type, schema_version, source_module, correlation_id,
                 sensitivity, self._encrypt(payload), payload_hash, "observed", now),
            )
        text = str(payload.get("text") or payload.get("message") or "")
        candidate = None
        try:
            candidate = self.capture(user_id, text, source_module, f"event:{event_id}") if text else None
        finally:
            # The event ledger keeps provenance and a hash, never the raw processed payload,
            # even when extraction fails.
            with self._connect() as db:
                db.execute(
                    "UPDATE ceda_events SET payload=?, status='processed', processed_at=? WHERE event_id=?",
                    (self._encrypt({}), utcnow(), event_id),
                )
        self.audit(user_id, "event.processed", "event", event_id, self.classify(text) if text else None,
                   {"event_type": event_type, "candidate_created": bool(candidate)})
        return {"event_id": event_id, "status": "processed", "candidate": candidate, "idempotent_replay": False}

    def capture(self, user_id: int, text: str, source: str, source_ref: str = "") -> dict | None:
        """Chew a message, store only a distilled candidate, and discard the raw text."""
        clean = " ".join(text.strip().split())
        if not clean or not DURABLE_PATTERN.search(clean):
            return None
        category = "credentials" if SECRET_PATTERN.search(clean) else self.classify(clean)
        pie = self.policy_engine.evaluate(user_id, "create_context", domain=category, workspace=category.title(), sensitivity="secret" if category == "credentials" else "sensitive" if category == "immigration" else "private", purpose="Create a durable CEDA context candidate")
        if pie["outcome"] == "deny":
            self.audit(user_id, "context.rejected_by_pie", "context", None, category, {"decision_id": pie["decision_id"]})
            return {"status":"rejected","category":category,"reason":pie["explanation"],"policy_decision_id":pie["decision_id"]}
        policy = self.policies(user_id).get(category, DEFAULT_POLICIES["personal"])
        if policy.get("save") == "never" or category == "credentials":
            self.audit(user_id, "context.rejected_by_policy", "context", None, category, {"source": source})
            return {"status": "rejected", "category": category, "reason": "Policy prevents this sensitive information from being stored."}
        date_match = DATE_PATTERN.search(clean)
        date_value = date_match.group(1) if date_match else ""
        kind = "deadline" if date_value else "preference" if category == "preferences" else "context_instruction"
        subject = re.sub(r"\b(remember|save|store)(?: this)?[:,-]?\s*", "", clean, flags=re.I)
        subject = subject[:280]
        summary = subject[:120] if date_value else f"{category.title()} {kind.replace('_', ' ')}"
        instruction = self._instruction(category, subject, date_value)
        item_id = str(uuid.uuid4())
        now = utcnow()
        retention = int(policy.get("retention_days", 365))
        expires_at = (datetime.now(timezone.utc) + timedelta(days=retention)).isoformat() if retention else None
        action = "create_reminder_suggestion" if date_value else "update_future_context"
        tags = sorted({category, kind, *re.findall(r"#[A-Za-z0-9_-]+", clean)})
        with self._connect() as db:
            db.execute("""INSERT INTO context_items
                (id,user_id,category,kind,summary,instruction,source,source_ref,tags,policy,permission,status,confidence,action,requires_confirmation,expires_at,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (item_id, user_id, category, kind, self._encrypt(summary), self._encrypt(instruction), source, source_ref, json.dumps(tags), f"{category}_context_allowed", "ask_first", "pending", 0.86 if date_value else 0.72, action, 1, expires_at, now, now))
        self.audit(user_id, "context.candidate_created", "context", item_id, category, {"source": source, "kind": kind})
        return {"id": item_id, "status": "pending", "category": category, "kind": kind, "summary": summary, "stored_instruction": instruction, "action": action, "requires_user_confirmation": True, "confidence": 0.86 if date_value else 0.72}

    @staticmethod
    def _instruction(category: str, subject: str, date_value: str) -> str:
        if date_value:
            return f"Track this confirmed {category} item: {subject[:180]}. Its deadline is {date_value}; use it for planning and suggest an advance reminder."
        if re.search(r"never\s+(?:use|include)", subject, re.I):
            return f"Apply this user restriction to future {category} outputs: {subject[:180]}"
        return f"Use this approved {category} preference when relevant: {subject[:180]}"

    def pending(self, user_id: int) -> list[dict]:
        return self._items(user_id, "pending")

    def approved(self, user_id: int, category: str | None = None) -> list[dict]:
        return self._items(user_id, "approved", category)

    def _items(self, user_id: int, status: str, category: str | None = None) -> list[dict]:
        query = "SELECT * FROM context_items WHERE user_id=? AND status=?"
        args: list[object] = [user_id, status]
        if category:
            query += " AND category=?"; args.append(category)
        query += " ORDER BY created_at DESC LIMIT 100"
        with self._connect() as db:
            rows = db.execute(query, args).fetchall()
        return [self._public_item(row) for row in rows]

    def _public_item(self, row: sqlite3.Row) -> dict:
        keys = set(row.keys())
        return {"id": row["id"], "context_object_id": row["context_object_id"] if "context_object_id" in keys else None, "category": row["category"], "kind": row["kind"], "summary": self._decrypt(row["summary"]), "stored_instruction": self._decrypt(row["instruction"]), "source": row["source"], "source_ref": row["source_ref"], "tags": json.loads(row["tags"]), "policy": row["policy"], "permission": row["permission"], "status": row["status"], "confidence": row["confidence"], "action": row["action"], "requires_user_confirmation": bool(row["requires_confirmation"]), "expires_at": row["expires_at"], "created_at": row["created_at"], "last_used_at": row["last_used_at"]}

    def decide(self, user_id: int, item_id: str, approved: bool) -> dict:
        policy_suggestion = None
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM context_items WHERE id=? AND user_id=? AND status='pending'", (item_id, user_id)).fetchone()
            if not row:
                raise ValueError("Pending context item was not found")
            new_status = "approved" if approved else "discarded"
            context_object_id = self._create_context_object(db, row) if approved else None
            db.execute("UPDATE context_items SET status=?, context_object_id=?, updated_at=? WHERE id=?", (new_status, context_object_id, utcnow(), item_id))
            if approved and row["kind"] in {"deadline", "Scheduled Class"}:
                title = self._decrypt(row["instruction"])
                reminder_exists = db.execute("SELECT 1 FROM reminders WHERE user_id=? AND context_id=?", (user_id, context_object_id)).fetchone()
                if not reminder_exists:
                    db.execute("INSERT INTO reminders(id,user_id,context_id,title,due_at,priority,confidence,status,official_verification,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), user_id, context_object_id, self._encrypt(title), None, "high" if row["category"] == "immigration" else "normal", row["confidence"], "suggested", 1 if row["category"] == "immigration" else 0, utcnow()))
            if approved and row["category"] == "preferences":
                instruction = self._decrypt(row["instruction"])
                lowered = instruction.lower()
                inferred_domain = "social" if any(word in lowered for word in ("linkedin","social","instagram","facebook")) else "career" if any(word in lowered for word in ("resume","career","recruiter")) else "academic" if any(word in lowered for word in ("assignment","course","study")) else None
                action = "remind" if "remind" in lowered else "publish" if inferred_domain == "social" else "generate"
                effect = "deny" if "restriction" in lowered or "never" in lowered or "don't" in lowered else "ask" if "ask me" in lowered else "allow"
                policy_suggestion = ("domain" if inferred_domain else "global", inferred_domain, effect, action, instruction)
        if policy_suggestion:
            scope_type, scope_id, effect, action, instruction = policy_suggestion
            self.policy_engine.create_policy(user_id, "CEDA approved preference", scope_type, scope_id, effect, [action], {"reason": instruction, "context_object_id": context_object_id}, "User explicitly approved the CEDA preference", source="ceda_user_approval")
        self.audit(user_id, f"context.{new_status}", "context", item_id, row["category"], None)
        return {**self._public_item(row), "status": new_status, "context_object_id": context_object_id}

    @staticmethod
    def _domain_code(domain: str) -> str:
        return {"academic": "ACA", "immigration": "IMM", "career": "CAR", "social": "SOC", "preferences": "PRE", "personal": "PER"}.get(domain, "CTX")

    def _create_context_object(self, db: sqlite3.Connection, candidate: sqlite3.Row) -> str:
        now = utcnow()
        title = self._decrypt(candidate["summary"])
        payload = {"instruction": self._decrypt(candidate["instruction"]), "tags": json.loads(candidate["tags"]), "action": candidate["action"]}
        content_hash = hashlib.sha256(f"{candidate['category']}|{candidate['kind']}|{payload['instruction'].strip().casefold()}".encode()).hexdigest()
        duplicate = db.execute("SELECT id FROM context_objects WHERE user_id=? AND content_hash=? AND status IN ('active','dormant')", (candidate["user_id"], content_hash)).fetchone()
        if duplicate:
            return duplicate["id"]
        context_id = f"CTX-{self._domain_code(candidate['category'])}-{uuid.uuid4().hex[:10].upper()}"
        source = {"type": candidate["source"], "reference": candidate["source_ref"] or None, "candidate_id": candidate["id"]}
        policy_ids = [candidate["policy"]]
        layer = "persistent" if candidate["category"] == "preferences" else "active"
        workspace = candidate["category"].title()
        keywords = sorted(set(payload["tags"]))
        sensitivity = "sensitive" if candidate["category"] == "immigration" else "private"
        quality_score = round(min(1.0, 0.45 + candidate["confidence"] * 0.4 + (0.1 if source["reference"] else 0) + (0.05 if keywords else 0)), 3)
        next_review = (datetime.now(timezone.utc) + timedelta(days=90 if layer == "active" else 365)).isoformat()
        db.execute(
            """INSERT INTO context_objects
            (id,user_id,domain,object_type,title,payload,source,retention_reason,confidence,policy_ids,status,version,expires_at,created_at,updated_at,
             layer,workspace,short_summary,detailed_summary,keywords,entities,sensitivity,permissions,allowed_models,offline_available,cloud_available,quality_score,content_hash,next_review_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (context_id, candidate["user_id"], candidate["category"], candidate["kind"],
             self._encrypt(title), self._encrypt(payload), self._encrypt(source),
             self._encrypt("Explicit user approval after policy evaluation"), candidate["confidence"],
             json.dumps(policy_ids), "active", 1, candidate["expires_at"], now, now,
             layer, workspace, self._encrypt(title), self._encrypt(payload["instruction"]), json.dumps(keywords), json.dumps([]),
             sensitivity, json.dumps(["owner"]), json.dumps(["local"]), 1, 0, quality_score, content_hash, next_review),
        )
        snapshot = {"title": title, "payload": payload, "source": source, "status": "active", "confidence": candidate["confidence"], "policy_ids": policy_ids, "expires_at": candidate["expires_at"], "layer": layer, "workspace": workspace, "quality_score": quality_score}
        db.execute("INSERT INTO context_versions(context_id,user_id,version,snapshot,reason,created_at) VALUES(?,?,?,?,?,?)", (context_id, candidate["user_id"], 1, self._encrypt(snapshot), "created_from_approved_candidate", now))
        return context_id

    def context_objects(self, user_id: int, domain: str | None = None, status: str = "active") -> list[dict]:
        query = "SELECT * FROM context_objects WHERE user_id=? AND status=?"
        args: list[object] = [user_id, status]
        if domain:
            query += " AND domain=?"; args.append(domain)
        query += " ORDER BY updated_at DESC LIMIT 200"
        with self._connect() as db:
            rows = db.execute(query, args).fetchall()
        return [self._public_object(row) for row in rows]

    def get_context_object(self, user_id: int, context_id: str) -> dict:
        with self._connect() as db:
            row = db.execute("SELECT * FROM context_objects WHERE id=? AND user_id=?", (context_id, user_id)).fetchone()
            if not row:
                raise ValueError("Context Object was not found")
            versions = db.execute("SELECT version,reason,created_at FROM context_versions WHERE context_id=? AND user_id=? ORDER BY version DESC", (context_id, user_id)).fetchall()
            edges = db.execute("SELECT * FROM context_edges WHERE user_id=? AND (source_id=? OR target_id=?) ORDER BY created_at DESC", (user_id, context_id, context_id)).fetchall()
        result = self._public_object(row)
        result["versions"] = [dict(item) for item in versions]
        result["relationships"] = [self._public_edge(item) for item in edges]
        return result

    def _public_object(self, row: sqlite3.Row) -> dict:
        keys = set(row.keys())
        optional_text = lambda name, fallback: self._decrypt(row[name]) if name in keys and row[name] else fallback
        return {"context_id": row["id"], "domain": row["domain"], "type": row["object_type"], "title": self._decrypt(row["title"]), "payload": json.loads(self._decrypt(row["payload"])), "source": json.loads(self._decrypt(row["source"])), "retention_reason": self._decrypt(row["retention_reason"]), "confidence": row["confidence"], "policy_ids": json.loads(row["policy_ids"]), "status": row["status"], "version": row["version"], "expires_at": row["expires_at"], "last_used_at": row["last_used_at"], "created_at": row["created_at"], "updated_at": row["updated_at"], "supersedes_id": row["supersedes_id"], "layer": row["layer"] if "layer" in keys else "active", "workspace": row["workspace"] if "workspace" in keys else row["domain"].title(), "short_summary": optional_text("short_summary", self._decrypt(row["title"])), "detailed_summary": optional_text("detailed_summary", ""), "keywords": json.loads(row["keywords"] or "[]") if "keywords" in keys else [], "entities": json.loads(row["entities"] or "[]") if "entities" in keys else [], "sensitivity": row["sensitivity"] if "sensitivity" in keys else "private", "permissions": json.loads(row["permissions"] or "[]") if "permissions" in keys else ["owner"], "allowed_models": json.loads(row["allowed_models"] or "[]") if "allowed_models" in keys else ["local"], "offline_available": bool(row["offline_available"]) if "offline_available" in keys else True, "cloud_available": bool(row["cloud_available"]) if "cloud_available" in keys else False, "quality_score": row["quality_score"] if "quality_score" in keys else 0.5, "next_review_at": row["next_review_at"] if "next_review_at" in keys else None}

    def update_context_object(self, user_id: int, context_id: str, changes: dict, reason: str) -> dict:
        allowed = {"title", "payload", "confidence", "expires_at"}
        if not changes or set(changes) - allowed:
            raise ValueError("Only title, payload, confidence, and expires_at can be updated")
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM context_objects WHERE id=? AND user_id=? AND status!='deleted'", (context_id, user_id)).fetchone()
            if not row:
                raise ValueError("Context Object was not found")
            current = self._public_object(row)
            title = str(changes.get("title", current["title"]))[:280]
            payload = changes.get("payload", current["payload"])
            confidence = float(changes.get("confidence", current["confidence"]))
            if not 0 <= confidence <= 1:
                raise ValueError("Confidence must be between 0 and 1")
            expires_at = changes.get("expires_at", current["expires_at"])
            version = row["version"] + 1
            now = utcnow()
            snapshot = {**current, "title": title, "payload": payload, "confidence": confidence, "expires_at": expires_at, "version": version}
            db.execute("UPDATE context_objects SET title=?,payload=?,confidence=?,expires_at=?,version=?,updated_at=? WHERE id=?", (self._encrypt(title), self._encrypt(payload), confidence, expires_at, version, now, context_id))
            db.execute("INSERT INTO context_versions(context_id,user_id,version,snapshot,reason,created_at) VALUES(?,?,?,?,?,?)", (context_id, user_id, version, self._encrypt(snapshot), reason[:200], now))
        self.audit(user_id, "context_object.updated", "context_object", context_id, row["domain"], {"version": version, "fields": sorted(changes)})
        return self.get_context_object(user_id, context_id)

    def transition_context_object(self, user_id: int, context_id: str, target: str, reason: str) -> dict:
        transitions = {"active": {"dormant", "archived", "deleted"}, "dormant": {"active", "archived", "deleted"}, "archived": {"active", "deleted"}}
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM context_objects WHERE id=? AND user_id=?", (context_id, user_id)).fetchone()
            if not row:
                raise ValueError("Context Object was not found")
            if target not in transitions.get(row["status"], set()):
                raise ValueError(f"Invalid context transition: {row['status']} -> {target}")
            version = row["version"] + 1
            now = utcnow()
            current = self._public_object(row)
            snapshot = {**current, "status": target, "version": version}
            if target == "deleted":
                db.execute("DELETE FROM context_edges WHERE user_id=? AND (source_id=? OR target_id=?)", (user_id, context_id, context_id))
                db.execute("DELETE FROM context_versions WHERE context_id=? AND user_id=?", (context_id, user_id))
                db.execute("UPDATE context_objects SET title=?,payload=?,source=?,retention_reason=?,status=?,version=?,updated_at=? WHERE id=?", (self._encrypt("Deleted context"), self._encrypt({}), self._encrypt({}), self._encrypt("Securely deleted by user"), target, version, now, context_id))
                snapshot = {"context_id": context_id, "status": "deleted", "version": version}
            else:
                db.execute("UPDATE context_objects SET status=?,version=?,updated_at=? WHERE id=?", (target, version, now, context_id))
            db.execute("INSERT INTO context_versions(context_id,user_id,version,snapshot,reason,created_at) VALUES(?,?,?,?,?,?)", (context_id, user_id, version, self._encrypt(snapshot), reason[:200], now))
        self.audit(user_id, f"context_object.{target}", "context_object", context_id, row["domain"], {"version": version})
        return self.get_context_object(user_id, context_id)

    def link_context(self, user_id: int, source_id: str, target_id: str, relation: str, metadata: dict | None = None) -> dict:
        allowed_relations = {"assigned_to", "depends_on", "generated_from", "requires", "references", "supersedes", "related_to"}
        if relation not in allowed_relations or source_id == target_id:
            raise ValueError("Invalid Context Graph relationship")
        with self._lock, self._connect() as db:
            count = db.execute("SELECT COUNT(*) FROM context_objects WHERE user_id=? AND id IN (?,?) AND status!='deleted'", (user_id, source_id, target_id)).fetchone()[0]
            if count != 2:
                raise ValueError("Both Context Objects must exist and belong to the user")
            edge_id = str(uuid.uuid4())
            try:
                db.execute("INSERT INTO context_edges(id,user_id,source_id,target_id,relation,metadata,created_at) VALUES(?,?,?,?,?,?,?)", (edge_id, user_id, source_id, target_id, relation, self._encrypt(metadata or {}), utcnow()))
            except sqlite3.IntegrityError:
                row = db.execute("SELECT * FROM context_edges WHERE user_id=? AND source_id=? AND target_id=? AND relation=?", (user_id, source_id, target_id, relation)).fetchone()
                return {**self._public_edge(row), "idempotent_replay": True}
            row = db.execute("SELECT * FROM context_edges WHERE id=?", (edge_id,)).fetchone()
        self.audit(user_id, "context.linked", "context_edge", edge_id, None, {"relation": relation})
        return {**self._public_edge(row), "idempotent_replay": False}

    def _public_edge(self, row: sqlite3.Row) -> dict:
        return {"edge_id": row["id"], "source_id": row["source_id"], "target_id": row["target_id"], "relation": row["relation"], "metadata": json.loads(self._decrypt(row["metadata"])), "created_at": row["created_at"]}

    def context_for_request(self, user_id: int, request: str, interface: str) -> str:
        category = self.classify(request)
        allowed = [category, "preferences", "personal"]
        if re.search(r"\b(social|linkedin|medium|reddit|instagram|facebook|whatsapp)\b", request, re.I):
            allowed = ["social", "career", "preferences"]
        placeholders = ",".join("?" for _ in allowed)
        now = utcnow()
        with self._connect() as db:
            objects = db.execute(f"SELECT * FROM context_objects WHERE user_id=? AND status='active' AND domain IN ({placeholders}) AND (expires_at IS NULL OR expires_at>?) ORDER BY confidence DESC, updated_at DESC LIMIT 12", [user_id, *allowed, now]).fetchall()
            legacy = db.execute(f"SELECT * FROM context_items WHERE user_id=? AND status='approved' AND context_object_id IS NULL AND category IN ({placeholders}) AND (expires_at IS NULL OR expires_at>?) ORDER BY confidence DESC, updated_at DESC LIMIT 12", [user_id, *allowed, now]).fetchall()
            if objects:
                db.executemany("UPDATE context_objects SET last_used_at=? WHERE id=?", [(now, row["id"]) for row in objects])
            if legacy:
                db.executemany("UPDATE context_items SET last_used_at=? WHERE id=?", [(now, row["id"]) for row in legacy])
        if not objects and not legacy:
            return "No approved durable CEDA context is relevant. Do not infer private facts."
        instructions = []
        for row in objects:
            payload = json.loads(self._decrypt(row["payload"]))
            instructions.append(f"- [{row['domain']}; policies={','.join(json.loads(row['policy_ids']))}; context={row['id']}] {payload.get('instruction', '')}")
        instructions.extend(f"- [{row['category']}; policy={row['policy']}; legacy] {self._decrypt(row['instruction'])}" for row in legacy)
        self.audit(user_id, "context.loaded", "request", None, category, {"interface": interface, "count": len(instructions)})
        return "CEDA APPROVED CONTEXT (structured instructions only):\n" + "\n".join(instructions)

    def expire_due_context(self, user_id: int) -> int:
        now = utcnow()
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT id FROM context_objects WHERE user_id=? AND status IN ('active','dormant') AND expires_at IS NOT NULL AND expires_at<=?", (user_id, now)).fetchall()
        for row in rows:
            self.transition_context_object(user_id, row["id"], "archived", "retention_period_expired")
        return len(rows)

    def reminders(self, user_id: int) -> list[dict]:
        with self._lock, self._connect() as db:
            self._ensure_column(db, "reminders", "context_item_id", "TEXT")
            self._ensure_column(db, "reminders", "reminder_date", "TEXT")
            self._ensure_column(db, "reminders", "updated_at", "TEXT")
            self._ensure_column(db, "reminders", "version", "INTEGER NOT NULL DEFAULT 1")
            rows = db.execute(
                """SELECT * FROM reminders
                WHERE user_id=?
                ORDER BY
                  CASE WHEN COALESCE(due_at, reminder_date) IS NULL OR COALESCE(due_at, reminder_date)='' THEN 1 ELSE 0 END,
                  COALESCE(due_at, reminder_date, created_at) ASC,
                  created_at DESC
                LIMIT 100""",
                (user_id,),
            ).fetchall()
        return [self._public_reminder(row) for row in rows]

    def _public_reminder(self, row: sqlite3.Row) -> dict:
        keys = set(row.keys())
        official_verification = bool(row["official_verification"])
        return {
            "id": row["id"],
            "context_id": row["context_id"],
            "context_item_id": row["context_item_id"] if "context_item_id" in keys else None,
            "title": self._decrypt(row["title"]),
            "due_at": row["due_at"],
            "reminder_date": row["reminder_date"] if "reminder_date" in keys else None,
            "priority": row["priority"],
            "confidence": row["confidence"],
            "status": row["status"],
            "version": row["version"] if "version" in keys else 1,
            "official_verification_required": official_verification,
            "disclaimer": IMMIGRATION_DISCLAIMER if official_verification else None,
            "created_at": row["created_at"] if "created_at" in keys else None,
            "updated_at": row["updated_at"] if "updated_at" in keys else None,
        }

    def _create_reminder_context_object(
        self,
        db: sqlite3.Connection,
        user_id: int,
        title: str,
        due_at: str | None,
        priority: str,
        source: str,
    ) -> str:
        now = utcnow()
        policy_ids = ["personal_context_allowed"]
        payload = {
            "instruction": f"Track this confirmed reminder: {title}. Use it in planning, Calendar & Timeline, Upcoming, My Day, and Tasks.",
            "action": "local_reminder",
            "due_at": due_at,
            "priority": priority,
            "tags": ["personal", "reminder", "calendar"],
        }
        content_hash = hashlib.sha256(f"personal|reminder|{title.strip().casefold()}|{due_at or ''}".encode()).hexdigest()
        duplicate = db.execute(
            "SELECT id FROM context_objects WHERE user_id=? AND content_hash=? AND status IN ('active','dormant')",
            (user_id, content_hash),
        ).fetchone()
        if duplicate:
            return duplicate["id"]
        context_id = f"CTX-PER-{uuid.uuid4().hex[:10].upper()}"
        expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        source_payload = {"type": source, "reference": "local_calendar_reminder", "reminder_created": True}
        db.execute(
            """INSERT INTO context_objects
            (id,user_id,domain,object_type,title,payload,source,retention_reason,confidence,policy_ids,status,version,expires_at,created_at,updated_at,
             layer,workspace,short_summary,detailed_summary,keywords,entities,sensitivity,permissions,allowed_models,offline_available,cloud_available,quality_score,content_hash,next_review_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                context_id,
                user_id,
                "personal",
                "reminder",
                self._encrypt(title),
                self._encrypt(payload),
                self._encrypt(source_payload),
                self._encrypt("Confirmed by user through Kamal or Calendar before storage"),
                0.92,
                json.dumps(policy_ids),
                "active",
                1,
                expires_at,
                now,
                now,
                "active",
                "Personal",
                self._encrypt(title),
                self._encrypt(payload["instruction"]),
                json.dumps(payload["tags"]),
                json.dumps([]),
                "private",
                json.dumps(["owner"]),
                json.dumps(["local"]),
                1,
                0,
                0.9,
                content_hash,
                (datetime.now(timezone.utc) + timedelta(days=90)).isoformat(),
            ),
        )
        snapshot = {"title": title, "payload": payload, "source": source_payload, "status": "active", "confidence": 0.92, "policy_ids": policy_ids, "expires_at": expires_at, "layer": "active", "workspace": "Personal", "quality_score": 0.9}
        db.execute("INSERT INTO context_versions(context_id,user_id,version,snapshot,reason,created_at) VALUES(?,?,?,?,?,?)", (context_id, user_id, 1, self._encrypt(snapshot), "created_from_confirmed_local_reminder", now))
        return context_id

    def create_local_reminder(
        self,
        user_id: int,
        title: str,
        due_at: str | None = None,
        reminder_date: str | None = None,
        priority: str = "normal",
        source: str = "kamal",
    ) -> dict:
        clean_title = " ".join((title or "Reminder").split())[:280] or "Reminder"
        clean_priority = priority if priority in {"low", "normal", "high", "critical"} else "normal"
        now = utcnow()
        reminder_id = f"REM-{uuid.uuid4().hex[:12].upper()}"
        with self._lock, self._connect() as db:
            self._ensure_column(db, "reminders", "context_item_id", "TEXT")
            self._ensure_column(db, "reminders", "reminder_date", "TEXT")
            self._ensure_column(db, "reminders", "updated_at", "TEXT")
            self._ensure_column(db, "reminders", "version", "INTEGER NOT NULL DEFAULT 1")
            context_id = self._create_reminder_context_object(db, user_id, clean_title, due_at, clean_priority, source)
            db.execute(
                """INSERT INTO reminders
                (id,user_id,context_id,context_item_id,title,due_at,reminder_date,priority,confidence,status,official_verification,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    reminder_id,
                    user_id,
                    context_id,
                    None,
                    self._encrypt(clean_title),
                    due_at,
                    reminder_date or due_at,
                    clean_priority,
                    0.92,
                    "active",
                    0,
                    now,
                    now,
                ),
            )
            row = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user_id)).fetchone()
        self.audit(user_id, "reminder.created", "reminder", reminder_id, "personal", {"source": source, "due_at": due_at, "context_id": context_id})
        self.audit(user_id, "context_object.created_from_reminder", "context_object", context_id, "personal", {"reminder_id": reminder_id})
        return self._public_reminder(row)

    def update_local_reminder(
        self,
        user_id: int,
        reminder_id: str,
        title: str | None = None,
        due_at: str | None = None,
        reminder_date: str | None = None,
        priority: str | None = None,
        status: str | None = None,
    ) -> dict:
        with self._lock, self._connect() as db:
            self._ensure_column(db, "reminders", "context_item_id", "TEXT")
            self._ensure_column(db, "reminders", "reminder_date", "TEXT")
            self._ensure_column(db, "reminders", "updated_at", "TEXT")
            self._ensure_column(db, "reminders", "version", "INTEGER NOT NULL DEFAULT 1")
            row = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user_id)).fetchone()
            if not row:
                raise ValueError("Reminder was not found")
            next_title = " ".join((title or self._decrypt(row["title"])).split())[:280] or "Reminder"
            next_due_at = due_at if due_at is not None else row["due_at"]
            next_reminder_date = reminder_date if reminder_date is not None else (row["reminder_date"] if "reminder_date" in row.keys() else row["due_at"])
            next_priority = priority if priority in {"low", "normal", "high", "critical"} else row["priority"]
            next_status = status if status in {"active", "suggested", "completed", "archived", "deleted"} else row["status"]
            now = utcnow()
            changed_fields = []
            if next_title != self._decrypt(row["title"]):
                changed_fields.append("title")
            if next_due_at != row["due_at"]:
                changed_fields.append("due_at")
            if next_reminder_date != (row["reminder_date"] if "reminder_date" in row.keys() else row["due_at"]):
                changed_fields.append("reminder_date")
            if next_priority != row["priority"]:
                changed_fields.append("priority")
            if next_status != row["status"]:
                changed_fields.append("status")
            db.execute(
                "UPDATE reminders SET title=?, due_at=?, reminder_date=?, priority=?, status=?, updated_at=?, version=COALESCE(version,1)+1 WHERE id=? AND user_id=?",
                (self._encrypt(next_title), next_due_at, next_reminder_date or next_due_at, next_priority, next_status, now, reminder_id, user_id),
            )
            context_id = row["context_id"]
            if context_id:
                context_status = "dormant" if next_status == "completed" else "archived" if next_status in {"archived", "deleted"} else "active"
                payload = {
                    "instruction": f"Track this confirmed reminder: {next_title}. Use it in planning, Calendar & Timeline, Upcoming, My Day, and Tasks.",
                    "action": "local_reminder",
                    "reminder_status": next_status,
                    "due_at": next_due_at,
                    "priority": next_priority,
                    "tags": ["personal", "reminder", "calendar"],
                }
                db.execute(
                    "UPDATE context_objects SET title=?, payload=?, short_summary=?, detailed_summary=?, status=?, updated_at=? WHERE id=? AND user_id=? AND status!='deleted'",
                    (self._encrypt(next_title), self._encrypt(payload), self._encrypt(next_title), self._encrypt(payload["instruction"]), context_status, now, context_id, user_id),
                )
            updated = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user_id)).fetchone()
        self.audit(user_id, "reminder.updated", "reminder", reminder_id, "personal", {"context_id": row["context_id"], "changed_fields": changed_fields})
        return self._public_reminder(updated)

    def delete_local_reminder(self, user_id: int, reminder_id: str) -> dict:
        with self._lock, self._connect() as db:
            self._ensure_column(db, "reminders", "updated_at", "TEXT")
            self._ensure_column(db, "reminders", "version", "INTEGER NOT NULL DEFAULT 1")
            row = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user_id)).fetchone()
            if not row:
                raise ValueError("Reminder was not found")
            now = utcnow()
            db.execute("UPDATE reminders SET status='deleted', updated_at=?, version=COALESCE(version,1)+1 WHERE id=? AND user_id=?", (now, reminder_id, user_id))
            if row["context_id"]:
                db.execute("UPDATE context_objects SET status='archived', updated_at=? WHERE id=? AND user_id=? AND status!='deleted'", (now, row["context_id"], user_id))
            updated = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user_id)).fetchone()
        self.audit(user_id, "reminder.deleted", "reminder", reminder_id, "personal", {"context_id": row["context_id"]})
        return self._public_reminder(updated)

    def dashboard(self, user_id: int) -> dict:
        expired = self.expire_due_context(user_id)
        with self._connect() as db:
            counts = {row["status"]: row["count"] for row in db.execute("SELECT status, COUNT(*) count FROM context_items WHERE user_id=? GROUP BY status", (user_id,))}
            has_structured = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ceda_items'").fetchone()
            structured_pending = db.execute("SELECT COUNT(*) FROM ceda_items WHERE user_id=? AND status='pending_review'",(user_id,)).fetchone()[0] if has_structured else 0
            categories = {row["category"]: row["count"] for row in db.execute("SELECT category, COUNT(*) count FROM context_items WHERE user_id=? AND status='approved' GROUP BY category", (user_id,))}
            reminder_count = db.execute("SELECT COUNT(*) FROM reminders WHERE user_id=? AND status IN ('suggested','active')", (user_id,)).fetchone()[0]
            object_states = {row["status"]: row["count"] for row in db.execute("SELECT status,COUNT(*) count FROM context_objects WHERE user_id=? GROUP BY status", (user_id,))}
            graph_edges = db.execute("SELECT COUNT(*) FROM context_edges WHERE user_id=?", (user_id,)).fetchone()[0]
            event_count = db.execute("SELECT COUNT(*) FROM ceda_events WHERE user_id=?", (user_id,)).fetchone()[0]
        total = sum(counts.values())
        approved = counts.get("approved", 0)
        return {"edition": settings.WORKSPACE_NAME, "workspace": str(self.root), "working_memory": "temporary", "context_items": counts, "context_objects": object_states, "context_graph_edges": graph_edges, "processed_events": event_count, "expired_archived": expired, "categories": categories, "pending_approvals": structured_pending if has_structured else counts.get("pending", 0), "upcoming_reminders": reminder_count, "context_health_score": min(100, 20 + approved * 8), "privacy_risk_score": min(100, structured_pending * 5), "offline_first": True, "cloud_enabled": False, "storage_mode": "encrypted structured metadata; external document references", "chew_throw": True}

    def audit(self, user_id: int, action: str, resource_type: str, resource_id: str | None, category: str | None, detail: dict | None) -> None:
        with self._connect() as db:
            db.execute("INSERT INTO audit_log(id,user_id,action,resource_type,resource_id,category,detail,created_at) VALUES(?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), user_id, action, resource_type, resource_id, category, self._encrypt(detail or {}), utcnow()))


ceda_service = CEDAService()
