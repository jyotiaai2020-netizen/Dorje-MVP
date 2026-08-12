from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.user_setting import UserSetting
from app.services.device_profile import (
    ConnectivityMode,
    DeviceMode,
    ResourceProfile,
    device_profile_manager,
    normalize_connectivity_mode,
    normalize_device_mode,
    normalize_resource_profile,
)
from app.services.history_policy import history_policy_engine
from app.services.memory_policy import memory_policy_engine
from app.services.model_residency import model_residency_manager
from app.services.tier_policy import TierPolicyEngine
from app.services.upload_policy import upload_policy_engine

router = APIRouter(prefix="/settings", tags=["User Settings"])
tier_policy_engine = TierPolicyEngine()


class DeviceProfileRequest(BaseModel):
    device_mode: DeviceMode = DeviceMode.DESKTOP
    resource_profile: ResourceProfile = ResourceProfile.RAM_16GB
    connectivity_mode: ConnectivityMode = ConnectivityMode.HYBRID


class DeviceProfileResponse(BaseModel):
    device_mode: DeviceMode
    resource_profile: ResourceProfile
    connectivity_mode: ConnectivityMode
    resource_rules: dict[str, Any]
    connectivity_rules: dict[str, Any]


class HistoryPolicyResponse(BaseModel):
    tier: str
    history_policy: dict[str, Any]
    memory_policy: dict[str, Any]
    ui_rules: dict[str, Any]


class OrchestrationPolicyResponse(BaseModel):
    tier: str
    device_profile: dict[str, Any]
    memory_policy: dict[str, Any]
    upload_limits: dict[str, Any]
    model_residency: dict[str, Any]


class AppPreferencesRequest(BaseModel):
    preferences: dict[str, Any]


class AppPreferencesResponse(BaseModel):
    preferences: dict[str, Any]


DEFAULT_APP_PREFERENCES: dict[str, Any] = {
    "theme": "System",
    "mode": "Hybrid",
    "uiTheme": "Prism",
    "kamalAvatar": "🪷",
    "voice": "Maya",
    "accentColor": "Emerald",
    "background": "Warm White",
    "performanceProfile": "Standard",
    "notifications": {"inApp": True, "desktop": True, "email": False, "calendar": True},
}


def response_from_values(
    device_mode: DeviceMode | str | None,
    resource_profile: ResourceProfile | str | None,
    connectivity_mode: ConnectivityMode | str | None,
) -> dict[str, Any]:
    return device_profile_manager.build_profile(device_mode, resource_profile, connectivity_mode)


def setting_for_user(db: Session, user_id: int) -> UserSetting | None:
    return db.query(UserSetting).filter(UserSetting.user_id == user_id).first()


def setting_for_user_or_create(db: Session, user_id: int) -> UserSetting:
    setting = setting_for_user(db, user_id)
    if setting is None:
        setting = UserSetting(user_id=user_id)
        db.add(setting)
        db.flush()
    return setting


def _settings_json(setting: UserSetting | None) -> dict[str, Any]:
    if not setting or not isinstance(setting.settings_json, dict):
        return {}
    return dict(setting.settings_json)


def _app_preferences(setting: UserSetting | None) -> dict[str, Any]:
    raw = _settings_json(setting).get("app_preferences", {})
    if not isinstance(raw, dict):
        raw = {}
    merged = {**DEFAULT_APP_PREFERENCES, **raw}
    notifications = raw.get("notifications", {}) if isinstance(raw.get("notifications"), dict) else {}
    merged["notifications"] = {**DEFAULT_APP_PREFERENCES["notifications"], **notifications}
    return merged


@router.get("/device-profile", response_model=DeviceProfileResponse)
def get_device_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setting = setting_for_user(db, current_user.id)
    if setting is None:
        return response_from_values(DeviceMode.DESKTOP, ResourceProfile.RAM_16GB, ConnectivityMode.HYBRID)
    return response_from_values(setting.device_mode, setting.resource_profile, setting.connectivity_mode)


@router.get("/app-preferences", response_model=AppPreferencesResponse)
def get_app_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"preferences": _app_preferences(setting_for_user(db, current_user.id))}


@router.put("/app-preferences", response_model=AppPreferencesResponse)
def update_app_preferences(
    request: AppPreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setting = setting_for_user_or_create(db, current_user.id)
    current_json = _settings_json(setting)
    current = _app_preferences(setting)
    current.update(request.preferences)
    if isinstance(request.preferences.get("notifications"), dict):
        current["notifications"] = {**DEFAULT_APP_PREFERENCES["notifications"], **request.preferences["notifications"]}
    current_json["app_preferences"] = current
    current_json["source"] = "student_lad_settings"
    setting.settings_json = current_json
    db.commit()
    db.refresh(setting)
    return {"preferences": _app_preferences(setting)}


@router.get("/history-policy", response_model=HistoryPolicyResponse)
def get_history_policy(current_user: User = Depends(get_current_user)):
    tier = tier_policy_engine.resolve_user_tier(current_user)
    return history_policy_engine.response_for_tier(tier)


@router.get("/orchestration-policy", response_model=OrchestrationPolicyResponse)
def get_orchestration_policy(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    setting = setting_for_user(db, current_user.id)
    profile = (
        response_from_values(setting.device_mode, setting.resource_profile, setting.connectivity_mode)
        if setting is not None
        else response_from_values(DeviceMode.DESKTOP, ResourceProfile.RAM_16GB, ConnectivityMode.HYBRID)
    )
    tier = tier_policy_engine.resolve_user_tier(current_user)
    resource_profile = profile["resource_profile"]
    connectivity_mode = profile["connectivity_mode"]
    return {
        "tier": tier.value,
        "device_profile": profile,
        "memory_policy": memory_policy_engine.catalog(connectivity_mode=connectivity_mode, tier=tier),
        "upload_limits": upload_policy_engine.limits_for(tier, resource_profile),
        "model_residency": model_residency_manager.plan(tier, resource_profile, connectivity_mode),
    }


@router.put("/device-profile", response_model=DeviceProfileResponse)
def update_device_profile(
    request: DeviceProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    device_mode = normalize_device_mode(request.device_mode)
    resource_profile = normalize_resource_profile(request.resource_profile)
    connectivity_mode = normalize_connectivity_mode(request.connectivity_mode)
    setting = setting_for_user(db, current_user.id)
    if setting is None:
        setting = UserSetting(user_id=current_user.id)
        db.add(setting)
    setting.device_mode = device_mode.value
    setting.resource_profile = resource_profile.value
    setting.connectivity_mode = connectivity_mode.value
    current_json = _settings_json(setting)
    setting.settings_json = {
        **current_json,
        "source": "student_lad_settings",
        "device_mode": device_mode.value,
        "resource_profile": resource_profile.value,
        "connectivity_mode": connectivity_mode.value,
    }
    db.commit()
    db.refresh(setting)
    return response_from_values(setting.device_mode, setting.resource_profile, setting.connectivity_mode)
