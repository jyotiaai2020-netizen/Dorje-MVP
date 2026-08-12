"""Policy Intelligence Engine (PIE): hierarchical, explainable governance."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
import json
import uuid

if TYPE_CHECKING:
    from app.services.ceda_service import CEDAService


SCOPE_PRIORITY = {"legal_security": 1000, "global": 900, "workspace": 800, "domain": 700, "project": 600, "context": 500, "action": 400, "connector": 300, "model": 200, "agent_default": 100}
EFFECT_PRIORITY = {"deny": 3, "ask": 2, "allow": 1}


class PolicyIntelligenceEngine:
    def __init__(self, ceda: "CEDAService") -> None:
        self.ceda = ceda
        self._initialize()

    def _initialize(self) -> None:
        with self.ceda._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS pie_policies (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL,
                    scope_type TEXT NOT NULL, scope_id TEXT, effect TEXT NOT NULL,
                    actions TEXT NOT NULL, rules BLOB NOT NULL, priority INTEGER NOT NULL,
                    enabled INTEGER NOT NULL, version INTEGER NOT NULL, source TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
                );
                CREATE INDEX IF NOT EXISTS ix_pie_policy_user_scope ON pie_policies(user_id,scope_type,scope_id,enabled);
                CREATE TABLE IF NOT EXISTS pie_policy_versions (
                    policy_id TEXT NOT NULL, user_id INTEGER NOT NULL, version INTEGER NOT NULL,
                    snapshot BLOB NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
                    PRIMARY KEY(policy_id,version)
                );
                CREATE TABLE IF NOT EXISTS pie_decisions (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, action TEXT NOT NULL,
                    outcome TEXT NOT NULL, purpose TEXT, context_ids TEXT NOT NULL,
                    connector TEXT, model TEXT, destination TEXT, sensitivity TEXT,
                    matched_policies TEXT NOT NULL, explanation BLOB NOT NULL,
                    consent_id TEXT, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS pie_consents (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, decision_id TEXT NOT NULL,
                    status TEXT NOT NULL, reason TEXT, expires_at TEXT,
                    created_at TEXT NOT NULL, decided_at TEXT
                );
            """)

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def create_policy(self, user_id: int, name: str, scope_type: str, scope_id: str | None, effect: str, actions: list[str], rules: dict, reason: str, source: str = "user") -> dict:
        if scope_type not in SCOPE_PRIORITY or scope_type in {"legal_security", "agent_default"}:
            raise ValueError("Invalid user policy scope")
        if effect not in EFFECT_PRIORITY or not actions:
            raise ValueError("Policy effect and actions are required")
        policy_id = f"PIE-{uuid.uuid4().hex[:12].upper()}"
        now = self._now()
        priority = SCOPE_PRIORITY[scope_type]
        snapshot = {"name": name, "scope_type": scope_type, "scope_id": scope_id, "effect": effect, "actions": actions, "rules": rules, "enabled": True, "version": 1, "source": source}
        with self.ceda._connect() as db:
            db.execute("INSERT INTO pie_policies(id,user_id,name,scope_type,scope_id,effect,actions,rules,priority,enabled,version,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (policy_id,user_id,name[:160],scope_type,scope_id,effect,json.dumps(sorted(set(actions))),self.ceda._encrypt(rules),priority,1,1,source,now,now))
            db.execute("INSERT INTO pie_policy_versions(policy_id,user_id,version,snapshot,reason,created_at) VALUES(?,?,?,?,?,?)", (policy_id,user_id,1,self.ceda._encrypt(snapshot),reason[:200],now))
        return self.get_policy(user_id, policy_id)

    def get_policy(self, user_id: int, policy_id: str) -> dict:
        with self.ceda._connect() as db:
            row = db.execute("SELECT * FROM pie_policies WHERE id=? AND user_id=?", (policy_id,user_id)).fetchone()
            if not row: raise ValueError("Policy was not found")
            versions = db.execute("SELECT version,reason,created_at FROM pie_policy_versions WHERE policy_id=? AND user_id=? ORDER BY version DESC", (policy_id,user_id)).fetchall()
        result = self._public(row); result["versions"] = [dict(item) for item in versions]; return result

    def list_policies(self, user_id: int, include_disabled: bool = False) -> list[dict]:
        query = "SELECT * FROM pie_policies WHERE user_id=?" + ("" if include_disabled else " AND enabled=1") + " ORDER BY priority DESC,updated_at DESC"
        with self.ceda._connect() as db: rows = db.execute(query,(user_id,)).fetchall()
        return [self._public(row) for row in rows]

    def _public(self, row) -> dict:
        return {"policy_id":row["id"],"name":row["name"],"scope_type":row["scope_type"],"scope_id":row["scope_id"],"effect":row["effect"],"actions":json.loads(row["actions"]),"rules":json.loads(self.ceda._decrypt(row["rules"])),"priority":row["priority"],"enabled":bool(row["enabled"]),"version":row["version"],"source":row["source"],"created_at":row["created_at"],"updated_at":row["updated_at"]}

    def update_policy(self, user_id: int, policy_id: str, changes: dict, reason: str) -> dict:
        allowed = {"name","effect","actions","rules","enabled"}
        if not changes or set(changes)-allowed: raise ValueError("Unsupported policy update")
        current = self.get_policy(user_id,policy_id)
        merged = {**current,**changes}; version=current["version"]+1; now=self._now()
        if merged["effect"] not in EFFECT_PRIORITY: raise ValueError("Invalid policy effect")
        snapshot = {key:merged[key] for key in ("name","scope_type","scope_id","effect","actions","rules","enabled")}; snapshot["version"]=version
        with self.ceda._connect() as db:
            db.execute("UPDATE pie_policies SET name=?,effect=?,actions=?,rules=?,enabled=?,version=?,updated_at=?,deleted_at=? WHERE id=? AND user_id=?", (merged["name"][:160],merged["effect"],json.dumps(sorted(set(merged["actions"]))),self.ceda._encrypt(merged["rules"]),int(merged["enabled"]),version,now,None if merged["enabled"] else now,policy_id,user_id))
            db.execute("INSERT INTO pie_policy_versions(policy_id,user_id,version,snapshot,reason,created_at) VALUES(?,?,?,?,?,?)", (policy_id,user_id,version,self.ceda._encrypt(snapshot),reason[:200],now))
        return self.get_policy(user_id,policy_id)

    def disable_policy(self,user_id:int,policy_id:str,reason:str) -> dict:
        return self.update_policy(user_id,policy_id,{"enabled":False},reason)

    def restore_policy(self,user_id:int,policy_id:str,reason:str) -> dict:
        return self.update_policy(user_id,policy_id,{"enabled":True},reason)

    def evaluate(self, user_id: int, action: str, *, domain: str | None = None, workspace: str | None = None, project: str | None = None, context_ids: list[str] | None = None, sensitivity: str = "private", connector: str | None = None, model: str | None = None, destination: str | None = None, purpose: str = "") -> dict:
        context_ids = context_ids or []
        candidates = []
        if sensitivity in {"secret","credential"}:
            candidates.append({"policy_id":"PIE-SECURITY-SECRETS","name":"Secrets never leave the vault","scope_type":"legal_security","effect":"deny","priority":1000,"reason":"Secret or credential context is blocked."})
        elif sensitivity == "sensitive" and action in {"share","publish","cloud_upload","send_to_cloud_model","connector_access"}:
            candidates.append({"policy_id":"PIE-SECURITY-SENSITIVE-CONSENT","name":"Sensitive operations require consent","scope_type":"legal_security","effect":"ask","priority":1000,"reason":"Sensitive context requires explicit approval."})
        elif action in {"share","publish","cloud_upload","connector_access","send_email","create_calendar_event"} or (model and model != "local"):
            candidates.append({"policy_id":"PIE-GLOBAL-CONSENT","name":"External actions require consent","scope_type":"global","effect":"ask","priority":900,"reason":"The action leaves the local workspace or changes an external system."})
        else:
            candidates.append({"policy_id":"PIE-DEFAULT-LOCAL","name":"Local least-privilege default","scope_type":"agent_default","effect":"allow","priority":100,"reason":"Local policy-filtered operation is allowed."})
        with self.ceda._connect() as db: rows=db.execute("SELECT * FROM pie_policies WHERE user_id=? AND enabled=1",(user_id,)).fetchall()
        scope_values={"global":None,"workspace":workspace,"domain":domain,"project":project,"context":None,"action":action,"connector":connector,"model":model}
        for row in rows:
            if action not in json.loads(row["actions"]) and "*" not in json.loads(row["actions"]): continue
            expected=scope_values.get(row["scope_type"])
            if row["scope_type"]=="context" and row["scope_id"] not in context_ids: continue
            if row["scope_type"] not in {"global","context"} and row["scope_id"] and row["scope_id"] != expected: continue
            candidates.append({"policy_id":row["id"],"name":row["name"],"scope_type":row["scope_type"],"effect":row["effect"],"priority":row["priority"],"reason":json.loads(self.ceda._decrypt(row["rules"])).get("reason","User-owned policy matched.")})
        denials=[item for item in candidates if item["effect"]=="deny"]
        winner=sorted(denials or candidates,key=lambda item:(item["priority"],EFFECT_PRIORITY[item["effect"]]),reverse=True)[0]
        matched=[item["policy_id"] for item in sorted(candidates,key=lambda item:item["priority"],reverse=True)]
        decision_id=f"DEC-{uuid.uuid4().hex[:12].upper()}"; now=self._now(); consent_id=None
        explanation=f"{winner['effect'].upper()}: {winner['reason']} Highest-priority policy: {winner['name']} ({winner['scope_type']}). Purpose: {purpose or 'not supplied'}."
        with self.ceda._connect() as db:
            db.execute("INSERT INTO pie_decisions(id,user_id,action,outcome,purpose,context_ids,connector,model,destination,sensitivity,matched_policies,explanation,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",(decision_id,user_id,action,winner["effect"],purpose,json.dumps(context_ids),connector,model,destination,sensitivity,json.dumps(matched),self.ceda._encrypt(explanation),now))
            if winner["effect"]=="ask":
                consent_id=f"CONS-{uuid.uuid4().hex[:12].upper()}"; expires=(datetime.now(timezone.utc)+timedelta(minutes=15)).isoformat()
                db.execute("INSERT INTO pie_consents(id,user_id,decision_id,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",(consent_id,user_id,decision_id,"pending",expires,now))
                db.execute("UPDATE pie_decisions SET consent_id=? WHERE id=?",(consent_id,decision_id))
        return {"decision_id":decision_id,"outcome":winner["effect"],"allowed":winner["effect"]=="allow","requires_consent":winner["effect"]=="ask","consent_id":consent_id,"matched_policies":matched,"winning_policy":winner,"explanation":explanation}

    def decide_consent(self,user_id:int,consent_id:str,approved:bool,reason:str="") -> dict:
        now=datetime.now(timezone.utc)
        with self.ceda._connect() as db:
            row=db.execute("SELECT * FROM pie_consents WHERE id=? AND user_id=? AND status='pending'",(consent_id,user_id)).fetchone()
            if not row: raise ValueError("Pending consent was not found")
            if row["expires_at"] and datetime.fromisoformat(row["expires_at"])<now: status="expired"
            else: status="approved" if approved else "denied"
            db.execute("UPDATE pie_consents SET status=?,reason=?,decided_at=? WHERE id=?",(status,reason[:200],self._now(),consent_id))
            db.execute("UPDATE pie_decisions SET outcome=? WHERE id=?",("allow" if status=="approved" else "deny",row["decision_id"]))
        return {"consent_id":consent_id,"decision_id":row["decision_id"],"status":status,"allowed":status=="approved"}

    def explain_decision(self,user_id:int,decision_id:str) -> dict:
        with self.ceda._connect() as db:
            row=db.execute("SELECT * FROM pie_decisions WHERE id=? AND user_id=?",(decision_id,user_id)).fetchone()
            if not row: raise ValueError("Policy decision was not found")
        return {"decision_id":row["id"],"action":row["action"],"outcome":row["outcome"],"purpose":row["purpose"],"context_ids":json.loads(row["context_ids"]),"connector":row["connector"],"model":row["model"],"destination":row["destination"],"sensitivity":row["sensitivity"],"matched_policies":json.loads(row["matched_policies"]),"explanation":self.ceda._decrypt(row["explanation"]),"consent_id":row["consent_id"],"created_at":row["created_at"]}

    def decisions(self,user_id:int,limit:int=100) -> list[dict]:
        with self.ceda._connect() as db: ids=[row[0] for row in db.execute("SELECT id FROM pie_decisions WHERE user_id=? ORDER BY created_at DESC LIMIT ?",(user_id,limit)).fetchall()]
        return [self.explain_decision(user_id,item) for item in ids]
