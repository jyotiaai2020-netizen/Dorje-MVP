from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.memory_policy import memory_policy_engine
from app.services.tier_policy import TierName, normalize_tier


FREE_HISTORY_POLICY: dict[str, int | bool | None] = {
    "raw_chat_history_days": 7,
    "summary_history_days": 30,
    "daily_summary_enabled": True,
    "weekly_summary_enabled": False,
    "cross_device_history": False,
    "max_saved_conversations": 10,
}

PAID_HISTORY_POLICY: dict[str, int | bool | None] = {
    "raw_chat_history_days": 30,
    "summary_history_days": 365,
    "daily_summary_enabled": True,
    "weekly_summary_enabled": True,
    "cross_device_history": True,
    "max_saved_conversations": 100,
}

ENTERPRISE_HISTORY_POLICY: dict[str, int | bool | None] = {
    "raw_chat_history_days": 90,
    "summary_history_days": 1825,
    "daily_summary_enabled": True,
    "weekly_summary_enabled": True,
    "cross_device_history": True,
    "max_saved_conversations": None,
    "admin_retention_policy": True,
}

HISTORY_POLICY_MATRIX: dict[TierName, dict[str, int | bool | None]] = {
    TierName.FREE: FREE_HISTORY_POLICY,
    TierName.PAID: PAID_HISTORY_POLICY,
    TierName.ENTERPRISE: ENTERPRISE_HISTORY_POLICY,
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


class HistoryPolicyEngine:
    def get_policy(self, tier: TierName | str | None) -> dict[str, int | bool | None]:
        return dict(HISTORY_POLICY_MATRIX[normalize_tier(tier)])

    def raw_expires_at(self, tier: TierName | str | None, base_time: datetime | None = None) -> datetime:
        policy = self.get_policy(tier)
        return (base_time or utc_now()) + timedelta(days=int(policy["raw_chat_history_days"] or 0))

    def summary_expires_at(self, tier: TierName | str | None, base_time: datetime | None = None) -> datetime:
        policy = self.get_policy(tier)
        return (base_time or utc_now()) + timedelta(days=int(policy["summary_history_days"] or 0))

    def apply_retention(
        self,
        conversations: list[dict[str, Any]],
        tier: TierName | str | None,
        now: datetime | None = None,
    ) -> list[dict[str, Any]]:
        policy = self.get_policy(tier)
        current_time = now or utc_now()
        raw_cutoff = current_time - timedelta(days=int(policy["raw_chat_history_days"] or 0))
        summary_cutoff = current_time - timedelta(days=int(policy["summary_history_days"] or 0))
        retained: list[dict[str, Any]] = []
        for conversation in conversations:
            updated = parse_datetime(str(conversation.get("updatedAt") or conversation.get("updated_at") or ""))
            if updated is None:
                continue
            summary = str(conversation.get("summary") or "").strip()
            if updated < summary_cutoff:
                continue
            next_conversation = dict(conversation)
            if updated < raw_cutoff:
                if not summary:
                    continue
                next_conversation["messages"] = []
                next_conversation["raw_history_expired"] = True
            retained.append(next_conversation)
        retained.sort(key=lambda item: str(item.get("updatedAt") or item.get("updated_at") or ""), reverse=True)
        limit = policy["max_saved_conversations"]
        if isinstance(limit, int):
            retained = retained[:limit]
        return retained

    def response_for_tier(self, tier: TierName | str | None) -> dict[str, Any]:
        normalized_tier = normalize_tier(tier)
        policy = self.get_policy(normalized_tier)
        return {
            "tier": normalized_tier.value,
            "history_policy": policy,
            "memory_policy": {
                "durable_memory_requires_policy_engine": True,
                "raw_chat_is_temporary": True,
                "summaries_remain_longer_than_raw_chat": True,
            },
            "ui_rules": {
                "recent_conversation_limit": 3,
                "chat_history_limit": policy["max_saved_conversations"],
                "show_daily_summary": policy["daily_summary_enabled"],
                "show_weekly_summary": policy["weekly_summary_enabled"],
                "cross_device_history": policy["cross_device_history"],
            },
        }


history_policy_engine = HistoryPolicyEngine()
