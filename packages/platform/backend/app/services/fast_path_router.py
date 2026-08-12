import ast
import operator
import re
from typing import Any

from app.services.task_complexity import (
    TaskComplexity,
    TaskComplexityScorer,
    extract_request_text,
    task_complexity_scorer,
)
from app.services.actions.action_draft_service import action_draft_service


class SafeCalculator:
    OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    def evaluate(self, expression: str) -> float | int:
        tree = ast.parse(expression, mode="eval")
        return self._eval_node(tree.body)

    def _eval_node(self, node: ast.AST) -> float | int:
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in self.OPERATORS:
            return self.OPERATORS[type(node.op)](self._eval_node(node.left), self._eval_node(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in self.OPERATORS:
            return self.OPERATORS[type(node.op)](self._eval_node(node.operand))
        raise ValueError("Unsupported calculation.")


class DeterministicHandler:
    def __init__(self) -> None:
        self.calculator = SafeCalculator()

    def execute(self, request: Any) -> dict[str, Any]:
        text = extract_request_text(request)
        normalized = re.sub(r"\s+", " ", text.strip().lower())
        action = self._detect_action(normalized)
        intent = self._intent_for_action(action)
        result: dict[str, Any] = action_draft_service.create(
            intent=intent,
            source_text=text,
            execution_mode="offline",
            requires_confirmation=action in {"reminder_draft", "calendar_draft", "task_creation", "export_request", "bill_or_subscription_draft"},
            entities={"detected_action": action},
        )
        result.update({"bypassed_planner": True, "handler": "deterministic", "action": action})
        if action == "basic_calculation":
            result.update(self._calculate(normalized))
        elif action == "reminder_draft":
            result["message"] = "Reminder draft created. Confirm before saving it to your reminders."
        elif action == "note_draft":
            result["message"] = "Note draft prepared locally."
        elif action == "task_creation":
            result["message"] = "Task draft created. Confirm before adding it to your planner."
        elif action == "export_request":
            result["message"] = "Export request is ready for the native export engine."
        elif action == "bill_or_subscription_draft":
            result["message"] = "Bill or subscription draft created. Confirm before adding it to your planner."
        elif action == "navigation_command":
            result["message"] = "Navigation command is ready for the app shell."
        elif action == "summary_retrieval":
            result["message"] = "Saved summary retrieval can use the local cache/search index."
        else:
            result["message"] = "Fast command handled without DeepSeek planning."
        return result

    @staticmethod
    def _intent_for_action(action: str) -> str:
        return {
            "reminder_draft": "create_reminder",
            "calendar_draft": "create_calendar_event",
            "task_creation": "create_task",
            "note_draft": "save_note",
            "export_request": "export_file",
            "summary_retrieval": "retrieve_saved_summary",
            "basic_calculation": "calculate",
            "bill_or_subscription_draft": "create_bill_or_subscription",
            "navigation_command": "navigate",
        }.get(action, "fast_command")

    def _detect_action(self, normalized_text: str) -> str:
        if re.search(r"\b(set|create|add|schedule)\b.{0,40}\b(reminder|alarm)\b", normalized_text):
            return "reminder_draft"
        if re.search(r"\b(calendar draft|draft calendar|create calendar draft)\b", normalized_text):
            return "calendar_draft"
        if re.search(r"\b(add|create|schedule)\b.{0,80}\b(calendar event|event|appointment|meeting|parent-teacher|doctor|dentist|school activity|holiday|birthday)\b", normalized_text):
            return "calendar_draft"
        if re.search(r"\b(create|save|add)\b.{0,40}\b(note)\b", normalized_text):
            return "note_draft"
        if re.search(r"\b(create|add)\b.{0,40}\b(task)\b|\bmark\b.{0,40}\b(done|complete|completed)\b", normalized_text):
            return "task_creation"
        if re.search(r"\b(add|track|create|update)\b.{0,80}\b(bill|subscription|membership|renewal|payment)\b", normalized_text):
            return "bill_or_subscription_draft"
        if re.search(r"\b(open|go to|show)\b.{0,40}\b(home|calendar|tasks|settings|workspace|academic|immigration|career|family|health|bills|holidays)\b", normalized_text):
            return "navigation_command"
        if re.search(r"\bexport\b.{0,40}\b(table|pdf|csv|xlsx|excel|docx|summary)\b", normalized_text):
            return "export_request"
        if re.search(r"\b(retrieve|get|show|open)\b.{0,40}\b(saved summary|summary)\b", normalized_text):
            return "summary_retrieval"
        if re.search(r"^\s*(calculate|compute|what is)\s+[-+*/().\d\s]+\??\s*$", normalized_text):
            return "basic_calculation"
        return "fast_command"

    def _calculate(self, normalized_text: str) -> dict[str, Any]:
        expression = re.sub(r"^\s*(calculate|compute|what is)\s+", "", normalized_text).strip(" ?")
        try:
            value = self.calculator.evaluate(expression)
            return {"calculation": {"expression": expression, "result": value}, "message": f"{expression} = {value}"}
        except Exception:
            return {
                "status": "needs_review",
                "calculation": {"expression": expression, "result": None},
                "message": "Calculation could not be safely evaluated by the deterministic calculator.",
            }


class FastPathRouter:
    def __init__(
        self,
        scorer: TaskComplexityScorer | None = None,
        deterministic_handler: DeterministicHandler | None = None,
    ) -> None:
        self.scorer = scorer or task_complexity_scorer
        self.deterministic_handler = deterministic_handler or DeterministicHandler()

    def should_bypass_planner(self, complexity: TaskComplexity) -> bool:
        return complexity == TaskComplexity.FAST_COMMAND

    def route(self, request: Any, complexity: TaskComplexity | None = None) -> dict[str, Any]:
        resolved_complexity = complexity or self.scorer.classify_request(request)
        if self.should_bypass_planner(resolved_complexity):
            result = self.deterministic_handler.execute(request)
            result["complexity"] = resolved_complexity.name.lower()
            result["next_step"] = "native_device_tools"
            return result
        return {
            "bypassed_planner": False,
            "complexity": resolved_complexity.name.lower(),
            "next_step": "deepseek_planner",
            "reason": "Request requires context, reasoning, cloud execution, or specialist routing.",
        }


fast_path_router = FastPathRouter()
