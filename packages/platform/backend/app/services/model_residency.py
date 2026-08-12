from typing import Any

from app.services.device_profile import ConnectivityMode, ResourceProfile, device_profile_manager, normalize_connectivity_mode, normalize_resource_profile
from app.services.task_complexity import TaskComplexity
from app.services.tier_policy import TierName, normalize_tier


def normalize_task_complexity(value: TaskComplexity | int | str | None) -> TaskComplexity | None:
    if value is None:
        return None
    if isinstance(value, TaskComplexity):
        return value
    try:
        return TaskComplexity(int(value))
    except (TypeError, ValueError):
        key = str(value).upper()
        return TaskComplexity.__members__.get(key)


class ModelResidencyManager:
    def plan(
        self,
        tier: TierName | str | None,
        resource_profile: ResourceProfile | str | None,
        connectivity_mode: ConnectivityMode | str | None,
        task_complexity: TaskComplexity | int | str | None = None,
    ) -> dict[str, Any]:
        normalized_tier = normalize_tier(tier)
        normalized_resource = normalize_resource_profile(resource_profile)
        normalized_connectivity = normalize_connectivity_mode(connectivity_mode)
        complexity = normalize_task_complexity(task_complexity)
        rules = device_profile_manager.get_resource_rules(normalized_resource)
        resident = list(rules["resident_models"])
        lazy = list(rules["lazy_models"])
        disabled = list(rules["disabled_local_models"])

        if normalized_resource == ResourceProfile.RAM_8GB:
            resident = ["intent_classifier"]
            disabled = sorted(set(disabled + ["qwen3:8b", "ssd-1b", "tiny-sd"]))
            lazy = [model for model in ["deepseek-r1:1.5b", "whisper-tiny"] if model not in disabled]
        elif normalized_resource == ResourceProfile.RAM_16GB:
            if "deepseek-r1:1.5b" not in resident:
                resident.append("deepseek-r1:1.5b")
            disabled = sorted(set(disabled + ["ssd-1b"]))
            lazy = [model for model in lazy if model not in disabled]
        elif normalized_resource == ResourceProfile.RAM_32GB:
            for model in ["intent_classifier", "deepseek-r1:1.5b", "qwen3:8b"]:
                if model not in resident:
                    resident.append(model)
            if normalized_tier == TierName.FREE and "ssd-1b" not in disabled:
                disabled.append("ssd-1b")

        deepseek_policy = "reasoning_only"
        if complexity == TaskComplexity.REASONING_REQUIRED:
            deepseek_policy = "preferred"
        elif complexity == TaskComplexity.CLOUD_REQUIRED and normalized_tier in {TierName.PAID, TierName.ENTERPRISE}:
            deepseek_policy = "plan_then_cloud_if_needed"

        return {
            "tier": normalized_tier.value,
            "resource_profile": normalized_resource.value,
            "connectivity_mode": normalized_connectivity.value,
            "resident_models": resident,
            "lazy_models": [model for model in lazy if model not in resident and model not in disabled],
            "disabled_local_models": sorted(set(disabled)),
            "blocked_models": sorted(set(disabled)),
            "deepseek_policy": deepseek_policy,
            "idle_unload_seconds": 300 if normalized_resource == ResourceProfile.RAM_8GB else 900 if normalized_resource == ResourceProfile.RAM_16GB else 1800,
            "cloud_fallback_allowed": normalized_connectivity != ConnectivityMode.OFFLINE and normalized_tier in {TierName.PAID, TierName.ENTERPRISE},
            "notes": [
                "8GB profiles use DeepSeek and Whisper lazily, with Qwen 8B and local image models blocked.",
                "16GB profiles can use Qwen, Whisper, and Tiny-SD lazily.",
                "DeepSeek is preferred only when reasoning is required.",
                "SSD-1B is allowed only for paid or enterprise users on capable devices.",
            ],
        }

    def can_load_model(
        self,
        model: str,
        tier: TierName | str | None,
        resource_profile: ResourceProfile | str | None,
        connectivity_mode: ConnectivityMode | str | None = None,
    ) -> bool:
        plan = self.plan(tier, resource_profile, connectivity_mode or ConnectivityMode.HYBRID)
        return model not in set(plan["disabled_local_models"])


model_residency_manager = ModelResidencyManager()
