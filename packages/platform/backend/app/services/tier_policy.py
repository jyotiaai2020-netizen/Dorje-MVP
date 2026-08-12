from enum import Enum
from typing import Any

from app.core.config import settings


class TierName(str, Enum):
    FREE = "free"
    PAID = "paid"
    ENTERPRISE = "enterprise"


FREE_CAPABILITIES: dict[str, bool] = {
    "reminders": True,
    "notes": True,
    "basic_chat": True,
    "small_rag": True,
    "daily_task_planning": True,
    "limited_file_uploads": True,
    "local_summaries": True,
    "long_reports": False,
    "large_documents": False,
    "cloud_model_fallback": False,
    "image_generation": False,
    "video_analysis": False,
    "enterprise_connectors": False,
    "multi_device_sync": False,
}


PAID_CAPABILITIES: dict[str, bool] = {
    "reminders": True,
    "notes": True,
    "basic_chat": True,
    "small_rag": True,
    "daily_task_planning": True,
    "limited_file_uploads": True,
    "local_summaries": True,
    "long_reports": True,
    "large_documents": True,
    "cloud_model_fallback": True,
    "image_generation": True,
    "video_analysis": True,
    "enterprise_connectors": False,
    "multi_device_sync": True,
}


ENTERPRISE_CAPABILITIES: dict[str, bool] = {
    **PAID_CAPABILITIES,
    "enterprise_connectors": True,
    "admin_policy_controls": True,
    "audit_logs": True,
    "tenant_governance": True,
}

MODEL_TEST_BYPASS_CAPABILITIES = {"large_documents", "image_generation"}

CAPABILITY_MATRIX: dict[TierName, dict[str, bool]] = {
    TierName.FREE: FREE_CAPABILITIES,
    TierName.PAID: PAID_CAPABILITIES,
    TierName.ENTERPRISE: ENTERPRISE_CAPABILITIES,
}

CAPABILITY_REQUIRED_TIER: dict[str, TierName] = {
    capability: TierName.PAID
    for capability, allowed in PAID_CAPABILITIES.items()
    if allowed and not FREE_CAPABILITIES.get(capability, False)
}
CAPABILITY_REQUIRED_TIER.update(
    {
        capability: TierName.ENTERPRISE
        for capability, allowed in ENTERPRISE_CAPABILITIES.items()
        if allowed and not PAID_CAPABILITIES.get(capability, False)
    }
)


class TierCapabilityError(PermissionError):
    def __init__(self, decision: dict[str, Any]) -> None:
        self.decision = decision
        super().__init__(str(decision.get("reason", "Capability is not available for this tier.")))


def normalize_tier(tier: TierName | str | None) -> TierName:
    if isinstance(tier, TierName):
        return tier
    try:
        return TierName(str(tier or settings.DEFAULT_USER_TIER).lower())
    except ValueError:
        return TierName.FREE


def get_capabilities(tier: TierName | str | None) -> dict[str, bool]:
    return dict(CAPABILITY_MATRIX[normalize_tier(tier)])


def can_use(tier: TierName | str | None, capability: str) -> bool:
    normalized = normalize_tier(tier)
    if normalized == TierName.FREE and settings.ALLOW_UPGRADE_MODEL_TEST_BYPASS and capability in MODEL_TEST_BYPASS_CAPABILITIES:
        return True
    return bool(get_capabilities(normalized).get(capability, False))


def capability_decision(tier: TierName | str | None, capability: str) -> dict[str, Any]:
    normalized = normalize_tier(tier)
    allowed = can_use(normalized, capability)
    required_tier = CAPABILITY_REQUIRED_TIER.get(capability)
    return {
        "allowed": allowed,
        "tier": normalized.value,
        "capability": capability,
        "reason": "allowed by temporary model-test bypass" if allowed and normalized == TierName.FREE and settings.ALLOW_UPGRADE_MODEL_TEST_BYPASS and capability in MODEL_TEST_BYPASS_CAPABILITIES else "allowed" if allowed else f"{capability} is available in {required_tier.value.title() if required_tier else 'a higher'} Tier",
        "upgrade_required": not allowed,
        "required_tier": required_tier.value if required_tier else None,
    }


def enforce_capability(tier: TierName | str | None, capability: str) -> None:
    decision = capability_decision(tier, capability)
    if not decision["allowed"]:
        raise TierCapabilityError(decision)


class TierPolicyEngine:
    def get_capabilities(self, tier: TierName | str | None) -> dict[str, bool]:
        return get_capabilities(tier)

    def can_use(self, tier: TierName | str | None, capability: str) -> bool:
        return can_use(tier, capability)

    def capability_decision(self, tier: TierName | str | None, capability: str) -> dict[str, Any]:
        return capability_decision(tier, capability)

    def enforce_capability(self, tier: TierName | str | None, capability: str) -> None:
        enforce_capability(tier, capability)

    def resolve_user_tier(self, user: Any) -> TierName:
        explicit = getattr(user, "subscription_tier", None) or getattr(user, "tier", None)
        if explicit:
            return normalize_tier(explicit)
        role = str(getattr(user, "role", "") or "").lower()
        if "enterprise" in role or role in {"owner", "admin", "platform_admin"}:
            return TierName.ENTERPRISE
        if "paid" in role or "pro" in role or "professional" in role:
            return TierName.PAID
        return normalize_tier(settings.DEFAULT_USER_TIER)
