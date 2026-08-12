from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.models.user import User
from app.services.kamal_action_engine import KamalActionError, kamal_action_engine

router = APIRouter(prefix="/kamal/actions", tags=["Kamal Action Engine"])


class ActionPreviewRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    source: Literal["voice", "text"] = "text"


class ActionExecuteRequest(BaseModel):
    action: dict[str, Any]


class ActionUndoRequest(BaseModel):
    undo_token: str | None = Field(default=None, max_length=120)


def _error_status(code: str) -> int:
    return {
        "not_found": status.HTTP_404_NOT_FOUND,
        "undo_not_found": status.HTTP_404_NOT_FOUND,
        "stale_version": status.HTTP_409_CONFLICT,
        "invalid_fields": status.HTTP_400_BAD_REQUEST,
        "invalid_operation": status.HTTP_400_BAD_REQUEST,
        "invalid_status": status.HTTP_400_BAD_REQUEST,
        "invalid_entity": status.HTTP_400_BAD_REQUEST,
        "missing_entity": status.HTTP_400_BAD_REQUEST,
        "missing_undo_token": status.HTTP_400_BAD_REQUEST,
        "unsupported_intent": status.HTTP_422_UNPROCESSABLE_ENTITY,
    }.get(code, status.HTTP_400_BAD_REQUEST)


@router.post("/preview")
def preview_action(request: ActionPreviewRequest, current_user: User = Depends(get_current_user)):
    try:
        return kamal_action_engine.preview(user_id=current_user.id, message=request.message, source=request.source)
    except KamalActionError as exc:
        raise HTTPException(status_code=_error_status(exc.code), detail=str(exc)) from exc


@router.post("/execute")
def execute_action(request: ActionExecuteRequest, current_user: User = Depends(get_current_user)):
    try:
        return kamal_action_engine.execute(user_id=current_user.id, action=request.action)
    except KamalActionError as exc:
        raise HTTPException(status_code=_error_status(exc.code), detail=str(exc)) from exc


@router.post("/undo")
def undo_action(request: ActionUndoRequest, current_user: User = Depends(get_current_user)):
    try:
        return kamal_action_engine.undo(user_id=current_user.id, undo_token=request.undo_token or "")
    except KamalActionError as exc:
        raise HTTPException(status_code=_error_status(exc.code), detail=str(exc)) from exc
