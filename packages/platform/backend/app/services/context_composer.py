from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from app.services.context_budget import context_budget_manager
    from app.services.device_profile import ConnectivityMode, DeviceMode, ResourceProfile
    from app.services.task_complexity import TaskComplexity
    from app.services.tier_policy import TierName
except Exception:  # lightweight test fallback when optional backend deps are unavailable
    class _Budget:
        def calculate(self, tier="free", device_mode="desktop", resource_profile="16gb", connectivity_mode="hybrid", task_complexity="simple_chat"):
            return {"max_context_tokens": 1200 if tier == "free" else 3000, "max_recent_messages": 2 if tier == "free" or device_mode == "mobile" else 4, "max_memory_items": 3 if tier == "free" else 6, "max_rag_chunks": 2, "max_file_excerpts": 2, "summary_required": tier == "free" or device_mode == "mobile"}
    context_budget_manager = _Budget()
    ConnectivityMode = DeviceMode = ResourceProfile = TaskComplexity = TierName = str
from app.services.memory_retriever import memory_retriever


SKILL_DIR = Path(__file__).resolve().parents[1] / "skills"


class ContextComposer:
    def compose(self, *, user_id: str | int, message: str, workspace_id: str = "default", intent: str = "basic_chat", tier: TierName | str = "free", device_mode: DeviceMode | str = "desktop", resource_profile: ResourceProfile | str = "16gb", connectivity_mode: ConnectivityMode | str = "hybrid", task_complexity: TaskComplexity | int | str = "simple_chat", recent_messages: list[dict[str, str]] | None = None, file_excerpts: list[str] | None = None, policy_constraints: list[str] | None = None, include_sensitive: bool = False, db: Any | None = None) -> dict[str, Any]:
        budget = context_budget_manager.calculate(tier, device_mode, resource_profile, connectivity_mode, task_complexity)
        memories = memory_retriever.retrieve(message, user_id=user_id, workspace_id=workspace_id, intent=intent, include_sensitive=include_sensitive, limit=int(budget["max_memory_items"]), db=db)
        skill = self.load_skill(intent)
        messages = (recent_messages or [])[-int(budget["max_recent_messages"]):]
        excerpts = (file_excerpts or [])[: int(budget["max_file_excerpts"])]
        sections = [
            "System instructions: Use approved memory only. Do not expose sensitive memory without explicit permission.",
            "Policy constraints:\n" + "\n".join(policy_constraints or ["Tenant isolation required", "Cloud fallback must exclude sensitive memory"]),
            f"Active task: {message}",
        ]
        if skill:
            sections.append(f"Relevant procedural skill:\n{skill[:2000]}")
        if memories:
            sections.append("Relevant memory:\n" + "\n".join(f"- {row['memory']['content']}" for row in memories))
        if excerpts:
            sections.append("Retrieved document excerpts:\n" + "\n---\n".join(excerpts))
        if messages:
            sections.append("Recent conversation summary:\n" + "\n".join(f"{m.get('role')}: {m.get('content')}" for m in messages))
        return {"budget": budget, "memories": memories, "procedural_skill": skill, "composed_context": "\n\n".join(sections)}

    def load_skill(self, intent: str) -> str:
        normalized = (intent or "").lower()
        mapping = {
            "create_reminder": "reminder_creation_skill.md",
            "reminder": "reminder_creation_skill.md",
            "note": "note_capture_skill.md",
            "daily_planning": "daily_planning_skill.md",
            "rag": "rag_summary_skill.md",
            "report": "report_generation_skill.md",
            "email": "email_drafting_skill.md",
            "chart": "chart_validation_skill.md",
            "memory": "memory_update_skill.md",
        }
        for key, filename in mapping.items():
            if key in normalized:
                path = SKILL_DIR / filename
                return path.read_text() if path.exists() else ""
        return ""


context_composer = ContextComposer()
