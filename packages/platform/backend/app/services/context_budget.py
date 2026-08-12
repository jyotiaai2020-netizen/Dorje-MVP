from typing import Any

from app.services.device_profile import (
    ConnectivityMode,
    DeviceMode,
    ResourceProfile,
    device_profile_manager,
    normalize_connectivity_mode,
    normalize_device_mode,
    normalize_resource_profile,
)
from app.services.task_complexity import TaskComplexity
from app.services.tier_policy import TierName, normalize_tier


class ContextBudgetManager:
    def calculate(
        self,
        tier: TierName | str | None = None,
        device_mode: DeviceMode | str | None = None,
        resource_profile: ResourceProfile | str | None = None,
        connectivity_mode: ConnectivityMode | str | None = None,
        task_complexity: TaskComplexity | int | str | None = None,
    ) -> dict[str, Any]:
        normalized_tier = normalize_tier(tier)
        normalized_device = normalize_device_mode(device_mode)
        normalized_resource = normalize_resource_profile(resource_profile)
        normalized_connectivity = normalize_connectivity_mode(connectivity_mode)
        normalized_complexity = self._normalize_complexity(task_complexity)

        resource_budget = device_profile_manager.context_budget(normalized_resource)
        budget = {
            "max_context_tokens": resource_budget["max_context_tokens"],
            "max_recent_messages": resource_budget["max_recent_messages"],
            "max_memory_items": resource_budget["max_memory_items"],
            "max_rag_chunks": resource_budget["max_rag_chunks"],
            "max_file_excerpts": max(1, min(2, resource_budget["max_rag_chunks"])),
            "summary_required": normalized_tier == TierName.FREE,
        }

        self._apply_device_mode(budget, normalized_device)
        self._apply_connectivity_mode(budget, normalized_connectivity)
        self._apply_complexity(budget, normalized_complexity)
        self._apply_tier(budget, normalized_tier)

        return budget

    def _normalize_complexity(self, complexity: TaskComplexity | int | str | None) -> TaskComplexity:
        if isinstance(complexity, TaskComplexity):
            return complexity
        if isinstance(complexity, int):
            try:
                return TaskComplexity(complexity)
            except ValueError:
                return TaskComplexity.SIMPLE_CHAT
        if isinstance(complexity, str):
            normalized = complexity.strip().lower()
            for item in TaskComplexity:
                if normalized in {item.name.lower(), str(int(item)), str(item.value)}:
                    return item
        return TaskComplexity.SIMPLE_CHAT

    def _apply_device_mode(self, budget: dict[str, Any], device_mode: DeviceMode) -> None:
        if device_mode == DeviceMode.MOBILE:
            budget["max_context_tokens"] = min(int(budget["max_context_tokens"]), 2000)
            budget["max_recent_messages"] = min(int(budget["max_recent_messages"]), 3)
            budget["max_memory_items"] = min(int(budget["max_memory_items"]), 4)
            budget["max_rag_chunks"] = min(int(budget["max_rag_chunks"]), 3)
            budget["max_file_excerpts"] = min(int(budget["max_file_excerpts"]), 2)
            budget["summary_required"] = True

    def _apply_connectivity_mode(self, budget: dict[str, Any], connectivity_mode: ConnectivityMode) -> None:
        if connectivity_mode == ConnectivityMode.OFFLINE:
            budget["max_context_tokens"] = min(int(budget["max_context_tokens"]), 3000)
            budget["summary_required"] = True
        elif connectivity_mode == ConnectivityMode.ONLINE:
            budget["max_file_excerpts"] = max(int(budget["max_file_excerpts"]), min(4, int(budget["max_rag_chunks"])))

    def _apply_complexity(self, budget: dict[str, Any], complexity: TaskComplexity) -> None:
        if complexity == TaskComplexity.FAST_COMMAND:
            budget["max_context_tokens"] = min(int(budget["max_context_tokens"]), 600)
            budget["max_recent_messages"] = min(int(budget["max_recent_messages"]), 1)
            budget["max_memory_items"] = min(int(budget["max_memory_items"]), 1)
            budget["max_rag_chunks"] = 0
            budget["max_file_excerpts"] = 0
            return
        if complexity == TaskComplexity.SIMPLE_CHAT:
            budget["max_context_tokens"] = min(int(budget["max_context_tokens"]), 1200)
            budget["max_recent_messages"] = min(int(budget["max_recent_messages"]), 2)
            budget["max_memory_items"] = min(int(budget["max_memory_items"]), 2)
            budget["max_rag_chunks"] = 0
            budget["max_file_excerpts"] = 0
            return
        if complexity == TaskComplexity.CONTEXTUAL_RAG:
            budget["summary_required"] = True
            budget["max_file_excerpts"] = max(int(budget["max_file_excerpts"]), min(2, int(budget["max_rag_chunks"])))
            return
        if complexity == TaskComplexity.REASONING_REQUIRED:
            budget["summary_required"] = True
            budget["max_rag_chunks"] = min(int(budget["max_rag_chunks"]), max(2, int(budget["max_memory_items"])))
            budget["max_file_excerpts"] = min(int(budget["max_file_excerpts"]), int(budget["max_rag_chunks"]))
            return
        if complexity == TaskComplexity.CLOUD_REQUIRED:
            budget["summary_required"] = True
            budget["max_file_excerpts"] = max(int(budget["max_file_excerpts"]), min(4, int(budget["max_rag_chunks"])))

    def _apply_tier(self, budget: dict[str, Any], tier: TierName) -> None:
        if tier == TierName.FREE:
            budget["summary_required"] = True
            budget["max_context_tokens"] = min(int(budget["max_context_tokens"]), 1200)
            budget["max_recent_messages"] = min(int(budget["max_recent_messages"]), 2)
            budget["max_memory_items"] = min(int(budget["max_memory_items"]), 3)
            budget["max_rag_chunks"] = min(int(budget["max_rag_chunks"]), 2)
            budget["max_file_excerpts"] = min(int(budget["max_file_excerpts"]), 2)
        elif tier == TierName.ENTERPRISE:
            budget["max_file_excerpts"] = max(int(budget["max_file_excerpts"]), min(6, int(budget["max_rag_chunks"])))


context_budget_manager = ContextBudgetManager()
