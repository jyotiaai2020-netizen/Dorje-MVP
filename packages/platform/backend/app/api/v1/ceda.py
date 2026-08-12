from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.models.user import User
from app.services.ceda_service import IMMIGRATION_DISCLAIMER, ceda_service
from app.services.ceda_structured_service import structured_ceda_service

router = APIRouter(prefix="/ceda", tags=["CEDA Context Operating System"])


class CaptureRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)
    source: str = Field(default="manual_note", max_length=100)
    source_ref: str = Field(default="", max_length=1000)


class DecisionRequest(BaseModel):
    approved: bool


class PolicyRequest(BaseModel):
    rules: dict[str, Any]


class EventRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=100)
    payload: dict[str, Any]
    source_module: str = Field(min_length=1, max_length=100)
    event_id: str | None = Field(default=None, max_length=100)
    correlation_id: str | None = Field(default=None, max_length=100)
    sensitivity: str = Field(default="private", pattern="^(public|internal|private|sensitive)$")
    schema_version: int = Field(default=1, ge=1, le=100)


class ContextUpdateRequest(BaseModel):
    changes: dict[str, Any]
    reason: str = Field(min_length=3, max_length=200)


class TransitionRequest(BaseModel):
    target: str = Field(pattern="^(active|dormant|archived|deleted)$")
    reason: str = Field(min_length=3, max_length=200)


class LinkRequest(BaseModel):
    source_id: str = Field(min_length=1, max_length=100)
    target_id: str = Field(min_length=1, max_length=100)
    relation: str = Field(min_length=1, max_length=50)
    metadata: dict[str, Any] = Field(default_factory=dict)


class StructuredExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    source_type: str = Field(default="manual_entry", max_length=100)
    source_reference: str = Field(default="", max_length=1000)


class ItemEditRequest(BaseModel):
    changes: dict[str, Any]


class BulkItemRequest(BaseModel):
    item_ids: list[str] = Field(min_length=1, max_length=200)


class ReminderFromContextRequest(BaseModel):
    option: str = Field(default="7_days", pattern="^(same_day|1_day|3_days|7_days|14_days|custom|default_academic)$")


class LocalReminderRequest(BaseModel):
    title: str = Field(min_length=1, max_length=280)
    due_at: str | None = Field(default=None, max_length=100)
    reminder_date: str | None = Field(default=None, max_length=100)
    priority: str = Field(default="normal", pattern="^(low|normal|high|critical)$")
    source: str = Field(default="kamal", max_length=80)


class LocalReminderUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=280)
    due_at: str | None = Field(default=None, max_length=100)
    reminder_date: str | None = Field(default=None, max_length=100)
    priority: str | None = Field(default=None, pattern="^(low|normal|high|critical)$")
    status: str | None = Field(default=None, pattern="^(active|suggested|completed|archived|deleted)$")


@router.get("/dashboard")
def dashboard(current_user: User = Depends(get_current_user)):
    return ceda_service.dashboard(current_user.id)


@router.post("/capture")
def capture(request: CaptureRequest, current_user: User = Depends(get_current_user)):
    result = ceda_service.capture(current_user.id, request.text, request.source, request.source_ref)
    return result or {"status": "discarded", "reason": "No durable context was extracted; temporary conversation was not stored."}


@router.post("/events")
def observe_event(request: EventRequest, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.observe_event(current_user.id, request.event_type, request.payload, request.source_module, request.event_id, request.correlation_id, request.sensitivity, request.schema_version)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/context")
def context(category: str | None = None, current_user: User = Depends(get_current_user)):
    return ceda_service.approved(current_user.id, category)


@router.get("/objects")
def context_objects(domain: str | None = None, object_status: str = "active", current_user: User = Depends(get_current_user)):
    return ceda_service.context_objects(current_user.id, domain, object_status)


@router.get("/objects/{context_id}")
def context_object(context_id: str, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.get_context_object(current_user.id, context_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/objects/{context_id}")
def update_context_object(context_id: str, request: ContextUpdateRequest, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.update_context_object(current_user.id, context_id, request.changes, request.reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/objects/{context_id}/transition")
def transition_context_object(context_id: str, request: TransitionRequest, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.transition_context_object(current_user.id, context_id, request.target, request.reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/graph/links")
def link_context(request: LinkRequest, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.link_context(current_user.id, request.source_id, request.target_id, request.relation, request.metadata)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/pending")
def pending(current_user: User = Depends(get_current_user)):
    return ceda_service.pending(current_user.id)


@router.post("/pending/{item_id}/decision")
def decide(item_id: str, request: DecisionRequest, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.decide(current_user.id, item_id, request.approved)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/policies")
def policies(current_user: User = Depends(get_current_user)):
    return ceda_service.policies(current_user.id)


@router.put("/policies/{category}")
def update_policy(category: str, request: PolicyRequest, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.update_policy(current_user.id, category, request.rules)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/reminders")
def reminders(current_user: User = Depends(get_current_user)):
    return {"items": ceda_service.reminders(current_user.id), "immigration_disclaimer": IMMIGRATION_DISCLAIMER}


@router.post("/reminders")
def create_local_reminder(request: LocalReminderRequest, current_user: User = Depends(get_current_user)):
    return ceda_service.create_local_reminder(
        current_user.id,
        title=request.title,
        due_at=request.due_at,
        reminder_date=request.reminder_date,
        priority=request.priority,
        source=request.source,
    )


@router.patch("/reminders/{reminder_id}")
def update_local_reminder(reminder_id: str, request: LocalReminderUpdateRequest, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.update_local_reminder(
            current_user.id,
            reminder_id,
            title=request.title,
            due_at=request.due_at,
            reminder_date=request.reminder_date,
            priority=request.priority,
            status=request.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/reminders/{reminder_id}")
def delete_local_reminder(reminder_id: str, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.delete_local_reminder(current_user.id, reminder_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/items")
def structured_items(item_status: str | None = None, status: str | None = None, domain: str | None = None, current_user: User = Depends(get_current_user)):
    selected=status or item_status
    selected={"pending":"pending_review","discarded":"denied","active":"approved"}.get(selected,selected)
    return structured_ceda_service.list_items(current_user.id, selected, domain)


@router.get("/batches")
def extraction_batches(current_user: User = Depends(get_current_user)):
    return structured_ceda_service.batches(current_user.id)


@router.post("/extract")
def structured_extract(request: StructuredExtractRequest, current_user: User = Depends(get_current_user)):
    return structured_ceda_service.extract(current_user.id, request.text, request.source_type, request.source_reference)


def item_transition(item_id: str, target: str, user: User):
    try: return structured_ceda_service.transition(user.id, item_id, target)
    except ValueError as exc: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/items/{item_id}/approve")
def approve_item(item_id: str, current_user: User = Depends(get_current_user)): return item_transition(item_id, "approved", current_user)


@router.post("/items/{item_id}/deny")
def deny_item(item_id: str, current_user: User = Depends(get_current_user)): return item_transition(item_id, "denied", current_user)


@router.post("/items/{item_id}/delete")
def delete_item(item_id: str, current_user: User = Depends(get_current_user)): return item_transition(item_id, "deleted", current_user)


@router.post("/items/{item_id}/archive")
def archive_item(item_id: str, current_user: User = Depends(get_current_user)): return item_transition(item_id, "archived", current_user)


@router.post("/items/{item_id}/edit-copy")
def edit_copy(item_id: str, request: ItemEditRequest, current_user: User = Depends(get_current_user)):
    try: return structured_ceda_service.edit_copy(current_user.id, item_id, request.changes)
    except ValueError as exc: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/items/bulk-approve")
def bulk_approve(request: BulkItemRequest, current_user: User = Depends(get_current_user)): return structured_ceda_service.bulk(current_user.id, request.item_ids, "approved")


@router.post("/items/bulk-deny")
def bulk_deny(request: BulkItemRequest, current_user: User = Depends(get_current_user)): return structured_ceda_service.bulk(current_user.id, request.item_ids, "denied")


@router.get("/item-history")
def item_history(current_user: User = Depends(get_current_user)): return structured_ceda_service.history(current_user.id)


@router.post("/reminders/from-context/{item_id}")
def reminder_from_context(item_id: str, request: ReminderFromContextRequest, current_user: User = Depends(get_current_user)):
    try: return structured_ceda_service.create_reminder(current_user.id, item_id, request.option)
    except ValueError as exc: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
