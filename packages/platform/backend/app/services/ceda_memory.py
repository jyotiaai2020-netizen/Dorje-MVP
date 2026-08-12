from __future__ import annotations

from typing import Any

from app.services.episodic_distiller import episodic_distiller
from app.services.memory_candidate_service import memory_candidate_service


class CEDAMemorySystem:
    """Capture → Understand → Link → Evaluate → Decide → Act → Learn → Update Context."""

    def process_interaction(self, event: dict[str, Any], *, db: Any | None = None, auto_memory_enabled: bool = True) -> dict[str, Any]:
        normalized = self.capture(event)
        category = self.understand(normalized)
        linked = self.link({**normalized, "category": category})
        candidate = memory_candidate_service.create_candidate(linked, db=db, auto_memory_enabled=auto_memory_enabled)
        episode = episodic_distiller.distill(linked)
        episodic_candidate = None
        if episode:
            episodic_candidate = memory_candidate_service.create_candidate({**linked, "category": episode["category"], "memory_type": "episodic", "memory_class": "durable", "distilled_content": episode["lesson"], "confidence": episode["confidence"]}, db=db, auto_memory_enabled=auto_memory_enabled)
        return {"candidate": candidate.to_dict(), "episodic_candidate": episodic_candidate.to_dict() if episodic_candidate else None, "context_updated": candidate.status == "approved"}

    def capture(self, event: dict[str, Any]) -> dict[str, Any]:
        return {
            "user_id": str(event.get("user_id") or "anonymous"),
            "organization_id": event.get("organization_id"),
            "workspace_id": str(event.get("workspace_id") or "default"),
            "conversation_id": str(event.get("conversation_id") or "default"),
            "message_id": str(event.get("message_id") or event.get("source_message_id") or ""),
            "user_message": str(event.get("user_message") or ""),
            "assistant_response": str(event.get("assistant_response") or ""),
            "intent": str(event.get("intent") or "basic_chat"),
            "task_type": str(event.get("task_type") or event.get("intent") or "basic_chat"),
            "entities": dict(event.get("entities") or {}),
            "files_used": list(event.get("files_used") or []),
            "tools_used": list(event.get("tools_used") or []),
            "models_used": list(event.get("models_used") or []),
            "route": str(event.get("route") or "local_model"),
            "timestamp": str(event.get("timestamp") or ""),
            "feedback_type": event.get("feedback_type"),
            "edited_text": event.get("edited_text"),
        }

    def understand(self, event: dict[str, Any]) -> str:
        from app.services.memory_candidate_service import detect_category, detect_sensitivity
        text = f"{event.get('user_message','')} {event.get('assistant_response','')} {event.get('feedback_type','')}"
        if detect_sensitivity(text) == "high":
            return "sensitive_information"
        return detect_category(text)

    def link(self, event: dict[str, Any]) -> dict[str, Any]:
        return {**event, "linked_entities": {"user": event.get("user_id"), "workspace": event.get("workspace_id"), "intent": event.get("intent"), **dict(event.get("entities") or {})}}


ceda_memory_system = CEDAMemorySystem()
