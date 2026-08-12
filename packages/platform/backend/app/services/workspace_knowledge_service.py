"""Workspace & Knowledge Infrastructure Manager (WKIM).

WKIM stores governed references and metadata. It never becomes the owner of a
user's original documents and never bypasses PIE, CEDA, or the audit ledger.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import mimetypes
import re
import uuid

from app.services.ceda_service import CEDAService, ceda_service
from app.services.plugins.student_wkim_plugin import student_wkim_plugin


class WKIMError(ValueError):
    pass


class WorkspaceKnowledgeService:
    def __init__(self, ceda: CEDAService) -> None:
        self.ceda = ceda
        self._initialize()

    def _initialize(self) -> None:
        with self.ceda._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS wkim_workspaces (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL,
                    location BLOB NOT NULL, storage_type TEXT NOT NULL, category TEXT NOT NULL,
                    encryption_status TEXT NOT NULL, permission_level TEXT NOT NULL,
                    sync_mode TEXT NOT NULL, health_status TEXT NOT NULL,
                    policy_binding TEXT NOT NULL, approved INTEGER NOT NULL,
                    watcher_enabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL, last_scan_at TEXT
                );
                CREATE INDEX IF NOT EXISTS ix_wkim_workspace_user ON wkim_workspaces(user_id,category,approved);
                CREATE TABLE IF NOT EXISTS wkim_documents (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, workspace_id TEXT NOT NULL,
                    physical_location BLOB NOT NULL, file_hash TEXT NOT NULL, file_type TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL, title BLOB NOT NULL, summary BLOB NOT NULL,
                    domain TEXT NOT NULL, classification TEXT NOT NULL, policy_binding TEXT NOT NULL,
                    embedding_ref TEXT, last_indexed_at TEXT NOT NULL, version INTEGER NOT NULL,
                    security_classification TEXT NOT NULL, index_status TEXT NOT NULL,
                    metadata BLOB NOT NULL, context_links TEXT NOT NULL, source_kind TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    FOREIGN KEY(workspace_id) REFERENCES wkim_workspaces(id)
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ux_wkim_document_hash ON wkim_documents(user_id,workspace_id,file_hash);
                CREATE INDEX IF NOT EXISTS ix_wkim_document_search ON wkim_documents(user_id,domain,index_status);
                CREATE TABLE IF NOT EXISTS wkim_activity (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, workspace_id TEXT,
                    document_id TEXT, event_type TEXT NOT NULL, detail BLOB NOT NULL,
                    created_at TEXT NOT NULL
                );
            """)

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _decision(self, user_id: int, action: str, *, domain: str = "knowledge", workspace: str | None = None,
                  sensitivity: str = "private", connector: str | None = None, purpose: str) -> dict:
        decision = self.ceda.policy_engine.evaluate(user_id, action, domain=domain, workspace=workspace,
                                                    sensitivity=sensitivity, connector=connector, model="local", purpose=purpose)
        if decision["outcome"] == "deny":
            raise WKIMError(decision["explanation"])
        return decision

    def register_workspace(self, user_id: int, name: str, location: str, *, storage_type: str = "local",
                           category: str = "personal", sync_mode: str = "local_only",
                           permission_level: str = "read_only", policy_binding: str = "PIE-WORKSPACE-DEFAULT",
                           watcher_enabled: bool = False) -> dict:
        storage_type = storage_type.casefold()
        if sync_mode not in {"local_only", "hybrid", "enterprise"}:
            raise WKIMError("Synchronization mode must be local_only, hybrid, or enterprise")
        connector = None if storage_type in {"local", "external", "application_managed"} else storage_type
        action = "register_workspace" if connector is None else "connector_access"
        decision = self._decision(user_id, action, domain=category, workspace=name, connector=connector,
                                  purpose="Register a user-selected knowledge workspace")
        if decision["requires_consent"]:
            return {"status": "pending_consent", "policy_decision": decision}
        normalized = location.strip()
        if storage_type in {"local", "external", "application_managed"}:
            path = Path(normalized).expanduser().resolve()
            if not path.exists() or not path.is_dir():
                raise WKIMError("The selected local workspace folder does not exist")
            normalized = str(path)
        workspace_id = f"WS-{uuid.uuid4().hex[:12].upper()}"
        now = self._now()
        with self.ceda._connect() as db:
            db.execute("""INSERT INTO wkim_workspaces
                (id,user_id,name,location,storage_type,category,encryption_status,permission_level,sync_mode,
                 health_status,policy_binding,approved,watcher_enabled,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (workspace_id,user_id,name[:120],self.ceda._encrypt(normalized),storage_type,category,
                 "reference_encrypted",permission_level,sync_mode,"healthy",policy_binding,1,int(watcher_enabled),now,now))
        self._event(user_id,"WorkspaceRegistered",workspace_id,None,{"storage_type":storage_type,"category":category})
        return self.get_workspace(user_id,workspace_id)

    def ensure_managed_workspace(self, user_id: int, location: str) -> dict:
        normalized = str(Path(location).resolve())
        with self.ceda._connect() as db:
            rows = db.execute("SELECT * FROM wkim_workspaces WHERE user_id=? AND storage_type='application_managed' AND approved=1",(user_id,)).fetchall()
        for row in rows:
            if self.ceda._decrypt(row["location"]) == normalized:
                return self._workspace_public(row)
        return self.register_workspace(user_id,"DorjeAI Chat Attachments",normalized,storage_type="application_managed",
                                       category="knowledge",permission_level="read_write")

    def get_workspace(self,user_id:int,workspace_id:str,*,internal:bool=False) -> dict:
        with self.ceda._connect() as db:
            row=db.execute("SELECT * FROM wkim_workspaces WHERE id=? AND user_id=?",(workspace_id,user_id)).fetchone()
        if not row: raise WKIMError("Workspace was not found")
        return self._workspace_public(row,internal=internal)

    def list_workspaces(self,user_id:int) -> list[dict]:
        with self.ceda._connect() as db:
            rows=db.execute("SELECT * FROM wkim_workspaces WHERE user_id=? AND approved=1 ORDER BY updated_at DESC",(user_id,)).fetchall()
        return [self._workspace_public(row) for row in rows]

    def storage_locations(self,user_id:int,connectors:list|None=None) -> list[dict]:
        locations=[{"location_id":"system-local","workspace_id":None,"name":"System / Local Device",
                    "location":"Local device storage","storage_type":"system","category":"system","sync_mode":"local_only",
                    "health_status":"available","permission_level":"user_approved_paths_only","watcher_enabled":False,
                    "source":"system","status":"available","disconnectable":False}]
        seen={"system"}
        for workspace in self.list_workspaces(user_id):
            key=f"workspace:{workspace['workspace_id']}"
            if key in seen: continue
            seen.add(key)
            locations.append({**workspace,"location_id":workspace["workspace_id"],"source":"wkim","status":"connected","disconnectable":True})
        storage_providers={"google-drive":"Google Drive","onedrive":"Microsoft OneDrive","sharepoint":"Microsoft SharePoint","dropbox":"Dropbox",
                           "postgresql":"PostgreSQL Database","mysql":"MySQL Database","mongodb":"MongoDB Database","database":"Connected Database"}
        drive_scope="https://www.googleapis.com/auth/drive.file"
        for connector in connectors or []:
            if getattr(connector,"status","")!="connected": continue
            provider=str(getattr(connector,"provider","")).casefold()
            scopes=set(str(getattr(connector,"scope","") or "").split())
            providers=[]
            if provider in storage_providers: providers.append(provider)
            if drive_scope in scopes and "google-drive" not in providers: providers.append("google-drive")
            for storage_provider in providers:
                key=f"connector:{storage_provider}"
                if key in seen: continue
                seen.add(key)
                account=str(getattr(connector,"provider_account_email","") or "")
                locations.append({"location_id":key,"workspace_id":None,"name":storage_providers[storage_provider],
                                  "location":account or "Connected account","storage_type":storage_provider,"category":"cloud_storage",
                                  "sync_mode":"hybrid","health_status":"connected","permission_level":"oauth_scoped",
                                  "watcher_enabled":False,"source":"connector","status":"connected","disconnectable":False})
        return locations

    def _workspace_public(self,row,*,internal:bool=False) -> dict:
        stored_location=self.ceda._decrypt(row["location"])
        visible_location=stored_location if internal or row["storage_type"]!="application_managed" else "Uploaded from this device"
        return {"workspace_id":row["id"],"name":row["name"],"location":visible_location,
                "storage_type":row["storage_type"],"category":row["category"],"encryption_status":row["encryption_status"],
                "permission_level":row["permission_level"],"sync_mode":row["sync_mode"],"health_status":row["health_status"],
                "policy_binding":row["policy_binding"],"approved":bool(row["approved"]),"watcher_enabled":bool(row["watcher_enabled"]),
                "created_at":row["created_at"],"updated_at":row["updated_at"],"last_scan_at":row["last_scan_at"]}

    def catalog_reference(self,user_id:int,workspace_id:str,physical_location:str,*,title:str|None=None,summary:str="",
                          metadata:dict|None=None,source_kind:str="external_reference",security_classification:str="private") -> dict:
        workspace=self.get_workspace(user_id,workspace_id,internal=True)
        decision=self._decision(user_id,"index_knowledge",domain=workspace["category"],workspace=workspace["name"],
                                sensitivity=security_classification,purpose="Index metadata for a referenced user-owned document")
        if decision["requires_consent"]:
            return {"status":"pending_consent","policy_decision":decision}
        path=Path(physical_location).expanduser().resolve()
        if workspace["storage_type"] in {"local","external","application_managed"}:
            root=Path(workspace["location"]).resolve()
            if not path.is_file() or root not in path.parents:
                raise WKIMError("Document must be an existing file inside the approved workspace")
            digest=self._hash_file(path); size=path.stat().st_size
        else:
            digest=hashlib.sha256(str(physical_location).encode()).hexdigest(); size=int((metadata or {}).get("size_bytes",0))
        metadata=dict(metadata or {})
        effective_title=(title or path.name)[:240]
        classification=student_wkim_plugin.classify(effective_title,summary,metadata)
        domain=classification["domain"] if workspace["category"] in {"personal","knowledge"} else workspace["category"]
        kind=classification["classification"]
        file_type=mimetypes.guess_type(str(path))[0] or path.suffix.lower().lstrip(".") or "application/octet-stream"
        now=self._now()
        with self.ceda._connect() as db:
            existing=db.execute("SELECT * FROM wkim_documents WHERE user_id=? AND workspace_id=? AND file_hash=?",(user_id,workspace_id,digest)).fetchone()
            if existing: return {**self._document_public(existing),"idempotent_replay":True}
            document_id=f"DOC-{uuid.uuid4().hex[:12].upper()}"
            db.execute("""INSERT INTO wkim_documents
                (id,user_id,workspace_id,physical_location,file_hash,file_type,size_bytes,title,summary,domain,classification,
                 policy_binding,embedding_ref,last_indexed_at,version,security_classification,index_status,metadata,
                 context_links,source_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (document_id,user_id,workspace_id,self.ceda._encrypt(str(path)),digest,file_type,size,
                 self.ceda._encrypt(effective_title),self.ceda._encrypt(summary[:2000]),domain,kind,workspace["policy_binding"],
                 None,now,1,security_classification,"indexed",self.ceda._encrypt(metadata),"[]",source_kind,now,now))
            row=db.execute("SELECT * FROM wkim_documents WHERE id=?",(document_id,)).fetchone()
        self._event(user_id,"KnowledgeIndexed",workspace_id,document_id,{"domain":domain,"classification":kind,"hash":digest})
        return {**self._document_public(row),"idempotent_replay":False}

    @staticmethod
    def _hash_file(path:Path) -> str:
        digest=hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b""): digest.update(chunk)
        return digest.hexdigest()

    def catalog(self,user_id:int,workspace_id:str|None=None,domain:str|None=None) -> list[dict]:
        clauses=["user_id=?","index_status!='deleted'"]; params:list[object]=[user_id]
        if workspace_id: clauses.append("workspace_id=?"); params.append(workspace_id)
        if domain: clauses.append("domain=?"); params.append(domain)
        with self.ceda._connect() as db:
            rows=db.execute(f"SELECT * FROM wkim_documents WHERE {' AND '.join(clauses)} ORDER BY updated_at DESC",params).fetchall()
        return [item for row in rows if (item:=self._document_public(row)) and self._decision(user_id,"read_knowledge",domain=item["domain"],workspace=item["workspace_id"],sensitivity=item["security_classification"],purpose="Read WKIM catalog metadata")["allowed"]]

    def _document_public(self,row) -> dict:
        stored_location=self.ceda._decrypt(row["physical_location"])
        visible_location="Uploaded from this device" if row["source_kind"]=="explicit_upload" else stored_location
        return {"document_id":row["id"],"workspace_id":row["workspace_id"],"physical_location":visible_location,
                "file_hash":row["file_hash"],"file_type":row["file_type"],"size_bytes":row["size_bytes"],
                "title":self.ceda._decrypt(row["title"]),"summary":self.ceda._decrypt(row["summary"]),"domain":row["domain"],
                "classification":row["classification"],"policy_binding":row["policy_binding"],"embedding_ref":row["embedding_ref"],
                "last_indexed_at":row["last_indexed_at"],"version":row["version"],"security_classification":row["security_classification"],
                "index_status":row["index_status"],"metadata":json.loads(self.ceda._decrypt(row["metadata"])),
                "context_links":json.loads(row["context_links"]),"source_kind":row["source_kind"],"created_at":row["created_at"],"updated_at":row["updated_at"]}

    def search(self,user_id:int,query:str,*,workspace_id:str|None=None,domain:str|None=None,limit:int=20) -> list[dict]:
        terms=set(re.findall(r"[a-z0-9-]+",query.casefold())); ranked=[]
        for item in self.catalog(user_id,workspace_id,domain):
            metadata=" ".join(map(str,item["metadata"].values())).casefold()
            words=set(re.findall(r"[a-z0-9-]+",f"{item['title']} {item['summary']} {item['domain']} {item['classification']} {metadata}".casefold()))
            overlap=len(terms & words)
            if terms and not overlap: continue
            ranked.append({**item,"relevance_score":round(overlap*4 + (2 if item["domain"] in query.casefold() else 0),3)})
        return sorted(ranked,key=lambda item:(item["relevance_score"],item["updated_at"]),reverse=True)[:max(1,min(limit,100))]

    def remove_document_reference(self,user_id:int,document_id:str) -> dict:
        with self.ceda._connect() as db:
            row=db.execute("SELECT * FROM wkim_documents WHERE id=? AND user_id=?",(document_id,user_id)).fetchone()
        if not row: raise WKIMError("Knowledge reference was not found")
        decision=self._decision(user_id,"delete_knowledge_reference",domain=row["domain"],workspace=row["workspace_id"],
                                sensitivity=row["security_classification"],purpose="Remove WKIM metadata without deleting the original file")
        if decision["requires_consent"]: return {"status":"pending_consent","policy_decision":decision}
        workspace_id=row["workspace_id"]
        with self.ceda._connect() as db:
            db.execute("DELETE FROM wkim_documents WHERE id=? AND user_id=?",(document_id,user_id))
        self._event(user_id,"KnowledgeReferenceRemoved",workspace_id,document_id,{"original_file_deleted":False})
        return {"status":"removed","document_id":document_id,"original_file_deleted":False}

    def clear_catalog(self,user_id:int,workspace_id:str|None=None) -> dict:
        clauses=["user_id=?"]; params:list[object]=[user_id]
        if workspace_id:
            self.get_workspace(user_id,workspace_id)
            clauses.append("workspace_id=?"); params.append(workspace_id)
        with self.ceda._connect() as db:
            rows=db.execute(f"SELECT id,workspace_id FROM wkim_documents WHERE {' AND '.join(clauses)}",params).fetchall()
        removed=0
        for row in rows:
            result=self.remove_document_reference(user_id,row["id"])
            if result.get("status")=="removed": removed+=1
        return {"status":"cleared","removed_references":removed,"workspace_id":workspace_id,"original_files_deleted":False}

    def disconnect_workspace(self,user_id:int,workspace_id:str,*,clear_catalog:bool=False) -> dict:
        workspace=self.get_workspace(user_id,workspace_id,internal=True)
        decision=self._decision(user_id,"disconnect_workspace",domain=workspace["category"],workspace=workspace["name"],
                                purpose="Disconnect a knowledge location without deleting original files")
        if decision["requires_consent"]: return {"status":"pending_consent","policy_decision":decision}
        with self.ceda._connect() as db:
            count=db.execute("SELECT COUNT(*) FROM wkim_documents WHERE user_id=? AND workspace_id=?",(user_id,workspace_id)).fetchone()[0]
        if count and not clear_catalog:
            raise WKIMError("Clear this workspace catalog before disconnecting the location")
        removed=0
        if count: removed=self.clear_catalog(user_id,workspace_id)["removed_references"]
        with self.ceda._connect() as db:
            db.execute("DELETE FROM wkim_workspaces WHERE id=? AND user_id=?",(workspace_id,user_id))
        self._event(user_id,"WorkspaceDisconnected",workspace_id,None,{"removed_references":removed,"original_files_deleted":False})
        return {"status":"disconnected","workspace_id":workspace_id,"removed_references":removed,"original_files_deleted":False}

    def watcher_event(self,user_id:int,workspace_id:str,event_type:str,physical_location:str) -> dict:
        workspace=self.get_workspace(user_id,workspace_id)
        if not workspace["watcher_enabled"] or not workspace["approved"]:
            raise WKIMError("Folder watcher is not enabled for this user-approved workspace")
        allowed={"created","updated","renamed","moved","deleted"}
        if event_type not in allowed: raise WKIMError("Unsupported watcher event")
        decision=self._decision(user_id,"watch_workspace",domain=workspace["category"],workspace=workspace["name"],purpose="Process an approved folder change")
        if not decision["allowed"]: return {"status":"pending_consent","policy_decision":decision}
        self._event(user_id,f"WorkspaceFile{event_type.title()}",workspace_id,None,{"path_hash":hashlib.sha256(physical_location.encode()).hexdigest()})
        return {"status":"observed","workspace_id":workspace_id,"event_type":event_type,"reindex_required":event_type in {"created","updated","renamed","moved"}}

    def health(self,user_id:int) -> dict:
        workspaces=self.list_workspaces(user_id); documents=self.catalog(user_id)
        broken=0
        with self.ceda._connect() as db:
            reference_rows=db.execute("""SELECT d.physical_location,w.storage_type FROM wkim_documents d
                JOIN wkim_workspaces w ON w.id=d.workspace_id AND w.user_id=d.user_id
                WHERE d.user_id=? AND d.index_status!='deleted'""",(user_id,)).fetchall()
        for row in reference_rows:
            if row["storage_type"] in {"local","external","application_managed"} and not Path(self.ceda._decrypt(row["physical_location"])).exists(): broken+=1
        pending=sum(item["index_status"]=="pending" for item in documents); failed=sum(item["index_status"]=="failed" for item in documents)
        score=max(0,100-broken*15-failed*20-pending*3)
        suggestions=[]
        if broken: suggestions.append(f"Repair {broken} broken knowledge reference(s).")
        if failed: suggestions.append(f"Review {failed} failed index operation(s).")
        if not workspaces: suggestions.append("Connect a user-owned workspace to begin building the knowledge catalog.")
        if not suggestions: suggestions.append("Workspace knowledge infrastructure is healthy.")
        return {"score":score,"workspaces":len(workspaces),"indexed_documents":len(documents),"broken_references":broken,
                "pending_index":pending,"failed_index":failed,"storage_strategy":"encrypted metadata and references; originals remain user-owned","suggestions":suggestions}

    def activity(self,user_id:int,limit:int=50) -> list[dict]:
        with self.ceda._connect() as db:
            rows=db.execute("SELECT * FROM wkim_activity WHERE user_id=? ORDER BY created_at DESC LIMIT ?",(user_id,max(1,min(limit,200)))).fetchall()
        return [{"activity_id":row["id"],"workspace_id":row["workspace_id"],"document_id":row["document_id"],"event_type":row["event_type"],"detail":json.loads(self.ceda._decrypt(row["detail"])),"created_at":row["created_at"]} for row in rows]

    def _event(self,user_id:int,event_type:str,workspace_id:str|None,document_id:str|None,detail:dict) -> None:
        now=self._now(); event_id=f"WKIM-{uuid.uuid4().hex.upper()}"
        with self.ceda._connect() as db:
            db.execute("INSERT INTO wkim_activity(id,user_id,workspace_id,document_id,event_type,detail,created_at) VALUES(?,?,?,?,?,?,?)",
                       (event_id,user_id,workspace_id,document_id,event_type,self.ceda._encrypt(detail),now))
        self.ceda.observe_event(user_id,event_type,{"workspace_id":workspace_id,"document_id":document_id},"wkim",event_id=event_id)
        self.ceda.audit(user_id,f"wkim.{event_type.casefold()}","workspace_knowledge",document_id or workspace_id,None,detail)


wkim_service=WorkspaceKnowledgeService(ceda_service)
