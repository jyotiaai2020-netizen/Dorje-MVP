"""SQL-backed Context Graph service.

The graph is deliberately stored in structured tables. This keeps Student-LAD
local-first and SQLite-friendly while exposing graph-style APIs that can later
be backed by PostgreSQL or an enterprise graph store without changing callers.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import json
import re
import sqlite3
import uuid

from app.services.ceda_service import CEDAService, ceda_service


DEFAULT_ORGANIZATION_ID = "local"
DEFAULT_WORKSPACE_ID = "default"

DEFAULT_RELATIONSHIP_DEFINITIONS = (
    ("related_to", "general", "General bidirectional relevance between two records."),
    ("depends_on", "general", "The source cannot progress until the target is complete or available."),
    ("requires", "general", "The source requires the target as an input, prerequisite, or resource."),
    ("sourced_from", "provenance", "The source was extracted, generated, or verified from the target."),
    ("generated_from", "provenance", "The source was generated from the target."),
    ("governed_by_policy", "policy", "The source is governed by the target policy."),
    ("supersedes", "lifecycle", "The source replaces or supersedes the target."),
    ("has_assignment", "academic", "A course or academic unit has an assignment."),
    ("belongs_to_course", "academic", "An academic record belongs to a course."),
    ("has_exam", "academic", "A course or academic unit has an exam or quiz."),
    ("has_note", "academic", "A course or academic record has an associated note."),
    ("has_reading", "academic", "A course or assignment has a reading source."),
    ("has_deadline", "planning", "The source has a deadline represented by the target."),
    ("created_reminder", "planning", "The source created or requested a reminder."),
    ("has_expiry", "immigration", "The source has an expiration date or milestone."),
    ("requires_verification", "immigration", "The source requires official verification."),
    ("uses_resume", "career", "The source uses the target resume."),
    ("linked_to_recruiter", "career", "The source is linked to a recruiter/contact."),
    ("belongs_to_application", "career", "The source belongs to a career application."),
    ("requires_followup", "career", "The source requires a follow-up action."),
    ("used_for", "usage", "The source is used for the target purpose or output."),
    ("blocked_by", "risk", "The source is blocked by the target issue, policy, or dependency."),
)

ARCHITECTURE_POLICY_ROWS = (
    ("stable_unique_ids_required", "Every durable record must have a stable unique ID before it can be referenced."),
    ("relationship_definitions_required", "Every relationship must use a controlled relationship definition."),
    ("policy_check_required", "Every create/update/link operation must pass Policy Intelligence Engine evaluation."),
    ("audit_all_record_changes", "Every record and relationship change must create an audit event."),
    ("relationship_nodes_must_be_referenceable", "Relationship endpoints must point to registered records or Context Objects."),
)

VALID_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$")


class ContextGraphService:
    def __init__(self, ceda: CEDAService) -> None:
        self.ceda = ceda
        self._initialize()
        self._seed_defaults()
        self._migrate_legacy_edges()

    @staticmethod
    def now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _initialize(self) -> None:
        with self.ceda._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS relationship_definitions (
                    relationship_type TEXT PRIMARY KEY,
                    domain TEXT NOT NULL,
                    description TEXT NOT NULL,
                    inverse_type TEXT,
                    allowed_source_types TEXT NOT NULL DEFAULT '[]',
                    allowed_target_types TEXT NOT NULL DEFAULT '[]',
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS data_storage_architecture_policies (
                    policy_key TEXT PRIMARY KEY,
                    description TEXT NOT NULL,
                    required INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS record_identity_registry (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    organization_id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    record_type TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    table_name TEXT NOT NULL,
                    source_module TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(user_id,organization_id,workspace_id,record_type,record_id)
                );
                CREATE INDEX IF NOT EXISTS ix_record_identity_user_type
                    ON record_identity_registry(user_id,record_type,record_id,status);
                CREATE TABLE IF NOT EXISTS record_change_events (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    organization_id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    record_type TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    table_name TEXT NOT NULL,
                    action TEXT NOT NULL,
                    policy_decision_id TEXT,
                    details BLOB NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_record_change_user_record
                    ON record_change_events(user_id,record_type,record_id,created_at);
                CREATE TABLE IF NOT EXISTS context_relationships (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    organization_id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    relationship_type TEXT NOT NULL,
                    target_type TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    confidence REAL NOT NULL DEFAULT 1.0,
                    policy_id TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    metadata BLOB NOT NULL,
                    created_at TEXT NOT NULL,
                    created_by TEXT,
                    updated_at TEXT NOT NULL,
                    UNIQUE(user_id,organization_id,workspace_id,source_type,source_id,relationship_type,target_type,target_id,status)
                );
                CREATE INDEX IF NOT EXISTS ix_context_relationships_source
                    ON context_relationships(user_id,organization_id,workspace_id,source_type,source_id,status);
                CREATE INDEX IF NOT EXISTS ix_context_relationships_target
                    ON context_relationships(user_id,organization_id,workspace_id,target_type,target_id,status);
                """
            )

    def _seed_defaults(self) -> None:
        now = self.now()
        with self.ceda._connect() as db:
            for relationship_type, domain, description in DEFAULT_RELATIONSHIP_DEFINITIONS:
                db.execute(
                    """INSERT OR IGNORE INTO relationship_definitions
                    (relationship_type,domain,description,created_at,updated_at)
                    VALUES(?,?,?,?,?)""",
                    (relationship_type, domain, description, now, now),
                )
            for policy_key, description in ARCHITECTURE_POLICY_ROWS:
                db.execute(
                    """INSERT OR IGNORE INTO data_storage_architecture_policies
                    (policy_key,description,required,created_at,updated_at)
                    VALUES(?,?,?,?,?)""",
                    (policy_key, description, 1, now, now),
                )

    def _migrate_legacy_edges(self) -> None:
        with self.ceda._connect() as db:
            legacy_exists = {row["name"] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if "context_edges" not in legacy_exists:
                return
            rows = db.execute("SELECT * FROM context_edges").fetchall()
            for row in rows:
                self._register_record_unlocked(db, row["user_id"], DEFAULT_ORGANIZATION_ID, DEFAULT_WORKSPACE_ID, "context_object", row["source_id"], "context_objects", "legacy_context_edges")
                self._register_record_unlocked(db, row["user_id"], DEFAULT_ORGANIZATION_ID, DEFAULT_WORKSPACE_ID, "context_object", row["target_id"], "context_objects", "legacy_context_edges")
                metadata = json.loads(self.ceda._decrypt(row["metadata"])) if row["metadata"] else {}
                try:
                    db.execute(
                        """INSERT INTO context_relationships
                        (id,user_id,organization_id,workspace_id,source_type,source_id,relationship_type,target_type,target_id,confidence,policy_id,status,metadata,created_at,created_by,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (
                            row["id"], row["user_id"], DEFAULT_ORGANIZATION_ID, DEFAULT_WORKSPACE_ID,
                            "context_object", row["source_id"], row["relation"], "context_object", row["target_id"],
                            float(metadata.get("confidence", 1.0)), metadata.get("policy_id"), "active",
                            self.ceda._encrypt(metadata), row["created_at"], "legacy_migration", row["created_at"],
                        ),
                    )
                except sqlite3.IntegrityError:
                    continue

    def architecture_policies(self) -> list[dict]:
        with self.ceda._connect() as db:
            rows = db.execute("SELECT * FROM data_storage_architecture_policies ORDER BY policy_key").fetchall()
        return [dict(row) for row in rows]

    def relationship_definitions(self, include_inactive: bool = False) -> list[dict]:
        query = "SELECT * FROM relationship_definitions" + ("" if include_inactive else " WHERE active=1") + " ORDER BY domain,relationship_type"
        with self.ceda._connect() as db:
            rows = db.execute(query).fetchall()
        return [self._public_definition(row) for row in rows]

    def create_relationship_definition(self, relationship_type: str, domain: str, description: str, *, inverse_type: str | None = None, allowed_source_types: list[str] | None = None, allowed_target_types: list[str] | None = None) -> dict:
        self._validate_relationship_type_name(relationship_type)
        now = self.now()
        with self.ceda._connect() as db:
            db.execute(
                """INSERT OR REPLACE INTO relationship_definitions
                (relationship_type,domain,description,inverse_type,allowed_source_types,allowed_target_types,active,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (
                    relationship_type,
                    domain[:80],
                    description[:500],
                    inverse_type,
                    json.dumps(sorted(set(allowed_source_types or []))),
                    json.dumps(sorted(set(allowed_target_types or []))),
                    1,
                    now,
                    now,
                ),
            )
        return self.get_relationship_definition(relationship_type)

    def get_relationship_definition(self, relationship_type: str) -> dict:
        with self.ceda._connect() as db:
            row = db.execute("SELECT * FROM relationship_definitions WHERE relationship_type=?", (relationship_type,)).fetchone()
            if not row:
                raise ValueError("Relationship definition was not found")
        return self._public_definition(row)

    def register_record(self, user_id: int, record_type: str, record_id: str, table_name: str, *, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID, source_module: str = "api", action: str = "register_record") -> dict:
        policy = self.evaluate_architecture_policy(user_id, action, record_type=record_type, record_id=record_id, table_name=table_name, organization_id=organization_id, workspace_id=workspace_id)
        if not policy["allowed"]:
            raise PermissionError(policy["explanation"])
        with self.ceda._connect() as db:
            row = self._register_record_unlocked(db, user_id, organization_id, workspace_id, record_type, record_id, table_name, source_module)
        self.log_record_change(user_id, record_type, record_id, table_name, action, organization_id=organization_id, workspace_id=workspace_id, policy_decision_id=policy.get("decision_id"), details={"source_module": source_module})
        return self._public_record(row)

    def validate_record_architecture(self, user_id: int, record_type: str, record_id: str, table_name: str, *, operation: str = "create_record", relationship_type: str | None = None, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID) -> dict:
        policy = self.evaluate_architecture_policy(user_id, operation, record_type=record_type, record_id=record_id, table_name=table_name, relationship_type=relationship_type, organization_id=organization_id, workspace_id=workspace_id)
        checks = [
            {"policy": "stable_unique_ids_required", "passed": self._valid_stable_id(record_id), "message": "Record has a stable unique ID."},
            {"policy": "policy_check_required", "passed": policy["allowed"], "message": policy["explanation"]},
            {"policy": "audit_all_record_changes", "passed": True, "message": "Record changes are auditable through record_change_events."},
        ]
        if operation == "create_relationship":
            checks.append({"policy": "relationship_definitions_required", "passed": bool(relationship_type and self._relationship_definition_exists(relationship_type)), "message": "Relationship type is defined in relationship_definitions."})
        return {"allowed": all(item["passed"] for item in checks), "checks": checks, "policy_decision": policy}

    def evaluate_architecture_policy(self, user_id: int, action: str, *, record_type: str, record_id: str, table_name: str, relationship_type: str | None = None, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID) -> dict:
        if not self._valid_stable_id(record_id):
            return {"allowed": False, "outcome": "deny", "explanation": "A stable unique record_id is required before storage or relationship creation.", "decision_id": None}
        if relationship_type is not None and not self._relationship_definition_exists(relationship_type):
            return {"allowed": False, "outcome": "deny", "explanation": f"Relationship type '{relationship_type}' is not defined.", "decision_id": None}
        decision = self.ceda.policy_engine.evaluate(
            user_id,
            action,
            domain="context_graph",
            workspace=workspace_id,
            sensitivity="private",
            purpose=f"Validate data architecture for {table_name}.{record_id}",
        )
        return {**decision, "allowed": decision["outcome"] != "deny"}

    def create_relationship(self, user_id: int, source_type: str, source_id: str, relationship_type: str, target_type: str, target_id: str, *, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID, confidence: float = 1.0, policy_id: str | None = None, metadata: dict | None = None, created_by: str = "api") -> dict:
        self._validate_relationship_type_name(relationship_type)
        if source_type == target_type and source_id == target_id:
            raise ValueError("A record cannot be related to itself")
        definition = self.get_relationship_definition(relationship_type)
        self._validate_definition_allows(definition, source_type, target_type)
        confidence = max(0.0, min(1.0, float(confidence)))
        source_policy = self.evaluate_architecture_policy(user_id, "create_relationship", record_type=source_type, record_id=source_id, table_name=source_type, relationship_type=relationship_type, organization_id=organization_id, workspace_id=workspace_id)
        target_policy = self.evaluate_architecture_policy(user_id, "create_relationship", record_type=target_type, record_id=target_id, table_name=target_type, relationship_type=relationship_type, organization_id=organization_id, workspace_id=workspace_id)
        if not source_policy["allowed"] or not target_policy["allowed"]:
            raise PermissionError(source_policy.get("explanation") or target_policy.get("explanation") or "Policy denied relationship creation")
        now = self.now()
        metadata = metadata or {}
        with self.ceda._connect() as db:
            self._ensure_node_reference(db, user_id, organization_id, workspace_id, source_type, source_id)
            self._ensure_node_reference(db, user_id, organization_id, workspace_id, target_type, target_id)
            relationship_id = f"REL-{uuid.uuid4().hex[:12].upper()}"
            try:
                db.execute(
                    """INSERT INTO context_relationships
                    (id,user_id,organization_id,workspace_id,source_type,source_id,relationship_type,target_type,target_id,confidence,policy_id,status,metadata,created_at,created_by,updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (relationship_id,user_id,organization_id,workspace_id,source_type,source_id,relationship_type,target_type,target_id,confidence,policy_id,"active",self.ceda._encrypt(metadata),now,created_by[:80],now),
                )
                row = db.execute("SELECT * FROM context_relationships WHERE id=?", (relationship_id,)).fetchone()
                replay = False
            except sqlite3.IntegrityError:
                row = db.execute(
                    """SELECT * FROM context_relationships
                    WHERE user_id=? AND organization_id=? AND workspace_id=? AND source_type=? AND source_id=?
                      AND relationship_type=? AND target_type=? AND target_id=? AND status='active'""",
                    (user_id,organization_id,workspace_id,source_type,source_id,relationship_type,target_type,target_id),
                ).fetchone()
                replay = True
        public = self._public_relationship(row)
        if not replay:
            self.log_record_change(user_id, "relationship", public["relationship_id"], "context_relationships", "create_relationship", organization_id=organization_id, workspace_id=workspace_id, policy_decision_id=source_policy.get("decision_id"), details=public)
            self.ceda.audit(user_id, "context_graph.relationship_created", "context_relationship", public["relationship_id"], None, {"relationship_type": relationship_type})
        return {**public, "idempotent_replay": replay}

    def get_neighbors(self, user_id: int, node_type: str, node_id: str, *, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID, direction: str = "both") -> dict:
        clauses = ["user_id=?", "organization_id=?", "workspace_id=?", "status='active'"]
        args: list[object] = [user_id, organization_id, workspace_id]
        if direction == "outbound":
            clauses.append("source_type=? AND source_id=?"); args.extend([node_type, node_id])
        elif direction == "inbound":
            clauses.append("target_type=? AND target_id=?"); args.extend([node_type, node_id])
        else:
            clauses.append("((source_type=? AND source_id=?) OR (target_type=? AND target_id=?))"); args.extend([node_type, node_id, node_type, node_id])
        with self.ceda._connect() as db:
            rows = db.execute(f"SELECT * FROM context_relationships WHERE {' AND '.join(clauses)} ORDER BY updated_at DESC", args).fetchall()
        relationships = [self._public_relationship(row) for row in rows]
        neighbors = []
        seen = set()
        for relationship in relationships:
            if relationship["source_type"] == node_type and relationship["source_id"] == node_id:
                neighbor = (relationship["target_type"], relationship["target_id"], "outbound")
            else:
                neighbor = (relationship["source_type"], relationship["source_id"], "inbound")
            if neighbor[:2] in seen:
                continue
            seen.add(neighbor[:2])
            neighbors.append({"type": neighbor[0], "id": neighbor[1], "direction": neighbor[2]})
        return {"node": {"type": node_type, "id": node_id}, "neighbors": neighbors, "relationships": relationships}

    def get_related(self, user_id: int, node_type: str, node_id: str, *, depth: int = 2, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID) -> dict:
        depth = max(1, min(int(depth), 4))
        queue: deque[tuple[str, str, int]] = deque([(node_type, node_id, 0)])
        visited = {(node_type, node_id)}
        nodes = []
        relationships = []
        relationship_seen = set()
        while queue:
            current_type, current_id, current_depth = queue.popleft()
            if current_depth >= depth:
                continue
            neighbors = self.get_neighbors(user_id, current_type, current_id, organization_id=organization_id, workspace_id=workspace_id)
            for relationship in neighbors["relationships"]:
                if relationship["relationship_id"] not in relationship_seen:
                    relationships.append(relationship); relationship_seen.add(relationship["relationship_id"])
            for neighbor in neighbors["neighbors"]:
                key = (neighbor["type"], neighbor["id"])
                if key in visited:
                    continue
                visited.add(key)
                nodes.append({"type": neighbor["type"], "id": neighbor["id"], "depth": current_depth + 1})
                queue.append((neighbor["type"], neighbor["id"], current_depth + 1))
        return {"root": {"type": node_type, "id": node_id}, "depth": depth, "nodes": nodes, "relationships": relationships}

    def get_dependencies(self, user_id: int, node_type: str, node_id: str, *, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID) -> dict:
        dependency_types = {"depends_on", "requires", "has_deadline", "blocked_by", "sourced_from", "requires_verification"}
        neighbors = self.get_neighbors(user_id, node_type, node_id, organization_id=organization_id, workspace_id=workspace_id, direction="outbound")
        dependencies = [
            {"type": item["target_type"], "id": item["target_id"], "relationship": item["relationship_type"], "confidence": item["confidence"]}
            for item in neighbors["relationships"] if item["relationship_type"] in dependency_types
        ]
        return {"node": {"type": node_type, "id": node_id}, "dependencies": dependencies}

    def get_impact(self, user_id: int, node_type: str, node_id: str, *, depth: int = 3, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID) -> dict:
        depth = max(1, min(int(depth), 5))
        queue: deque[tuple[str, str, int]] = deque([(node_type, node_id, 0)])
        visited = {(node_type, node_id)}
        impacted = []
        relationships = []
        seen_relationships = set()
        while queue:
            current_type, current_id, current_depth = queue.popleft()
            if current_depth >= depth:
                continue
            incoming = self.get_neighbors(user_id, current_type, current_id, organization_id=organization_id, workspace_id=workspace_id, direction="inbound")
            for relationship in incoming["relationships"]:
                if relationship["relationship_id"] not in seen_relationships:
                    relationships.append(relationship); seen_relationships.add(relationship["relationship_id"])
                key = (relationship["source_type"], relationship["source_id"])
                if key in visited:
                    continue
                visited.add(key)
                impacted.append({"type": relationship["source_type"], "id": relationship["source_id"], "relationship": relationship["relationship_type"], "depth": current_depth + 1})
                queue.append((relationship["source_type"], relationship["source_id"], current_depth + 1))
        return {"root": {"type": node_type, "id": node_id}, "depth": depth, "impacted": impacted, "relationships": relationships}

    def archive_relationship(self, user_id: int, relationship_id: str, *, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID, status: str = "archived") -> dict:
        if status not in {"archived", "deleted"}:
            raise ValueError("Relationship can only be archived or deleted")
        now = self.now()
        with self.ceda._connect() as db:
            row = db.execute("SELECT * FROM context_relationships WHERE id=? AND user_id=? AND organization_id=? AND workspace_id=?", (relationship_id,user_id,organization_id,workspace_id)).fetchone()
            if not row:
                raise ValueError("Relationship was not found")
            db.execute("UPDATE context_relationships SET status=?,updated_at=? WHERE id=?", (status, now, relationship_id))
            updated = db.execute("SELECT * FROM context_relationships WHERE id=?", (relationship_id,)).fetchone()
        self.log_record_change(user_id, "relationship", relationship_id, "context_relationships", status, organization_id=organization_id, workspace_id=workspace_id, details={"previous_status": row["status"]})
        return self._public_relationship(updated)

    def log_record_change(self, user_id: int, record_type: str, record_id: str, table_name: str, action: str, *, organization_id: str = DEFAULT_ORGANIZATION_ID, workspace_id: str = DEFAULT_WORKSPACE_ID, policy_decision_id: str | None = None, details: dict | None = None) -> dict:
        if not self._valid_stable_id(record_id):
            raise ValueError("A stable unique record_id is required for audit")
        event_id = f"RCE-{uuid.uuid4().hex[:12].upper()}"
        now = self.now()
        with self.ceda._connect() as db:
            db.execute(
                """INSERT INTO record_change_events
                (id,user_id,organization_id,workspace_id,record_type,record_id,table_name,action,policy_decision_id,details,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (event_id,user_id,organization_id,workspace_id,record_type,record_id,table_name,action,policy_decision_id,self.ceda._encrypt(details or {}),now),
            )
            row = db.execute("SELECT * FROM record_change_events WHERE id=?", (event_id,)).fetchone()
        return self._public_record_change(row)

    def record_changes(self, user_id: int, record_type: str | None = None, record_id: str | None = None, limit: int = 100) -> list[dict]:
        clauses = ["user_id=?"]
        args: list[object] = [user_id]
        if record_type:
            clauses.append("record_type=?"); args.append(record_type)
        if record_id:
            clauses.append("record_id=?"); args.append(record_id)
        args.append(max(1, min(limit, 500)))
        with self.ceda._connect() as db:
            rows = db.execute(f"SELECT * FROM record_change_events WHERE {' AND '.join(clauses)} ORDER BY created_at DESC LIMIT ?", args).fetchall()
        return [self._public_record_change(row) for row in rows]

    def _ensure_node_reference(self, db, user_id: int, organization_id: str, workspace_id: str, record_type: str, record_id: str) -> None:
        if not self._valid_stable_id(record_id):
            raise ValueError("Relationship nodes require stable unique IDs")
        if record_type in {"context", "context_object"}:
            row = db.execute("SELECT id FROM context_objects WHERE user_id=? AND id=? AND status!='deleted'", (user_id, record_id)).fetchone()
            if not row:
                raise ValueError(f"Context Object '{record_id}' was not found for this user")
            self._register_record_unlocked(db, user_id, organization_id, workspace_id, "context_object", record_id, "context_objects", "context_graph")
            return
        row = db.execute(
            """SELECT id FROM record_identity_registry
            WHERE user_id=? AND organization_id=? AND workspace_id=? AND record_type=? AND record_id=? AND status='active'""",
            (user_id, organization_id, workspace_id, record_type, record_id),
        ).fetchone()
        if not row:
            raise ValueError(f"Record '{record_type}:{record_id}' must be registered before it can be linked")

    def _register_record_unlocked(self, db, user_id: int, organization_id: str, workspace_id: str, record_type: str, record_id: str, table_name: str, source_module: str):
        if not self._valid_stable_id(record_id):
            raise ValueError("A stable unique record_id is required")
        now = self.now()
        registry_id = f"RID-{uuid.uuid4().hex[:12].upper()}"
        db.execute(
            """INSERT INTO record_identity_registry
            (id,user_id,organization_id,workspace_id,record_type,record_id,table_name,source_module,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id,organization_id,workspace_id,record_type,record_id)
            DO UPDATE SET table_name=excluded.table_name,source_module=excluded.source_module,status='active',updated_at=excluded.updated_at""",
            (registry_id,user_id,organization_id,workspace_id,record_type,record_id,table_name,source_module,"active",now,now),
        )
        return db.execute(
            """SELECT * FROM record_identity_registry
            WHERE user_id=? AND organization_id=? AND workspace_id=? AND record_type=? AND record_id=?""",
            (user_id,organization_id,workspace_id,record_type,record_id),
        ).fetchone()

    def _relationship_definition_exists(self, relationship_type: str) -> bool:
        with self.ceda._connect() as db:
            return bool(db.execute("SELECT 1 FROM relationship_definitions WHERE relationship_type=? AND active=1", (relationship_type,)).fetchone())

    def _validate_definition_allows(self, definition: dict, source_type: str, target_type: str) -> None:
        source_allowed = definition.get("allowed_source_types") or []
        target_allowed = definition.get("allowed_target_types") or []
        if source_allowed and source_type not in source_allowed:
            raise ValueError(f"Relationship '{definition['relationship_type']}' does not allow source type '{source_type}'")
        if target_allowed and target_type not in target_allowed:
            raise ValueError(f"Relationship '{definition['relationship_type']}' does not allow target type '{target_type}'")

    @staticmethod
    def _valid_stable_id(record_id: str) -> bool:
        return bool(record_id and VALID_ID_PATTERN.match(record_id))

    @staticmethod
    def _validate_relationship_type_name(relationship_type: str) -> None:
        if not re.match(r"^[a-z][a-z0-9_]{1,63}$", relationship_type or ""):
            raise ValueError("Relationship type must be lowercase snake_case")

    def _public_definition(self, row) -> dict:
        return {
            "relationship_type": row["relationship_type"],
            "domain": row["domain"],
            "description": row["description"],
            "inverse_type": row["inverse_type"],
            "allowed_source_types": json.loads(row["allowed_source_types"] or "[]"),
            "allowed_target_types": json.loads(row["allowed_target_types"] or "[]"),
            "active": bool(row["active"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _public_record(self, row) -> dict:
        return {
            "registry_id": row["id"],
            "user_id": row["user_id"],
            "organization_id": row["organization_id"],
            "workspace_id": row["workspace_id"],
            "record_type": row["record_type"],
            "record_id": row["record_id"],
            "table_name": row["table_name"],
            "source_module": row["source_module"],
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _public_relationship(self, row) -> dict:
        return {
            "relationship_id": row["id"],
            "user_id": row["user_id"],
            "organization_id": row["organization_id"],
            "workspace_id": row["workspace_id"],
            "source_type": row["source_type"],
            "source_id": row["source_id"],
            "relationship_type": row["relationship_type"],
            "target_type": row["target_type"],
            "target_id": row["target_id"],
            "confidence": row["confidence"],
            "policy_id": row["policy_id"],
            "status": row["status"],
            "metadata": json.loads(self.ceda._decrypt(row["metadata"])),
            "created_at": row["created_at"],
            "created_by": row["created_by"],
            "updated_at": row["updated_at"],
        }

    def _public_record_change(self, row) -> dict:
        return {
            "event_id": row["id"],
            "user_id": row["user_id"],
            "organization_id": row["organization_id"],
            "workspace_id": row["workspace_id"],
            "record_type": row["record_type"],
            "record_id": row["record_id"],
            "table_name": row["table_name"],
            "action": row["action"],
            "policy_decision_id": row["policy_decision_id"],
            "details": json.loads(self.ceda._decrypt(row["details"])),
            "created_at": row["created_at"],
        }


context_graph_service = ContextGraphService(ceda_service)
