from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.ceda_memory import ceda_memory_system
from app.services.context_composer import context_composer
from app.services.episodic_distiller import episodic_distiller
from app.services.memory_candidate_service import memory_candidate_service
from app.services.memory_retriever import memory_retriever
from app.services.tier_policy import TierPolicyEngine


router = APIRouter(prefix="/dorje-ai/memory", tags=["DorjeAI Memory"], dependencies=[Depends(get_current_user)])
tier_policy = TierPolicyEngine()


class MemoryCandidatePayload(BaseModel):
    conversation_id: str = "default"
    source_message_id: str = ""
    memory_type: str = "semantic"
    memory_class: str = "durable"
    category: str = "preference"
    content: str = Field(min_length=1, max_length=5000)
    workspace_id: str = "default"
    linked_entities: dict[str, Any] = Field(default_factory=dict)
    sensitivity: str | None = None
    retention_policy: str | None = None
    user_confirmation: bool = False


class MemoryApprovePayload(BaseModel):
    candidate_id: str


class MemoryRejectPayload(BaseModel):
    candidate_id: str


class MemoryUpdatePayload(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


class MemoryFeedbackPayload(BaseModel):
    conversation_id: str = "default"
    message_id: str = ""
    feedback_type: str
    edited_text: str | None = None
    target_memory_id: str | None = None
    candidate_id: str | None = None
    content: str | None = None


class MemoryDistillPayload(BaseModel):
    user_message: str = ""
    assistant_response: str = ""
    feedback_type: str | None = None
    edited_text: str | None = None
    intent: str = "memory_update"
    workspace_id: str = "default"
    conversation_id: str = "default"


class ContextComposePayload(BaseModel):
    message: str
    workspace_id: str = "default"
    intent: str = "basic_chat"
    device_mode: str = "desktop"
    resource_profile: str = "16gb"
    connectivity_mode: str = "hybrid"
    task_complexity: str = "simple_chat"
    include_sensitive: bool = False


def org_id(user: User) -> str | None:
    return str(user.organization_id) if user.organization_id is not None else None


@router.get("")
def list_memory(status: str | None = Query(default=None), workspace_id: str | None = Query(default=None), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = memory_candidate_service.list_memories(user_id=current_user.id, workspace_id=workspace_id, db=db)
    if status:
        rows = [row for row in rows if row.status == status]
    return {"items": [row.to_dict() for row in rows]}


@router.get("/pending")
def pending_memory(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"items": [row.to_dict() for row in memory_candidate_service.list_candidates(user_id=current_user.id, status="pending", db=db)]}


@router.post("/candidates")
def create_candidate(payload: MemoryCandidatePayload, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = payload.model_dump()
    event.update({"user_id": current_user.id, "organization_id": org_id(current_user), "user_message": payload.content, "message_id": payload.source_message_id})
    candidate = memory_candidate_service.create_candidate(event, db=db, auto_memory_enabled=True)
    return candidate.to_dict()


@router.post("/approve")
def approve_memory(payload: MemoryApprovePayload, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    candidate = memory_candidate_service.get_candidate(payload.candidate_id, db=db)
    if not candidate or str(candidate.user_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="Memory candidate not found")
    return memory_candidate_service.approve(payload.candidate_id, db=db).to_dict()


@router.post("/reject")
def reject_memory(payload: MemoryRejectPayload, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    candidate = memory_candidate_service.get_candidate(payload.candidate_id, db=db)
    if not candidate or str(candidate.user_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="Memory candidate not found")
    return memory_candidate_service.reject(payload.candidate_id, db=db).to_dict()


@router.patch("/{memory_id}")
def update_memory(memory_id: str, payload: MemoryUpdatePayload, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = memory_candidate_service.get_memory(memory_id, db=db)
    if not item or str(item.user_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="Memory not found")
    return memory_candidate_service.update_memory(memory_id, payload.content, db=db).to_dict()


@router.delete("/{memory_id}")
def delete_memory(memory_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    deleted = memory_candidate_service.forget(memory_id, user_id=current_user.id, db=db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"deleted": True, "memory_id": memory_id}


@router.post("/feedback")
def feedback(payload: MemoryFeedbackPayload, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = payload.model_dump()
    event.update({"user_id": current_user.id, "organization_id": org_id(current_user)})
    result = memory_candidate_service.feedback(event, db=db)
    if payload.feedback_type in {"rejected", "edited", "disliked", "corrected", "save_to_memory"}:
        episode = episodic_distiller.distill(event)
        if episode:
            result["episodic_lesson"] = episode
    return result


@router.post("/distill")
def distill(payload: MemoryDistillPayload, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event = payload.model_dump()
    event.update({"user_id": current_user.id, "organization_id": org_id(current_user)})
    return ceda_memory_system.process_interaction(event, db=db)


@router.post("/compose-context")
def compose_context(payload: ContextComposePayload, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tier = tier_policy.resolve_user_tier(current_user)
    return context_composer.compose(user_id=current_user.id, message=payload.message, workspace_id=payload.workspace_id, intent=payload.intent, tier=tier.value, device_mode=payload.device_mode, resource_profile=payload.resource_profile, connectivity_mode=payload.connectivity_mode, task_complexity=payload.task_complexity, include_sensitive=payload.include_sensitive, db=db)


@router.get("/export")
def export_memory(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = {
        "memories": [row.to_dict() for row in memory_candidate_service.list_memories(user_id=current_user.id, db=db)],
        "pending": [row.to_dict() for row in memory_candidate_service.list_candidates(user_id=current_user.id, status="pending", db=db)],
    }
    return JSONResponse(content=data, headers={"Content-Disposition": "attachment; filename=student-lad-memory.json"})


@router.get("/retrieve")
def retrieve_memory(q: str, workspace_id: str = "default", intent: str = "", include_sensitive: bool = False, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"items": memory_retriever.retrieve(q, user_id=current_user.id, workspace_id=workspace_id, intent=intent, include_sensitive=include_sensitive, db=db)}
