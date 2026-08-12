from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.models.user import User
from app.services.ceda_service import ceda_service

router = APIRouter(prefix="/tasks", tags=["Tasks"])

TASK_CATEGORIES = {"academic", "health", "immigration", "career", "family", "finance", "holiday", "personal"}
TERMINAL_STATUSES = {"completed", "cancelled", "archived", "deleted"}


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _category(title: str) -> str:
    lower = title.lower()
    if any(word in lower for word in ["visa", "i-20", "i20", "opt", "cpt", "uscis", "passport", "sevis"]):
        return "immigration"
    if any(word in lower for word in ["resume", "career", "job", "interview", "recruiter", "linkedin"]):
        return "career"
    if any(word in lower for word in ["family", "relationship", "parent", "home"]):
        return "family"
    if any(word in lower for word in ["health", "doctor", "workout", "medicine"]):
        return "health"
    if any(word in lower for word in ["bill", "rent", "fee", "payment", "finance", "budget"]):
        return "finance"
    if any(word in lower for word in ["holiday", "travel", "trip", "flight"]):
        return "holiday"
    if any(word in lower for word in ["personal", "habit", "errand"]):
        return "personal"
    return "academic"


def _task_from_reminder(reminder: dict[str, Any]) -> dict[str, Any]:
    due_at = reminder.get("due_at") or reminder.get("reminder_date")
    status = reminder.get("status") or "active"
    if status not in {"draft", "active", "in_progress", "completed", "cancelled", "archived", "deleted"}:
        status = "active"
    priority = (reminder.get("priority") or "normal").lower()
    if priority not in {"low", "normal", "high", "critical"}:
        priority = "normal"
    title = reminder.get("title") or "Untitled task"
    return {
        "id": reminder.get("id"),
        "title": title,
        "description": reminder.get("disclaimer"),
        "category": _category(title),
        "status": status,
        "priority": priority,
        "dueAt": due_at,
        "startAt": None,
        "completedAt": reminder.get("updated_at") if status == "completed" else None,
        "estimatedMinutes": None,
        "progressPercent": 100 if status == "completed" else round(float(reminder.get("confidence") or 0.64) * 100),
        "reminderIds": [reminder.get("id")] if reminder.get("id") else [],
        "calendarEventId": reminder.get("id"),
        "workspaceId": None,
        "sourceRecordId": reminder.get("context_item_id") or reminder.get("id"),
        "sensitive": bool(reminder.get("official_verification_required")) or _category(title) in {"immigration", "health", "finance"},
        "createdAt": reminder.get("created_at") or due_at,
        "updatedAt": reminder.get("updated_at") or due_at,
    }


def _is_today(task: dict[str, Any], now: datetime) -> bool:
    due_at = _parse_date(task.get("dueAt"))
    return bool(due_at and due_at.astimezone(now.tzinfo).date() == now.date())


def _is_overdue(task: dict[str, Any], now: datetime) -> bool:
    due_at = _parse_date(task.get("dueAt"))
    return bool(due_at and due_at < now and task.get("status") not in TERMINAL_STATUSES)


def _is_upcoming(task: dict[str, Any], now: datetime) -> bool:
    due_at = _parse_date(task.get("dueAt"))
    return bool(due_at and due_at.date() > now.date() and task.get("status") not in TERMINAL_STATUSES)


def _matches(task: dict[str, Any], *, scope: str | None, status: str | None, category: str | None, now: datetime) -> bool:
    if category and task.get("category") != category:
        return False
    if status:
        if status == "active":
            if task.get("status") not in {"active", "in_progress"}:
                return False
        elif task.get("status") != status:
            return False
    if scope in (None, "all"):
        return True
    if scope == "today":
        return _is_today(task, now)
    if scope == "upcoming":
        return _is_upcoming(task, now)
    if scope == "overdue":
        return _is_overdue(task, now)
    if scope == "active":
        return task.get("status") in {"active", "in_progress"}
    if scope == "completed":
        return task.get("status") == "completed"
    if scope in TASK_CATEGORIES:
        return task.get("category") == scope
    return True


def _counts(tasks: list[dict[str, Any]], now: datetime) -> dict[str, int]:
    scopes = ["all", "today", "upcoming", "overdue", "active", "completed", *sorted(TASK_CATEGORIES)]
    return {scope: len([task for task in tasks if _matches(task, scope=scope, status=None, category=None, now=now)]) for scope in scopes}


@router.get("")
def list_tasks(
    scope: str | None = Query(default="all"),
    status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    source_reminders = ceda_service.reminders(current_user.id)
    if status == "deleted" or scope == "deleted":
        visible_reminders = [reminder for reminder in source_reminders if (reminder.get("status") or "active") == "deleted"]
    else:
        visible_reminders = [reminder for reminder in source_reminders if (reminder.get("status") or "active") != "deleted"]
    tasks = [_task_from_reminder(reminder) for reminder in visible_reminders]
    return {
        "items": [task for task in tasks if _matches(task, scope=scope, status=status, category=category, now=now)],
        "counts": _counts(tasks, now),
        "rules": {
            "overdue": "dueAt < current_time and status not in completed/cancelled/archived",
            "today": "dueAt matches the user's local current date",
            "upcoming": "dueAt is after today and task is not completed",
            "active": "status is active or in_progress",
            "completed": "status is completed",
        },
    }

@router.get("/{task_id}")
def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    source_reminders = ceda_service.reminders(current_user.id)
    for reminder in source_reminders:
        if reminder.get("id") == task_id:
            return _task_from_reminder(reminder)
    raise HTTPException(status_code=404, detail="Task was not found")

