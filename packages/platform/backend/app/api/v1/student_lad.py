from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.ceda_service import ceda_service
from app.services.context_os_service import context_os_service
from app.services.device_profile import ConnectivityMode, DeviceMode, ResourceProfile
from app.services.history_policy import history_policy_engine
from app.services.memory_candidate_service import memory_candidate_service
from app.services.memory_retriever import memory_retriever
from app.services.policy_intelligence_service import PolicyIntelligenceEngine
from app.services.tier_policy import TierPolicyEngine
from app.services.workspace_knowledge_service import wkim_service
from app.api.v1.user_settings import response_from_values, setting_for_user

router = APIRouter(prefix="/student-lad", tags=["Student-LAD ViewModels"])
tier_policy_engine = TierPolicyEngine()


def _mode(current_user: User, db: Session) -> dict[str, Any]:
    setting = setting_for_user(db, current_user.id)
    profile = (
        response_from_values(setting.device_mode, setting.resource_profile, setting.connectivity_mode)
        if setting is not None
        else response_from_values(DeviceMode.DESKTOP, ResourceProfile.RAM_16GB, ConnectivityMode.HYBRID)
    )
    connectivity = profile["connectivity_mode"]
    return {
        "execution_mode": "cloud" if connectivity == ConnectivityMode.ONLINE.value else connectivity,
        "device_mode": profile["device_mode"],
        "resource_profile": profile["resource_profile"],
        "label": {
            "offline": "Offline · Local processing only",
            "hybrid": "Hybrid · Local first, cloud with approval",
            "online": "Cloud · Connected services enabled",
        }.get(connectivity, "Hybrid · Local first, cloud with approval"),
        "resource_label": {"8gb": "Lightweight", "16gb": "Standard", "32gb": "High Performance"}.get(profile["resource_profile"], "Standard"),
    }


def _context(current_user: User) -> list[dict[str, Any]]:
    return context_os_service.registry(current_user.id)


def _reminders(current_user: User) -> list[dict[str, Any]]:
    return ceda_service.reminders(current_user.id)


def _dashboard_payload(current_user: User, db: Session) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    reminders = _reminders(current_user)
    context = _context(current_user)
    health = context_os_service.health(current_user.id)
    knowledge_health = wkim_service.health(current_user.id)
    mode = _mode(current_user, db)
    tier = tier_policy_engine.resolve_user_tier(current_user)
    return {
        "user": {"id": current_user.id, "email": current_user.email, "name": getattr(current_user, "full_name", None) or current_user.email.split("@")[0]},
        "mode": {**mode, "tier": tier.value},
        "today": {
            "date": now.date().isoformat(),
            "greeting": "Good morning",
            "focus": reminders[:3],
        },
        "priorities": reminders[:5],
        "events": reminders,
        "tasks": [item for item in reminders if item.get("status") != "completed"],
        "alerts": [],
        "academic": {"saved_information": len([item for item in context if item.get("domain") == "academic"])},
        "immigration": {"saved_information": len([item for item in context if item.get("domain") == "immigration"])},
        "career": {"saved_information": len([item for item in context if item.get("domain") == "career"])},
        "family": {"saved_information": len([item for item in context if item.get("domain") == "family"])},
        "health": {"saved_information": len([item for item in context if item.get("domain") == "health"])},
        "finance": {"saved_information": len([item for item in context if item.get("domain") == "finance"])},
        "holidays": {"region": "United States"},
        "knowledge": knowledge_health,
        "pending_actions": [],
        "recommendations": ["Use Kamal to create reminders, tasks, notes, and calendar drafts without invoking the planner."],
        "system_status": {"context_health": health, "storage_strategy": "references_first", "raw_chat_is_durable": False},
    }


@router.get("/dashboard")
def dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _dashboard_payload(current_user, db)


@router.get("/my-day")
def my_day(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = _dashboard_payload(current_user, db)
    return {"today": payload["today"], "priorities": payload["priorities"], "tasks": payload["tasks"], "mode": payload["mode"]}


@router.get("/calendar")
def calendar(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = _dashboard_payload(current_user, db)
    return {"events": payload["events"], "holidays": payload["holidays"], "mode": payload["mode"]}


@router.get("/tasks")
def tasks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = _dashboard_payload(current_user, db)
    return {"tasks": payload["tasks"], "priorities": payload["priorities"], "mode": payload["mode"]}


@router.get("/review")
def review(current_user: User = Depends(get_current_user)):
    return {
        "needs_review": ceda_service.pending(current_user.id),
        "saved_information": context_os_service.registry(current_user.id),
        "history": [],
    }


@router.get("/memory")
def memory(current_user: User = Depends(get_current_user)):
    return {
        "recent_chats": [],
        "saved_information": context_os_service.registry(current_user.id),
        "pending_memories": [item.to_dict() for item in memory_candidate_service.list_candidates(user_id=current_user.id, status="pending")],
        "retrieval_preview": memory_retriever.retrieve("", user_id=current_user.id, limit=5),
    }


@router.get("/settings")
def settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    policy_engine = PolicyIntelligenceEngine(ceda_service)
    tier = tier_policy_engine.resolve_user_tier(current_user)
    return {
        "mode": _mode(current_user, db),
        "history_policy": history_policy_engine.response_for_tier(tier),
        "policies": ceda_service.policies(current_user.id),
        "permission_templates": policy_engine.list_policies(current_user.id),
    }


def _settings_summary_payload(current_user: User, db: Session) -> dict[str, Any]:
    mode = _mode(current_user, db)
    tier = tier_policy_engine.resolve_user_tier(current_user)
    history = history_policy_engine.response_for_tier(tier)
    return {
        "profile": {
            "display_name": getattr(current_user, "full_name", None) or current_user.email.split("@")[0],
            "email": current_user.email,
            "timezone": "America/New_York",
            "institution": "Northeastern University",
            "workspace": "Fall 2026",
            "preferred_language": "English",
        },
        "appearance": {
            "theme": "system",
            "density": "comfortable",
            "text_size": "standard",
            "sidebar": "remember_last_state",
            "calendar_start": "sunday",
        },
        "ai_connectivity": {
            "mode": mode["execution_mode"],
            "label": mode["label"],
            "cloud_approval": "ask_every_time",
            "live_information": True,
            "connector_access": True,
        },
        "notifications": {
            "in_app": True,
            "desktop": True,
            "email": False,
            "calendar": True,
            "quiet_hours": {"start": "22:00", "end": "07:00", "allow_urgent": True},
        },
        "privacy": {
            "storage_mode": "local_first",
            "chat_retention_days": history["history_policy"]["raw_chat_history_days"],
            "summary_retention_days": history["history_policy"]["summary_history_days"],
            "sensitive_auto_save": False,
            "cloud_processing": "ask_first",
        },
        "connections": {
            "connected_count": 2,
            "attention_count": 0,
            "services": [
                {"name": "Google Calendar", "status": "connected", "permission": "Create events after confirmation", "last_sync": "10 minutes ago"},
                {"name": "Google Drive", "status": "connected", "permission": "Search selected files", "last_sync": "2 hours ago"},
                {"name": "Gmail", "status": "not_connected", "permission": "Send email after confirmation", "last_sync": "never"},
            ],
        },
        "backup": {"last_backup": "local", "status": "available"},
        "plan": {"name": tier.value.title()},
        "advanced": {
            "performance_mode": mode["resource_label"].lower().replace(" ", "_"),
            "developer_mode": False,
            "system_health": "ready",
        },
    }


@router.get("/settings/summary")
def settings_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _settings_summary_payload(current_user, db)


@router.get("/settings/{section}")
def settings_section(section: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    summary = _settings_summary_payload(current_user, db)
    section_map = {
        "account": "profile",
        "appearance": "appearance",
        "ai-connectivity": "ai_connectivity",
        "notifications": "notifications",
        "data-privacy": "privacy",
        "connections": "connections",
        "advanced": "advanced",
    }
    key = section_map.get(section)
    if key is None:
        return summary
    return summary[key]
