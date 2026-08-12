from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.models.user import User
from app.services.ceda_service import IMMIGRATION_DISCLAIMER, ceda_service

router = APIRouter(prefix="/reminders", tags=["Reminder Service"])


class ReminderRequest(BaseModel):
    title: str = Field(min_length=1, max_length=280)
    due_at: str | None = Field(default=None, max_length=100)
    reminder_date: str | None = Field(default=None, max_length=100)
    priority: str = Field(default="normal", pattern="^(low|normal|high|critical)$")
    source: str = Field(default="kamal", max_length=80)


class ReminderUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=280)
    due_at: str | None = Field(default=None, max_length=100)
    reminder_date: str | None = Field(default=None, max_length=100)
    priority: str | None = Field(default=None, pattern="^(low|normal|high|critical)$")
    status: str | None = Field(default=None, pattern="^(active|suggested|completed|archived|deleted)$")


@router.get("")
def list_reminders(current_user: User = Depends(get_current_user)):
    return {"items": ceda_service.reminders(current_user.id), "immigration_disclaimer": IMMIGRATION_DISCLAIMER}


@router.post("")
def create_reminder(request: ReminderRequest, current_user: User = Depends(get_current_user)):
    return ceda_service.create_local_reminder(
        current_user.id,
        title=request.title,
        due_at=request.due_at,
        reminder_date=request.reminder_date,
        priority=request.priority,
        source=request.source,
    )


@router.patch("/{reminder_id}")
def update_reminder(reminder_id: str, request: ReminderUpdateRequest, current_user: User = Depends(get_current_user)):
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


@router.delete("/{reminder_id}")
def delete_reminder(reminder_id: str, current_user: User = Depends(get_current_user)):
    try:
        return ceda_service.delete_local_reminder(current_user.id, reminder_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

