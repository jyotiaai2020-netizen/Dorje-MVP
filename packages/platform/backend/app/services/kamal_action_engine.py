from __future__ import annotations

from dataclasses import dataclass
import json
import re
import uuid
from typing import Any, Literal

from app.services.ceda_service import CEDAService, ceda_service, utcnow


KamalOperation = Literal[
    "CREATE",
    "READ",
    "SEARCH",
    "UPDATE",
    "COMPLETE",
    "REOPEN",
    "MOVE",
    "ARCHIVE",
    "DELETE",
    "RESTORE",
    "UNDO",
]

TaskStatus = Literal["active", "suggested", "completed", "archived", "deleted"]

ACTIVE_EXCLUDED_STATUSES = {"deleted"}
TERMINAL_FOR_SEARCH = {"deleted"}
ALLOWED_MUTATION_FIELDS = {"status", "title", "due_at", "reminder_date", "priority"}


@dataclass(frozen=True)
class ParsedKamalAction:
    operation: KamalOperation
    query: str
    target_status: TaskStatus | None


class KamalActionError(ValueError):
    def __init__(self, message: str, *, code: str = "invalid_action") -> None:
        super().__init__(message)
        self.code = code


class KamalActionEngine:
    """Typed, user-scoped Action Engine for Kamal app-control mutations.

    KamalChat may collect input and render previews, but all record search,
    authorization, mutation, CEDA synchronization, audit, and undo are handled
    here. The engine intentionally supports an allowlisted command surface only.
    """

    def __init__(self, ceda: CEDAService = ceda_service) -> None:
        self.ceda = ceda

    def parse_message(self, message: str) -> ParsedKamalAction:
        text = " ".join((message or "").split())
        lower = text.lower()
        if re.search(r"\b(tell|show|list|what|which|how many|count|total|do i have)\b", lower):
            raise KamalActionError("Task read and count requests are handled by the task query path.", code="unsupported_intent")
        if re.search(r"\bundo\b|\brestore the last\b|\brevert the last\b", lower):
            return ParsedKamalAction("UNDO", "", None)
        reopen_requested = (
            re.search(r"\b(reopen|not done|not completed|not complete|incomplete again)\b", lower)
            or re.search(r"\bmark\b.{0,80}\bincomplete\b", lower)
            or re.search(r"\b(move|put|set|send|change|return|restore)\b.{0,120}\b(back to active|to active|as active|active task|active reminder)\b", lower)
        )
        if reopen_requested:
            return ParsedKamalAction("REOPEN", self._clean_query(text, "reopen"), "active")
        if (
            re.search(r"\b(mark|complete|finish|completed)\b", lower)
            or re.search(r"\bas completed\b|\bto completed\b", lower)
            or re.search(r"\b(?:bill|task|reminder|todo|to-do).{0,60}\bis done\b", lower)
            or re.search(r"\bis done\b", lower)
        ) and re.search(r"\b(task|reminder|todo|to-do|bill|is done|completed)\b", lower):
            return ParsedKamalAction("COMPLETE", self._clean_query(text, "complete"), "completed")
        raise KamalActionError("I can only modify tasks and reminders through the Action Engine when the requested operation is clear.", code="unsupported_intent")

    def preview(self, *, user_id: int, message: str, source: Literal["voice", "text"] = "text") -> dict[str, Any]:
        parsed = self.parse_message(message)
        if parsed.operation == "UNDO":
            latest = self._latest_undo(user_id)
            if not latest:
                return {"status": "not_found", "message": "There is no recent task change to undo.", "action": self._action(parsed, source)}
            return {
                "status": "preview",
                "message": "Undo the last task status change?",
                "action": self._action(parsed, source, latest["entity_id"], changes={"undo_token": latest["token"], "status": latest["before"]["status"]}),
                "item": latest["after"],
                "before": latest["after"],
                "after": latest["before"],
                "undo_token": latest["token"],
                "requires_confirmation": True,
            }

        matches = self.search(user_id=user_id, query=parsed.query, include_completed=parsed.operation == "REOPEN")
        action = self._action(parsed, source)
        if not matches:
            return {
                "status": "not_found",
                "message": f"I could not find an active task or reminder matching “{parsed.query or message}”. Nothing was changed.",
                "action": action,
                "requires_confirmation": False,
            }
        if len(matches) > 1:
            return {
                "status": "clarification_required",
                "message": "I found more than one matching task. Please choose one before I change anything.",
                "action": action,
                "candidates": [
                    self._candidate(
                        match,
                        action=self._action(parsed, source, match["id"], expected_version=match["version"], changes={"status": parsed.target_status}),
                    )
                    for match in matches
                ],
                "requires_confirmation": False,
            }

        match = matches[0]
        current_status = match["status"]
        proposed_status = parsed.target_status or current_status
        action = self._action(parsed, source, match["id"], expected_version=match["version"], changes={"status": proposed_status})
        return {
            "status": "preview",
            "message": "Please confirm this task update.",
            "action": action,
            "item": self._candidate(match),
            "before": {"status": current_status},
            "after": {"status": proposed_status},
            "requires_confirmation": True,
        }

    def execute(self, *, user_id: int, action: dict[str, Any]) -> dict[str, Any]:
        operation = str(action.get("operation") or "").upper()
        if operation == "UNDO":
            changes = dict(action.get("changes") or {})
            token = str(action.get("undoToken") or action.get("undo_token") or changes.get("undo_token") or "")
            if not token:
                latest = self._latest_undo(user_id)
                token = latest["token"] if latest else ""
            return self.undo(user_id=user_id, undo_token=token)
        if operation not in {"COMPLETE", "REOPEN", "ARCHIVE", "DELETE", "RESTORE", "UPDATE"}:
            raise KamalActionError("That task operation is not allowlisted.", code="invalid_operation")
        entity_type = action.get("entityType") or action.get("entity_type")
        if entity_type not in {"task", "reminder"}:
            raise KamalActionError("Kamal can modify only tasks and reminders through this action.", code="invalid_entity")
        entity_id = str(action.get("entityId") or action.get("entity_id") or "")
        if not entity_id:
            raise KamalActionError("A selected task or reminder ID is required before mutation.", code="missing_entity")
        changes = dict(action.get("changes") or {})
        if not changes:
            changes = {"status": "completed" if operation == "COMPLETE" else "active" if operation == "REOPEN" else None}
        invalid_fields = set(changes) - ALLOWED_MUTATION_FIELDS
        if invalid_fields:
            raise KamalActionError(f"Invalid task fields: {', '.join(sorted(invalid_fields))}", code="invalid_fields")
        next_status = changes.get("status")
        if next_status not in {"active", "suggested", "completed", "archived", "deleted"}:
            raise KamalActionError("Only allowlisted task statuses can be applied.", code="invalid_status")
        expected_version = action.get("expectedVersion") or action.get("expected_version")
        return self._apply_status(user_id=user_id, reminder_id=entity_id, next_status=str(next_status), expected_version=expected_version, operation=operation)

    def undo(self, *, user_id: int, undo_token: str) -> dict[str, Any]:
        if not undo_token:
            raise KamalActionError("There is no undo token available.", code="missing_undo_token")
        with self.ceda._lock, self.ceda._connect() as db:
            self._ensure_action_tables(db)
            undo = db.execute("SELECT * FROM kamal_action_undo WHERE token=? AND user_id=?", (undo_token, user_id)).fetchone()
            if not undo:
                raise KamalActionError("Undo token was not found for this user.", code="undo_not_found")
            if undo["consumed"]:
                raise KamalActionError("That undo action has already been used.", code="undo_consumed")
            before = self.ceda._decrypt(undo["before_state"])
            before_state = json.loads(before)
            row = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (undo["entity_id"], user_id)).fetchone()
            if not row:
                raise KamalActionError("The task no longer exists.", code="not_found")
            now = utcnow()
            db.execute(
                "UPDATE reminders SET status=?, updated_at=?, version=COALESCE(version,1)+1 WHERE id=? AND user_id=?",
                (before_state["status"], now, undo["entity_id"], user_id),
            )
            self._sync_context_status(db, user_id, row["context_id"], before_state["status"], now)
            db.execute("UPDATE kamal_action_undo SET consumed=1, consumed_at=? WHERE token=? AND user_id=?", (now, undo_token, user_id))
            updated = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (undo["entity_id"], user_id)).fetchone()
            self._audit_in_tx(db, user_id, "kamal_action.undo", "reminder", undo["entity_id"], ["status"], undo["action_id"])
        return {"status": "success", "message": "Undo complete.", "item": self.ceda._public_reminder(updated), "undo_token": None}

    def search(self, *, user_id: int, query: str, include_completed: bool = False) -> list[dict[str, Any]]:
        query_words = self._query_words(query)
        with self.ceda._lock, self.ceda._connect() as db:
            self._ensure_action_tables(db)
            rows = db.execute("SELECT * FROM reminders WHERE user_id=? AND status NOT IN ('deleted')", (user_id,)).fetchall()
        scored = []
        for row in rows:
            public = self.ceda._public_reminder(row)
            if not include_completed and public["status"] == "completed":
                continue
            if include_completed and public["status"] != "completed":
                # Reopen commands should target completed records first and avoid
                # accidentally reopening active items.
                continue
            score = self._score(public["title"], query_words)
            if score > 0:
                scored.append((score, public))
        scored.sort(key=lambda item: (-item[0], item[1].get("due_at") or ""))
        if include_completed and not query_words:
            return [self.ceda._public_reminder(row) for row in rows if self.ceda._public_reminder(row)["status"] == "completed"]
        if not scored:
            return []
        top_score = scored[0][0]
        return [item for score, item in scored if score == top_score or score >= max(1, top_score - 1)]

    def _apply_status(self, *, user_id: int, reminder_id: str, next_status: str, expected_version: Any, operation: str) -> dict[str, Any]:
        with self.ceda._lock, self.ceda._connect() as db:
            self._ensure_action_tables(db)
            row = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user_id)).fetchone()
            if not row or row["status"] == "deleted":
                raise KamalActionError("Task or reminder was not found.", code="not_found")
            current_version = int(row["version"] if "version" in row.keys() else 1)
            if expected_version is not None and int(expected_version) != current_version:
                raise KamalActionError("This task changed after the preview. Refresh and try again.", code="stale_version")
            before = self.ceda._public_reminder(row)
            if before["status"] == next_status:
                self._audit_in_tx(db, user_id, "kamal_action.idempotent", "reminder", reminder_id, [], str(uuid.uuid4()))
                return {"status": "success", "message": "No change was needed.", "item": before, "undo_token": None, "idempotent": True}
            now = utcnow()
            db.execute(
                "UPDATE reminders SET status=?, updated_at=?, version=COALESCE(version,1)+1 WHERE id=? AND user_id=?",
                (next_status, now, reminder_id, user_id),
            )
            self._sync_context_status(db, user_id, row["context_id"], next_status, now)
            updated = db.execute("SELECT * FROM reminders WHERE id=? AND user_id=?", (reminder_id, user_id)).fetchone()
            after = self.ceda._public_reminder(updated)
            action_id = str(uuid.uuid4())
            undo_token = f"UNDO-{uuid.uuid4().hex[:16].upper()}"
            db.execute(
                "INSERT INTO kamal_action_undo(token,user_id,action_id,entity_type,entity_id,operation,before_state,after_state,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (undo_token, user_id, action_id, "reminder", reminder_id, operation, self.ceda._encrypt(before), self.ceda._encrypt(after), now),
            )
            self._audit_in_tx(db, user_id, f"kamal_action.{operation}", "reminder", reminder_id, ["status"], action_id)
        return {"status": "success", "message": "Task updated.", "item": after, "undo_token": undo_token, "idempotent": False}

    def _sync_context_status(self, db: Any, user_id: int, context_id: str | None, reminder_status: str, now: str) -> None:
        if not context_id:
            return
        context_status = "dormant" if reminder_status == "completed" else "archived" if reminder_status in {"archived", "deleted"} else "active"
        result = db.execute(
            "UPDATE context_objects SET status=?, updated_at=? WHERE id=? AND user_id=? AND status!='deleted'",
            (context_status, now, context_id, user_id),
        )
        if result.rowcount == 0:
            self._audit_in_tx(db, user_id, "kamal_action.ceda_sync_missing", "context_object", context_id, ["status"], str(uuid.uuid4()))

    def _latest_undo(self, user_id: int) -> dict[str, Any] | None:
        with self.ceda._lock, self.ceda._connect() as db:
            self._ensure_action_tables(db)
            row = db.execute("SELECT * FROM kamal_action_undo WHERE user_id=? AND consumed=0 ORDER BY created_at DESC LIMIT 1", (user_id,)).fetchone()
            if not row:
                return None
            return {
                "token": row["token"],
                "entity_id": row["entity_id"],
                "before": json.loads(self.ceda._decrypt(row["before_state"])),
                "after": json.loads(self.ceda._decrypt(row["after_state"])),
            }

    def _ensure_action_tables(self, db: Any) -> None:
        self.ceda._ensure_column(db, "reminders", "context_item_id", "TEXT")
        self.ceda._ensure_column(db, "reminders", "reminder_date", "TEXT")
        self.ceda._ensure_column(db, "reminders", "updated_at", "TEXT")
        self.ceda._ensure_column(db, "reminders", "version", "INTEGER NOT NULL DEFAULT 1")
        db.execute(
            """CREATE TABLE IF NOT EXISTS kamal_action_undo (
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
            )"""
        )

    def _audit_in_tx(self, db: Any, user_id: int, action: str, resource_type: str, resource_id: str | None, changed_fields: list[str], action_id: str) -> None:
        detail = {"action_id": action_id, "changed_fields": changed_fields}
        db.execute(
            "INSERT INTO audit_log(id,user_id,action,resource_type,resource_id,category,detail,created_at) VALUES(?,?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), user_id, action, resource_type, resource_id, "personal", self.ceda._encrypt(detail), utcnow()),
        )

    def _candidate(self, item: dict[str, Any], action: dict[str, Any] | None = None) -> dict[str, Any]:
        candidate = {
            "id": item["id"],
            "title": item["title"],
            "due_at": item.get("due_at") or item.get("reminder_date"),
            "reminder_date": item.get("reminder_date"),
            "status": item["status"],
            "priority": item.get("priority"),
            "version": item.get("version", 1),
        }
        if action:
            candidate["action"] = action
        return candidate

    def _action(self, parsed: ParsedKamalAction, source: str, entity_id: str | None = None, expected_version: int | None = None, changes: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "actionId": str(uuid.uuid4()),
            "operation": parsed.operation,
            "entityType": "task",
            "entityId": entity_id,
            "query": parsed.query,
            "changes": changes or ({"status": parsed.target_status} if parsed.target_status else {}),
            "source": source,
            "requiresConfirmation": parsed.operation != "READ",
            "expectedVersion": expected_version,
        }

    def _clean_query(self, text: str, mode: str) -> str:
        cleaned = re.sub(r"\bkamal\b", " ", text, flags=re.I)
        cleaned = re.sub(r"\b(please|can you|could you|my|the|this|that|it|current|existing|put|set|make|who|is)\b", " ", cleaned, flags=re.I)
        if mode == "complete":
            cleaned = re.sub(r"\b(mark|complete|finish|finished|completed|done|is done|as completed|to completed)\b", " ", cleaned, flags=re.I)
        if mode == "reopen":
            cleaned = re.sub(r"\b(reopen|mark|move|send|change|return|restore|incomplete|again|not done|not completed|not complete|active|as active|to active|back to active|active task|active reminder)\b", " ", cleaned, flags=re.I)
            cleaned = re.sub(r"\b(as|to|and)\b", " ", cleaned, flags=re.I)
        cleaned = re.sub(r"\b(task|tasks|reminder|reminders|todo|to-do|item|status)\b", " ", cleaned, flags=re.I)
        return " ".join(cleaned.split()).strip()

    def _query_words(self, query: str) -> list[str]:
        return [word for word in re.findall(r"[a-z0-9]+", query.lower()) if (len(word) > 2 or word.isdigit()) and word not in {"the", "task", "reminder", "that", "this", "it", "to", "as", "and"}]

    def _score(self, title: str, query_words: list[str]) -> int:
        if not query_words:
            return 0
        title_words = set(re.findall(r"[a-z0-9]+", title.lower()))
        return sum(1 for word in query_words if word in title_words)


kamal_action_engine = KamalActionEngine()
