"""Structured CEDA extraction and review workflow.

Raw source text is used only during extraction. Persistent records contain normalized
facts, a source reference/hash, policy metadata, and lifecycle/audit information.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
import uuid

from app.services.ceda_service import CEDAService, ceda_service, utcnow


STATUS_MAP = {"pending":"pending_review","approved":"approved","discarded":"denied"}


class StructuredCEDAService:
    def __init__(self, ceda: CEDAService) -> None:
        self.ceda=ceda; self._initialize(); self._migrate_legacy()

    def _initialize(self) -> None:
        with self.ceda._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS ceda_extraction_batches (
                    id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,source_type TEXT NOT NULL,
                    source_reference TEXT,source_hash TEXT NOT NULL,created_at TEXT NOT NULL,
                    status TEXT NOT NULL,item_count INTEGER NOT NULL,approved_count INTEGER NOT NULL DEFAULT 0,
                    denied_count INTEGER NOT NULL DEFAULT 0,UNIQUE(user_id,source_hash)
                );
                CREATE TABLE IF NOT EXISTS ceda_items (
                    id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,batch_id TEXT,parent_id TEXT,version INTEGER NOT NULL,
                    domain TEXT NOT NULL,item_type TEXT NOT NULL,summary BLOB NOT NULL,key_date TEXT,
                    related_area TEXT NOT NULL,related_item BLOB,suggested_action BLOB,
                    reminder_recommended INTEGER NOT NULL,reminder_status TEXT NOT NULL,priority TEXT NOT NULL,
                    source_type TEXT NOT NULL,source_reference TEXT,source_hash TEXT NOT NULL,policy_applied TEXT NOT NULL,
                    confidence REAL NOT NULL,status TEXT NOT NULL,context_object_id TEXT,created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,approved_at TEXT,denied_at TEXT,archived_at TEXT,superseded_by TEXT,
                    retention_days INTEGER NOT NULL,expires_at TEXT
                );
                CREATE INDEX IF NOT EXISTS ix_ceda_items_user_status ON ceda_items(user_id,status,key_date);
                CREATE TABLE IF NOT EXISTS ceda_item_metadata (
                    item_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,metadata BLOB NOT NULL
                );
                CREATE TABLE IF NOT EXISTS ceda_item_audit (
                    id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,item_id TEXT NOT NULL,action TEXT NOT NULL,
                    old_status TEXT,new_status TEXT,timestamp TEXT NOT NULL,actor TEXT NOT NULL,notes TEXT
                );
            """)
            self.ceda._ensure_column(db,"ceda_items","content_fingerprint","TEXT")
            db.execute("CREATE INDEX IF NOT EXISTS ix_ceda_item_fingerprint ON ceda_items(user_id,content_fingerprint,status)")
            for column,declaration in (("context_item_id","TEXT"),("reminder_date","TEXT"),("updated_at","TEXT")):
                self.ceda._ensure_column(db,"reminders",column,declaration)

    @staticmethod
    def clean_text(text:str) -> str:
        text=re.sub(r"\\'[0-9a-fA-F]{2}"," ",text)
        text=re.sub(r"\\par\b\s*","\n",text,flags=re.I)
        text=re.sub(r"\\(?:rtf\d*|ansi\w*|fonttbl|colortbl|viewkind\d*|pard|par|fs\d+|f\d+|b0?|i0?|ul0?)\b\s*"," ",text,flags=re.I)
        text=re.sub(r"[{}]"," ",text)
        lines=[]; seen=set()
        for raw in text.replace("\r","\n").split("\n"):
            line=re.sub(r"\s+"," ",raw).strip(" \t•-*|")
            if len(line)<2 or re.fullmatch(r"(?:page\s+)?\d+",line,re.I): continue
            key=line.casefold()
            if key in seen: continue
            seen.add(key); lines.append(line)
        return "\n".join(lines)[:50_000]

    def extract(self,user_id:int,text:str,source_type:str="manual_entry",source_reference:str="") -> dict:
        clean=self.clean_text(text); source_hash=hashlib.sha256(f"{source_type}|{source_reference}|{clean}".encode()).hexdigest()
        with self.ceda._connect() as db:
            existing=db.execute("SELECT * FROM ceda_extraction_batches WHERE user_id=? AND source_hash=?",(user_id,source_hash)).fetchone()
        if existing: return {**self.batch(user_id,existing["id"]),"idempotent_replay":True}
        if not clean: return {"status":"discarded","item_count":0,"reason":"No meaningful structured information was found."}
        domain=self.ceda.classify(clean)
        clean=re.sub(r"^\s*(academic|immigration|career|personal|social|preferences?)\s+record\s*:\s*","",clean,flags=re.I).strip()
        lines=clean.splitlines() or [clean]; lower=clean.casefold()
        date_match=re.search(r"\b(?:due|deadline|expires?|expiration|ends?|appointment)\s*(?::|-)?\s*(?:on\s+)?([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})",clean,re.I)
        key_date=date_match.group(1) if date_match else None
        title=next((line for line in lines if not re.match(r"^(due|deadline|course|topic|submission)\b",line,re.I)),lines[0])[:160]
        academic_kind=None
        if domain=="academic":
            has_time=bool(re.search(r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:morning|afternoon|evening|noon)\b",clean,re.I))
            has_schedule_word=bool(re.search(r"\b(class time|scheduled class|class schedule|meets?|lecture time)\b",clean,re.I))
            if re.search(r"\bclass\b",clean,re.I) and (has_time or has_schedule_word): academic_kind="Scheduled Class"
            elif re.search(r"\b(course|syllabus)\b|\b[A-Z]{2,}\s*-?\s*\d{2,5}[A-Z]?\b",clean,re.I): academic_kind="Course"
            if re.search(r"\b(assignment|homework|problem set|project|paper|submission|module\s*\d+|\bm\d+\b)\b",clean,re.I): academic_kind="Assignment"
            if re.search(r"\b(exam|quiz|test|midterm|final)\b",clean,re.I): academic_kind="Exam / Quiz"
            if re.search(r"\b(note|notes|lecture|reading|chapter|study note)\b",clean,re.I): academic_kind="Note"
        if academic_kind: item_type=academic_kind
        elif "assignment" in lower: item_type="Academic Deadline" if key_date else "Assignment"
        elif domain=="immigration": item_type="Immigration Date" if key_date else "Immigration Information"
        elif domain=="preferences": item_type="Preference"
        elif key_date: item_type=f"{domain.title()} Deadline"
        else: item_type=f"{domain.title()} Information"
        summary=(f"{title} deadline is {key_date}." if key_date and "deadline" not in title.casefold() else title).strip()[:280]
        fingerprint=hashlib.sha256(f"{domain}|{item_type}|{re.sub(r'[^a-z0-9]+',' ',summary.casefold()).strip()}|{key_date or ''}".encode()).hexdigest()
        action=f"Create reminder 7 days before {key_date}." if key_date else "Add to Academic tasks and reminders." if item_type=="Scheduled Class" else "Save as relevant information."
        priority="high" if domain=="immigration" else "normal"
        reminder_status="required_confirmation" if domain=="immigration" and key_date else "needs_confirmation" if key_date or item_type=="Scheduled Class" else "not_needed"
        confidence=0.9 if key_date and title else 0.76 if title else 0.45
        batch_id=f"BATCH-{uuid.uuid4().hex[:12].upper()}"; item_id=f"ITEM-{uuid.uuid4().hex[:12].upper()}"; now=utcnow()
        policy=f"{domain}_context_allowed"
        metadata={"extracted_fields":{"title":title,"key_date":key_date,"record_type":item_type},"directory":item_type if domain=="academic" else domain.title(),"why":"Useful planning information extracted after normalization.","raw_retained":False}
        with self.ceda._connect() as db:
            duplicate=db.execute("SELECT id FROM ceda_items WHERE user_id=? AND content_fingerprint=? AND status NOT IN ('deleted','superseded')",(user_id,fingerprint)).fetchone()
            if duplicate:
                return {"status":"possible_duplicate","item_count":0,"duplicate_item_id":duplicate["id"]}
            db.execute("INSERT INTO ceda_extraction_batches(id,user_id,source_type,source_reference,source_hash,created_at,status,item_count) VALUES(?,?,?,?,?,?,?,?)",(batch_id,user_id,source_type,source_reference[:1000],source_hash,now,"pending_review",1))
            db.execute("""INSERT INTO ceda_items(id,user_id,batch_id,parent_id,version,domain,item_type,summary,key_date,related_area,related_item,suggested_action,reminder_recommended,reminder_status,priority,source_type,source_reference,source_hash,policy_applied,confidence,status,created_at,updated_at,retention_days,expires_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(item_id,user_id,batch_id,None,1,domain,item_type,self.ceda._encrypt(summary),key_date,domain.title(),self.ceda._encrypt(title),self.ceda._encrypt(action),int(bool(key_date) or item_type=="Scheduled Class"),reminder_status,priority,source_type,source_reference[:1000],source_hash,policy,confidence,"pending_review",now,now,365,None))
            db.execute("INSERT INTO ceda_item_metadata(item_id,user_id,metadata) VALUES(?,?,?)",(item_id,user_id,self.ceda._encrypt(metadata)))
            db.execute("UPDATE ceda_items SET content_fingerprint=? WHERE id=?",(fingerprint,item_id))
        self._audit(user_id,item_id,"extracted",None,"pending_review","ceda","Clean structured item; raw source discarded")
        return {**self.batch(user_id,batch_id),"idempotent_replay":False}

    def list_items(self,user_id:int,status:str|None=None,domain:str|None=None) -> list[dict]:
        clauses=["user_id=?"]; args:list[object]=[user_id]
        if status: clauses.append("status=?"); args.append(status)
        if domain: clauses.append("domain=?"); args.append(domain)
        with self.ceda._connect() as db: rows=db.execute(f"SELECT * FROM ceda_items WHERE {' AND '.join(clauses)} ORDER BY CASE WHEN key_date IS NULL THEN 1 ELSE 0 END,key_date,updated_at DESC",args).fetchall()
        return [self._public(row) for row in rows]

    def get_item(self,user_id:int,item_id:str) -> dict:
        with self.ceda._connect() as db:
            row=db.execute("SELECT * FROM ceda_items WHERE id=? AND user_id=?",(item_id,user_id)).fetchone()
            if not row: raise ValueError("CEDA item was not found")
        return self._public(row)

    def _public(self,row) -> dict:
        with self.ceda._connect() as db:
            meta=db.execute("SELECT metadata FROM ceda_item_metadata WHERE item_id=? AND user_id=?",(row["id"],row["user_id"])).fetchone()
            audit=db.execute("SELECT action,old_status,new_status,timestamp,actor,notes FROM ceda_item_audit WHERE item_id=? AND user_id=? ORDER BY timestamp DESC",(row["id"],row["user_id"])).fetchall()
        return {"id":row["id"],"batch_id":row["batch_id"],"parent_id":row["parent_id"],"version":row["version"],"domain":row["domain"],"type":row["item_type"],"summary":self.ceda._decrypt(row["summary"]),"key_date":row["key_date"],"related_area":row["related_area"],"related_item":self.ceda._decrypt(row["related_item"]) if row["related_item"] else "","suggested_action":self.ceda._decrypt(row["suggested_action"]) if row["suggested_action"] else "","reminder_recommended":bool(row["reminder_recommended"]),"reminder_status":row["reminder_status"],"priority":row["priority"],"source_type":row["source_type"],"source_reference":row["source_reference"],"policy_applied":row["policy_applied"],"confidence":row["confidence"],"status":row["status"],"context_object_id":row["context_object_id"],"created_at":row["created_at"],"updated_at":row["updated_at"],"approved_at":row["approved_at"],"denied_at":row["denied_at"],"archived_at":row["archived_at"],"superseded_by":row["superseded_by"],"expires_at":row["expires_at"],"metadata":json.loads(self.ceda._decrypt(meta["metadata"])) if meta else {},"audit_events":[dict(item) for item in audit]}

    def transition(self,user_id:int,item_id:str,target:str) -> dict:
        allowed={"pending_review":{"approved","denied","deleted"},"approved":{"archived","deleted"},"denied":{"deleted"},"archived":{"approved","deleted"}}
        item=self.get_item(user_id,item_id); old=item["status"]
        if target not in allowed.get(old,set()): raise ValueError(f"Invalid CEDA item transition: {old} -> {target}")
        now=utcnow(); context_object_id=item["context_object_id"]
        if target=="approved" and not context_object_id:
            with self.ceda._connect() as db:
                candidate_id=f"structured-{item_id}"
                existing=db.execute("SELECT * FROM context_items WHERE id=?",(candidate_id,)).fetchone()
                if not existing:
                    db.execute("""INSERT INTO context_items(id,user_id,category,kind,summary,instruction,source,source_ref,tags,policy,permission,status,confidence,action,requires_confirmation,expires_at,created_at,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(candidate_id,user_id,item["domain"],item["type"],self.ceda._encrypt(item["summary"]),self.ceda._encrypt(item["summary"]),item["source_type"],item["source_reference"],json.dumps([item["domain"],item["type"]]),item["policy_applied"],"approved","pending",item["confidence"],item["suggested_action"],1,item["expires_at"],now,now))
            context_object_id=self.ceda.decide(user_id,candidate_id,True)["context_object_id"]
        with self.ceda._connect() as db:
            if target=="deleted":
                db.execute("UPDATE ceda_items SET summary=?,related_item=?,suggested_action=?,source_reference=NULL,status='deleted',updated_at=? WHERE id=? AND user_id=?",(self.ceda._encrypt("Deleted information"),self.ceda._encrypt(""),self.ceda._encrypt(""),now,item_id,user_id))
                db.execute("DELETE FROM ceda_item_metadata WHERE item_id=? AND user_id=?",(item_id,user_id))
            else:
                db.execute("UPDATE ceda_items SET status=?,context_object_id=?,updated_at=?,approved_at=CASE WHEN ?='approved' THEN ? ELSE approved_at END,denied_at=CASE WHEN ?='denied' THEN ? ELSE denied_at END,archived_at=CASE WHEN ?='archived' THEN ? ELSE archived_at END WHERE id=? AND user_id=?",(target,context_object_id,now,target,now,target,now,target,now,item_id,user_id))
            if item["batch_id"]: self._update_batch(db,user_id,item["batch_id"])
        if context_object_id and target in {"archived","deleted"}:
            try: self.ceda.transition_context_object(user_id,context_object_id,target,"Structured CEDA item lifecycle transition")
            except ValueError: pass
        self._audit(user_id,item_id,target,old,target,"user","")
        return self.get_item(user_id,item_id)

    def edit_copy(self,user_id:int,item_id:str,changes:dict) -> dict:
        original=self.get_item(user_id,item_id)
        if original["status"]=="deleted": raise ValueError("Deleted CEDA item cannot be edited")
        new_id=f"ITEM-{uuid.uuid4().hex[:12].upper()}"; now=utcnow(); parent=original["parent_id"] or original["id"]
        values={**original,**{key:value for key,value in changes.items() if key in {"summary","key_date","related_item","suggested_action","priority","reminder_status"}}}
        with self.ceda._connect() as db:
            row=db.execute("SELECT * FROM ceda_items WHERE id=? AND user_id=?",(item_id,user_id)).fetchone()
            db.execute("UPDATE ceda_items SET status='superseded',superseded_by=?,updated_at=? WHERE id=?",(new_id,now,item_id))
            db.execute("""INSERT INTO ceda_items(id,user_id,batch_id,parent_id,version,domain,item_type,summary,key_date,related_area,related_item,suggested_action,reminder_recommended,reminder_status,priority,source_type,source_reference,source_hash,policy_applied,confidence,status,created_at,updated_at,retention_days,expires_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(new_id,user_id,row["batch_id"],parent,row["version"]+1,row["domain"],row["item_type"],self.ceda._encrypt(str(values["summary"])[:280]),values["key_date"],row["related_area"],self.ceda._encrypt(str(values["related_item"])[:280]),self.ceda._encrypt(str(values["suggested_action"])[:500]),row["reminder_recommended"],values["reminder_status"],values["priority"],row["source_type"],row["source_reference"],row["source_hash"],row["policy_applied"],row["confidence"],"pending_review",now,now,row["retention_days"],row["expires_at"]))
            meta=db.execute("SELECT metadata FROM ceda_item_metadata WHERE item_id=?",(item_id,)).fetchone()
            db.execute("INSERT INTO ceda_item_metadata(item_id,user_id,metadata) VALUES(?,?,?)",(new_id,user_id,meta["metadata"] if meta else self.ceda._encrypt({})))
            fingerprint=hashlib.sha256(f"{row['domain']}|{row['item_type']}|{re.sub(r'[^a-z0-9]+',' ',str(values['summary']).casefold()).strip()}|{values['key_date'] or ''}".encode()).hexdigest()
            db.execute("UPDATE ceda_items SET content_fingerprint=? WHERE id=?",(fingerprint,new_id))
        if original["context_object_id"]:
            try: self.ceda.transition_context_object(user_id,original["context_object_id"],"archived","Superseded by edited structured CEDA copy")
            except ValueError: pass
        self._audit(user_id,item_id,"superseded",original["status"],"superseded","user",f"Edited copy {new_id} created")
        self._audit(user_id,new_id,"edit_copy_created",None,"pending_review","user",f"Preserved original {item_id}")
        return self.get_item(user_id,new_id)

    def bulk(self,user_id:int,item_ids:list[str],target:str) -> list[dict]: return [self.transition(user_id,item_id,target) for item_id in dict.fromkeys(item_ids)]

    def create_reminder(self,user_id:int,item_id:str,option:str="7_days") -> dict:
        item=self.get_item(user_id,item_id)
        if item["status"]!="approved" or not item["key_date"]: raise ValueError("Approve a dated item before creating a reminder")
        due=self._parse_date(item["key_date"]); offsets={"same_day":0,"1_day":1,"3_days":3,"7_days":7,"14_days":14,"default_academic":7}
        days=offsets.get(option,7); reminder_date=(due-timedelta(days=days)).date().isoformat() if due else item["key_date"]
        reminder_id=f"REM-{uuid.uuid4().hex[:12].upper()}"; now=utcnow()
        with self.ceda._connect() as db:
            existing=db.execute("SELECT id FROM reminders WHERE user_id=? AND context_item_id=?",(user_id,item_id)).fetchone()
            if existing: reminder_id=existing["id"]
            else: db.execute("INSERT INTO reminders(id,user_id,context_id,context_item_id,title,due_at,reminder_date,priority,confidence,status,official_verification,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",(reminder_id,user_id,item["context_object_id"],item_id,self.ceda._encrypt(item["summary"]),due.date().isoformat() if due else item["key_date"],reminder_date,item["priority"],item["confidence"],"active",int(item["domain"]=="immigration"),now,now))
            db.execute("UPDATE ceda_items SET reminder_status='created',updated_at=? WHERE id=?",(now,item_id))
        self._audit(user_id,item_id,"reminder_created",item["status"],item["status"],"user",option)
        return {"id":reminder_id,"context_item_id":item_id,"title":item["summary"],"due_date":due.date().isoformat() if due else item["key_date"],"reminder_date":reminder_date,"priority":item["priority"],"status":"active"}

    @staticmethod
    def _parse_date(value:str):
        for fmt in ("%Y-%m-%d","%m/%d/%Y","%B %d, %Y","%B %d"):
            try:
                parsed=datetime.strptime(value,fmt).replace(tzinfo=timezone.utc)
                return parsed.replace(year=datetime.now(timezone.utc).year) if fmt=="%B %d" else parsed
            except ValueError: pass
        return None

    def batches(self,user_id:int) -> list[dict]:
        with self.ceda._connect() as db: rows=db.execute("SELECT id FROM ceda_extraction_batches WHERE user_id=? ORDER BY created_at DESC",(user_id,)).fetchall()
        return [self.batch(user_id,row["id"]) for row in rows]

    def batch(self,user_id:int,batch_id:str) -> dict:
        with self.ceda._connect() as db:
            row=db.execute("SELECT * FROM ceda_extraction_batches WHERE id=? AND user_id=?",(batch_id,user_id)).fetchone()
            if not row: raise ValueError("Extraction batch was not found")
        return {"id":row["id"],"source_type":row["source_type"],"source_reference":row["source_reference"],"source_hash":row["source_hash"],"created_at":row["created_at"],"status":row["status"],"item_count":row["item_count"],"approved_count":row["approved_count"],"denied_count":row["denied_count"],"items":self._batch_items(user_id,batch_id)}

    def _batch_items(self,user_id:int,batch_id:str) -> list[dict]:
        with self.ceda._connect() as db: rows=db.execute("SELECT * FROM ceda_items WHERE user_id=? AND batch_id=? ORDER BY created_at",(user_id,batch_id)).fetchall()
        return [self._public(row) for row in rows]

    @staticmethod
    def _update_batch(db,user_id,batch_id):
        counts={row["status"]:row["amount"] for row in db.execute("SELECT status,COUNT(*) amount FROM ceda_items WHERE user_id=? AND batch_id=? GROUP BY status",(user_id,batch_id))}
        status="completed" if not counts.get("pending_review",0) else "pending_review"
        db.execute("UPDATE ceda_extraction_batches SET status=?,approved_count=?,denied_count=? WHERE id=? AND user_id=?",(status,counts.get("approved",0),counts.get("denied",0),batch_id,user_id))

    def history(self,user_id:int,limit:int=200) -> list[dict]:
        with self.ceda._connect() as db: rows=db.execute("SELECT * FROM ceda_item_audit WHERE user_id=? ORDER BY timestamp DESC LIMIT ?",(user_id,limit)).fetchall()
        return [dict(row) for row in rows]

    def _audit(self,user_id,item_id,action,old,new,actor,notes):
        with self.ceda._connect() as db: db.execute("INSERT INTO ceda_item_audit(id,user_id,item_id,action,old_status,new_status,timestamp,actor,notes) VALUES(?,?,?,?,?,?,?,?,?)",(str(uuid.uuid4()),user_id,item_id,action,old,new,utcnow(),actor,notes[:500]))

    def _migrate_legacy(self) -> None:
        with self.ceda._connect() as db:
            rows=db.execute("SELECT * FROM context_items WHERE id NOT LIKE 'structured-%'").fetchall()
        for row in rows:
            marker=f"legacy:{row['id']}"
            with self.ceda._connect() as db:
                if db.execute("SELECT 1 FROM ceda_items WHERE source_reference=? AND user_id=?",(marker,row["user_id"])).fetchone(): continue
            summary=self.clean_text(self.ceda._decrypt(row["summary"]))[:280] or "Legacy information requires review"
            noisy=bool(re.search(r"\\rtf|\\ansi|[{}]",self.ceda._decrypt(row["summary"]),re.I))
            batch=self.extract(row["user_id"],summary,row["source"] or "legacy",marker)
            if batch.get("items"):
                item_id=batch["items"][0]["id"]
                target="pending_review" if noisy or row["status"]=="pending" else STATUS_MAP.get(row["status"],"pending_review")
                if target!="pending_review":
                    try: self.transition(row["user_id"],item_id,target)
                    except ValueError: pass


structured_ceda_service=StructuredCEDAService(ceda_service)
