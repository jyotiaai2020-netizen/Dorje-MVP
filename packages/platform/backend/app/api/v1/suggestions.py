from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.suggestions import (
    ActionConfirmationResponse,
    ActionDecisionResponse,
    SuggestionDismissRequest,
    SuggestionEditRequest,
    SuggestionGenerateRequest,
    SuggestionGenerateResponse,
    SuggestionResponse,
)
from app.services.suggestion_service import suggestion_service


router = APIRouter(prefix="/suggestions", tags=["CEDA Suggestions"])
actions_router = APIRouter(prefix="/actions", tags=["Governed Actions"])


def not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suggestion or action was not found")


@router.post("/generate", response_model=SuggestionGenerateResponse)
def generate_suggestions(payload: SuggestionGenerateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return suggestion_service.generate(
        db=db,
        user=current_user,
        surface=payload.surface,
        workspace_id=payload.workspace_id,
        conversation_id=payload.conversation_id,
        current_message=payload.current_message,
        files=payload.files,
        maximum_suggestions=payload.maximum_suggestions,
    )


@router.get("/{suggestion_id}", response_model=SuggestionResponse)
def get_suggestion(suggestion_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return suggestion_service.get(db=db, user=current_user, suggestion_id=suggestion_id)
    except LookupError as exc:
        raise not_found() from exc


@router.post("/{suggestion_id}/select", response_model=ActionConfirmationResponse)
def select_suggestion(suggestion_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return suggestion_service.select(db=db, user=current_user, suggestion_id=suggestion_id)
    except LookupError as exc:
        raise not_found() from exc


@router.post("/{suggestion_id}/edit", response_model=SuggestionResponse)
def edit_suggestion(suggestion_id: str, payload: SuggestionEditRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return suggestion_service.edit(db=db, user=current_user, suggestion_id=suggestion_id, edited_instruction=payload.edited_instruction)
    except LookupError as exc:
        raise not_found() from exc


@router.post("/{suggestion_id}/dismiss", response_model=SuggestionResponse)
def dismiss_suggestion(suggestion_id: str, payload: SuggestionDismissRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return suggestion_service.dismiss(db=db, user=current_user, suggestion_id=suggestion_id, reason=payload.reason)
    except LookupError as exc:
        raise not_found() from exc


@actions_router.post("/{action_id}/confirm", response_model=ActionDecisionResponse)
def confirm_action(action_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return suggestion_service.confirm_action(db=db, user=current_user, action_id=action_id)
    except LookupError as exc:
        raise not_found() from exc


@actions_router.post("/{action_id}/cancel", response_model=ActionDecisionResponse)
def cancel_action(action_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return suggestion_service.cancel_action(db=db, user=current_user, action_id=action_id)
    except LookupError as exc:
        raise not_found() from exc


@actions_router.get("/{action_id}/events")
def action_events(action_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return suggestion_service.action_events(db=db, user=current_user, action_id=action_id)
    except LookupError as exc:
        raise not_found() from exc
