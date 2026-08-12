from enum import Enum
from typing import Any


class DeviceMode(str, Enum):
    MOBILE = "mobile"
    DESKTOP = "desktop"


class ResourceProfile(str, Enum):
    RAM_8GB = "8gb"
    RAM_16GB = "16gb"
    RAM_32GB = "32gb"


class ConnectivityMode(str, Enum):
    OFFLINE = "offline"
    HYBRID = "hybrid"
    ONLINE = "online"


DEVICE_RULES_8GB: dict[str, Any] = {
    "resident_models": ["intent_classifier"],
    "lazy_models": ["deepseek-r1:1.5b", "whisper-tiny"],
    "disabled_local_models": ["qwen3:8b", "ssd-1b", "tiny-sd"],
    "preferred_text_models": ["deepseek-r1:1.5b"],
    "preferred_reasoning_models": ["deepseek-r1:1.5b"],
    "preferred_vision_models": [],
    "preferred_image_models": [],
    "max_context_tokens": 1200,
    "max_recent_messages": 2,
    "max_memory_items": 3,
    "max_rag_chunks": 2,
    "max_file_size_mb_free": 2,
    "max_file_size_mb_paid": 10,
    "daily_upload_limit_free": 3,
    "local_summary_window_days": 7,
}


DEVICE_RULES_16GB: dict[str, Any] = {
    "resident_models": ["intent_classifier", "deepseek-r1:1.5b"],
    "lazy_models": ["qwen3:8b", "whisper-tiny", "qwen3.5:0.8b", "tiny-sd"],
    "disabled_local_models": ["ssd-1b"],
    "preferred_text_models": ["qwen3:8b"],
    "preferred_reasoning_models": ["deepseek-r1:1.5b"],
    "preferred_vision_models": ["qwen3.5:0.8b"],
    "preferred_image_models": ["tiny-sd"],
    "max_context_tokens": 3000,
    "max_recent_messages": 4,
    "max_memory_items": 6,
    "max_rag_chunks": 4,
    "max_file_size_mb_free": 5,
    "max_file_size_mb_paid": 25,
    "daily_upload_limit_free": 5,
    "local_summary_window_days": 30,
}


DEVICE_RULES_32GB: dict[str, Any] = {
    "resident_models": ["intent_classifier", "deepseek-r1:1.5b", "qwen3:8b"],
    "lazy_models": ["qwen3.5:0.8b", "whisper-tiny", "tiny-sd", "ssd-1b"],
    "disabled_local_models": [],
    "preferred_text_models": ["qwen3:8b"],
    "preferred_reasoning_models": ["deepseek-r1:1.5b", "qwen3:8b"],
    "preferred_vision_models": ["qwen3.5:0.8b"],
    "preferred_image_models": ["tiny-sd", "ssd-1b"],
    "max_context_tokens": 8000,
    "max_recent_messages": 8,
    "max_memory_items": 12,
    "max_rag_chunks": 8,
    "max_file_size_mb_free": 10,
    "max_file_size_mb_paid": 100,
    "daily_upload_limit_free": 10,
    "local_summary_window_days": 90,
}


RESOURCE_RULES: dict[ResourceProfile, dict[str, Any]] = {
    ResourceProfile.RAM_8GB: DEVICE_RULES_8GB,
    ResourceProfile.RAM_16GB: DEVICE_RULES_16GB,
    ResourceProfile.RAM_32GB: DEVICE_RULES_32GB,
}


CONNECTIVITY_RULES: dict[ConnectivityMode, dict[str, Any]] = {
    ConnectivityMode.OFFLINE: {
        "allowed": [
            "local_reminders",
            "local_notes",
            "basic_chat_if_local_model_available",
            "local_summaries",
            "local_rag_from_indexed_documents",
            "deterministic_exports",
            "local_task_planning",
        ],
        "blocked": [
            "cloud_model_fallback",
            "enterprise_connectors",
            "multi_device_sync",
            "web_search",
            "online_image_generation",
            "external_email_sending",
            "external_calendar_sync",
        ],
        "execution_policy": "local_only",
        "cloud_warning": "Cloud features, online connectors, and external sending are blocked.",
    },
    ConnectivityMode.HYBRID: {
        "allowed": [
            "local_first_execution",
            "cloud_fallback_if_paid",
            "connector_draft_preparation",
            "sync_when_available",
            "online_retrieval_when_required",
        ],
        "blocked": [],
        "execution_policy": "local_first",
        "cloud_warning": "Cloud use requires plan support and user approval.",
    },
    ConnectivityMode.ONLINE: {
        "allowed": [
            "cloud_model_fallback",
            "enterprise_connectors",
            "multi_device_sync",
            "large_document_processing",
            "cloud_report_generation",
            "cloud_image_video_processing_if_paid",
        ],
        "blocked": [],
        "execution_policy": "online_allowed",
        "cloud_warning": "Online execution may use approved cloud providers and connectors.",
    },
}


def normalize_device_mode(value: DeviceMode | str | None) -> DeviceMode:
    if isinstance(value, DeviceMode):
        return value
    try:
        return DeviceMode(str(value or DeviceMode.DESKTOP.value).lower())
    except ValueError:
        return DeviceMode.DESKTOP


def normalize_resource_profile(value: ResourceProfile | str | None) -> ResourceProfile:
    if isinstance(value, ResourceProfile):
        return value
    try:
        return ResourceProfile(str(value or ResourceProfile.RAM_16GB.value).lower())
    except ValueError:
        return ResourceProfile.RAM_16GB


def normalize_connectivity_mode(value: ConnectivityMode | str | None) -> ConnectivityMode:
    if isinstance(value, ConnectivityMode):
        return value
    try:
        return ConnectivityMode(str(value or ConnectivityMode.HYBRID.value).lower())
    except ValueError:
        return ConnectivityMode.HYBRID


class DeviceProfileManager:
    def get_resource_rules(self, profile: ResourceProfile | str | None) -> dict[str, Any]:
        return dict(RESOURCE_RULES[normalize_resource_profile(profile)])

    def get_connectivity_rules(self, mode: ConnectivityMode | str | None) -> dict[str, Any]:
        rules = CONNECTIVITY_RULES[normalize_connectivity_mode(mode)]
        return {
            **rules,
            "allowed": list(rules["allowed"]),
            "blocked": list(rules["blocked"]),
        }

    def build_profile(
        self,
        device_mode: DeviceMode | str | None = None,
        resource_profile: ResourceProfile | str | None = None,
        connectivity_mode: ConnectivityMode | str | None = None,
    ) -> dict[str, Any]:
        normalized_device = normalize_device_mode(device_mode)
        normalized_resource = normalize_resource_profile(resource_profile)
        normalized_connectivity = normalize_connectivity_mode(connectivity_mode)
        return {
            "device_mode": normalized_device.value,
            "resource_profile": normalized_resource.value,
            "connectivity_mode": normalized_connectivity.value,
            "resource_rules": self.get_resource_rules(normalized_resource),
            "connectivity_rules": self.get_connectivity_rules(normalized_connectivity),
        }

    def context_budget(self, resource_profile: ResourceProfile | str | None) -> dict[str, int]:
        rules = self.get_resource_rules(resource_profile)
        return {
            "max_context_tokens": int(rules["max_context_tokens"]),
            "max_recent_messages": int(rules["max_recent_messages"]),
            "max_memory_items": int(rules["max_memory_items"]),
            "max_rag_chunks": int(rules["max_rag_chunks"]),
        }

    def can_use_connectivity_feature(self, mode: ConnectivityMode | str | None, feature: str) -> bool:
        rules = self.get_connectivity_rules(mode)
        return feature not in rules["blocked"]


device_profile_manager = DeviceProfileManager()
