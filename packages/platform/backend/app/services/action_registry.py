from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ActionRegistryEntry:
    action_type: str
    label: str
    supported_surfaces: tuple[str, ...]
    required_inputs: tuple[str, ...]
    required_capabilities: tuple[str, ...]
    required_permissions: tuple[str, ...]
    read_only: bool
    requires_confirmation: bool
    required_connector: str | None
    permitted_sensitivity: tuple[str, ...]
    processing_locality: str
    output_schema: str


class ControlledActionRegistry:
    def __init__(self) -> None:
        self.entries = {entry.action_type: entry for entry in self._default_entries()}

    def get(self, action_type: str) -> ActionRegistryEntry | None:
        return self.entries.get(action_type)

    def available_for_surface(self, surface: str) -> list[ActionRegistryEntry]:
        return [entry for entry in self.entries.values() if surface in entry.supported_surfaces]

    def validate(self, action_type: str, surface: str, sensitivity: str = "low") -> bool:
        entry = self.get(action_type)
        return bool(entry and surface in entry.supported_surfaces and sensitivity in entry.permitted_sensitivity)

    @staticmethod
    def _default_entries() -> tuple[ActionRegistryEntry, ...]:
        both = ("dorje_workspace", "kamal_chat")
        local_all = ("low", "medium", "high")
        return (
            ActionRegistryEntry("summarize_document", "Summarize", both, ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "markdown_summary"),
            ActionRegistryEntry("extract_deadlines", "Extract deadlines", both, ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "deadline_table"),
            ActionRegistryEntry("extract_action_items", "Action items", both, ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "action_item_list"),
            ActionRegistryEntry("extract_requirements", "Requirements", ("dorje_workspace",), ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "requirements_table"),
            ActionRegistryEntry("compare_documents", "Compare docs", ("dorje_workspace",), ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "comparison_table"),
            ActionRegistryEntry("validate_missing_information", "Missing info", both, ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "gap_list"),
            ActionRegistryEntry("create_study_plan", "Study plan", both, ("document",), ("daily_task_planning",), ("read_document",), True, False, None, local_all, "local", "study_plan"),
            ActionRegistryEntry("create_action_plan", "Action plan", both, ("message",), ("daily_task_planning",), ("read_context",), True, False, None, local_all, "local", "action_plan"),
            ActionRegistryEntry("analyze_dataset", "Analyze data", ("dorje_workspace",), ("document",), ("small_rag",), ("read_document",), True, False, None, ("low", "medium"), "local", "analysis"),
            ActionRegistryEntry("assess_methodology", "Assess method", ("dorje_workspace",), ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "methodology_review"),
            ActionRegistryEntry("extract_citations", "Citations", ("dorje_workspace",), ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "citation_list"),
            ActionRegistryEntry("draft_email", "Draft email", both, ("message",), ("basic_chat",), ("draft_email",), True, False, None, ("low", "medium"), "local", "email_draft"),
            ActionRegistryEntry("draft_response", "Draft response", both, ("document",), ("basic_chat",), ("draft_response",), True, False, None, local_all, "local", "draft"),
            ActionRegistryEntry("draft_questions", "Draft questions", both, ("document",), ("basic_chat",), ("read_document",), True, False, None, local_all, "local", "question_list"),
            ActionRegistryEntry("create_task_candidates", "Task candidates", both, ("document",), ("daily_task_planning",), ("read_document",), True, False, None, local_all, "local", "task_candidates"),
            ActionRegistryEntry("create_reminder_candidates", "Prepare reminders", both, ("document",), ("reminders",), ("read_document", "prepare_reminders"), False, True, None, local_all, "local", "reminder_preview"),
            ActionRegistryEntry("check_calendar_conflicts", "Check conflicts", both, ("calendar",), ("reminders",), ("read_calendar",), True, False, "google-calendar", ("low", "medium"), "hybrid", "conflict_report"),
            ActionRegistryEntry("prepare_calendar_event", "Calendar draft", both, ("message",), ("reminders",), ("prepare_calendar",), False, True, "google-calendar", ("low", "medium"), "hybrid", "calendar_preview"),
            ActionRegistryEntry("export_table", "Export table", ("dorje_workspace",), ("document",), ("small_rag",), ("read_document",), True, False, None, local_all, "local", "table_export"),
            ActionRegistryEntry("link_to_workspace", "Link workspace", ("dorje_workspace",), ("document",), ("small_rag",), ("link_workspace",), False, True, None, local_all, "local", "link_preview"),
            ActionRegistryEntry("continue_previous_work", "Continue", both, ("context",), ("basic_chat",), ("read_context",), True, False, None, ("low", "medium"), "local", "prompt"),
            ActionRegistryEntry("review_open_actions", "Open actions", both, ("context",), ("daily_task_planning",), ("read_context",), True, False, None, ("low", "medium"), "local", "action_summary"),
            ActionRegistryEntry("plan_day", "Plan my day", ("kamal_chat",), ("context",), ("daily_task_planning",), ("read_context",), True, False, None, ("low", "medium"), "local", "day_plan"),
        )


action_registry = ControlledActionRegistry()
