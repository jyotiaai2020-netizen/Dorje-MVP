from typing import Any

from app.services.device_profile import ResourceProfile, device_profile_manager, normalize_resource_profile
from app.core.config import settings
from app.services.tier_policy import TierName, normalize_tier


LARGE_DOCUMENT_BLOCK = {
    "allowed": False,
    "reason": "Large document processing is available in Paid Tier",
    "upgrade_required": True,
    "required_tier": "paid",
}


class UploadPolicyEngine:
    def limits_for(self, tier: TierName | str | None, resource_profile: ResourceProfile | str | None) -> dict[str, Any]:
        normalized_tier = normalize_tier(tier)
        normalized_resource = normalize_resource_profile(resource_profile)
        rules = device_profile_manager.get_resource_rules(normalized_resource)
        free_with_upgrade_bypass = normalized_tier == TierName.FREE and settings.ALLOW_UPGRADE_MODEL_TEST_BYPASS
        max_file_size_mb = (
            int(rules["max_file_size_mb_paid"])
            if normalized_tier in {TierName.PAID, TierName.ENTERPRISE} or free_with_upgrade_bypass
            else int(rules["max_file_size_mb_free"])
        )
        return {
            "tier": normalized_tier.value,
            "resource_profile": normalized_resource.value,
            "max_file_size_mb": max_file_size_mb,
            "max_file_size_bytes": max_file_size_mb * 1024 * 1024,
            "daily_upload_limit": None
            if normalized_tier in {TierName.PAID, TierName.ENTERPRISE}
            else int(rules["daily_upload_limit_free"]),
            "large_documents_available": normalized_tier in {TierName.PAID, TierName.ENTERPRISE} or free_with_upgrade_bypass,
            "temporary_upgrade_bypass": free_with_upgrade_bypass,
        }

    def evaluate_upload(
        self,
        tier: TierName | str | None,
        resource_profile: ResourceProfile | str | None,
        *,
        file_size_bytes: int,
        daily_upload_count: int = 0,
        large_document: bool = False,
    ) -> dict[str, Any]:
        limits = self.limits_for(tier, resource_profile)
        normalized_tier = normalize_tier(tier)

        if normalized_tier == TierName.FREE and not settings.ALLOW_UPGRADE_MODEL_TEST_BYPASS and (large_document or file_size_bytes > int(limits["max_file_size_bytes"])):
            return {
                **LARGE_DOCUMENT_BLOCK,
                "tier": normalized_tier.value,
                "resource_profile": limits["resource_profile"],
                "max_file_size_mb": limits["max_file_size_mb"],
            }

        daily_limit = limits["daily_upload_limit"]
        if isinstance(daily_limit, int) and daily_upload_count >= daily_limit:
            return {
                "allowed": False,
                "reason": f"Free Tier allows {daily_limit} uploads per day on the {limits['resource_profile'].upper()} profile",
                "upgrade_required": True,
                "required_tier": "paid",
                **limits,
            }

        if file_size_bytes > int(limits["max_file_size_bytes"]):
            return {
                "allowed": False,
                "reason": f"Files must be {limits['max_file_size_mb']} MB or smaller on the current device profile",
                "upgrade_required": False,
                "required_tier": None,
                **limits,
            }

        return {
            "allowed": True,
            "reason": "Upload allowed by tier and device profile.",
            "upgrade_required": False,
            "required_tier": None,
            **limits,
        }


upload_policy_engine = UploadPolicyEngine()
