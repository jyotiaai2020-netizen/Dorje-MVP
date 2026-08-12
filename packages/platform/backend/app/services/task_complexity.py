import re
from enum import Enum
from typing import Any


class TaskComplexity(int, Enum):
    FAST_COMMAND = 0
    SIMPLE_CHAT = 1
    CONTEXTUAL_RAG = 2
    REASONING_REQUIRED = 3
    CLOUD_REQUIRED = 4


FAST_COMMAND_PATTERNS = [
    r"\b(set|create|add|schedule)\b.{0,40}\b(reminder|alarm)\b",
    r"\b(create|save|add)\b.{0,40}\b(note|task)\b",
    r"\bmark\b.{0,40}\b(done|complete|completed)\b",
    r"\bexport\b.{0,40}\b(table|pdf|csv|xlsx|excel|docx|summary)\b",
    r"\bsave\b.{0,40}\b(summary|draft|note)\b",
    r"\b(calendar draft|draft calendar|create calendar draft)\b",
    r"\b(add|create|schedule)\b.{0,80}\b(calendar event|event|appointment|meeting|parent-teacher|doctor|dentist|school activity|holiday|birthday)\b",
    r"\b(add|track|create|update)\b.{0,80}\b(bill|subscription|membership|renewal|payment)\b",
    r"\b(open|go to|show)\b.{0,40}\b(home|calendar|tasks|settings|workspace|academic|immigration|career|family|health|bills|holidays)\b",
    r"\b(retrieve|get|show|open)\b.{0,40}\b(saved summary|summary)\b",
    r"^\s*(calculate|compute|what is)\s+[-+*/().\d\s]+\??\s*$",
]

SIMPLE_CHAT_PATTERNS = [
    r"\b(explain|define|describe)\b.{0,80}\b(concept|term|idea|topic|meaning)\b",
    r"\b(explain|define|describe)\b",
    r"\b(rewrite|polish|improve)\b.{0,80}\b(message|sentence|paragraph|email)\b",
    r"\bbrainstorm\b.{0,80}\b(ideas|topics|names|options)\b",
]

CONTEXTUAL_RAG_PATTERNS = [
    r"\b(summarize|summary)\b.{0,80}\b(uploaded|attached|document|file|pdf|notes)\b",
    r"\b(answer|find|retrieve|search)\b.{0,80}\b(from|in)\b.{0,80}\b(notes|document|file|course|project|workspace)\b",
    r"\b(course document|project files|uploaded document|attached file|my notes|workspace files)\b",
]

REASONING_REQUIRED_PATTERNS = [
    r"\b(daily plan|daily planning|plan my day|build study plan|study plan)\b",
    r"\b(compare|evaluate)\b.{0,80}\b(options|choices|tradeoffs|pros|cons)\b",
    r"\b(debug|fix)\b.{0,80}\b(code|bug|error|issue)\b",
    r"\b(decision recommendation|recommend a decision|what should i choose)\b",
    r"\b(create|build|draft)\b.{0,80}\b(roadmap|strategy|implementation plan|action plan)\b",
]

CLOUD_REQUIRED_PATTERNS = [
    r"\b(long report|full report|comprehensive report|large document|large file)\b",
    r"\b(generate|create|make)\b.{0,80}\b(image|picture|artwork|illustration|video)\b",
    r"\b(video analysis|analyze video|mp4|movie clip)\b",
    r"\b(enterprise connector|sharepoint sync|multi-device sync|cloud fallback|cloud model)\b",
]


def extract_request_text(request: Any) -> str:
    if request is None:
        return ""
    if isinstance(request, str):
        return request
    if isinstance(request, dict):
        return str(request.get("message") or request.get("prompt") or request.get("text") or "")
    return str(
        getattr(request, "message", None)
        or getattr(request, "prompt", None)
        or getattr(request, "text", None)
        or ""
    )


def extract_request_files(request: Any, files: list[Any] | None = None) -> list[Any]:
    if files is not None:
        return files
    if request is None:
        return []
    if isinstance(request, dict):
        return list(request.get("files") or [])
    return list(getattr(request, "files", None) or [])


def normalized_request_text(request: Any) -> str:
    return re.sub(r"\s+", " ", extract_request_text(request).strip().lower())


def matches_any(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns)


class TaskComplexityScorer:
    def classify_request(self, request: Any, files: list[Any] | None = None) -> TaskComplexity:
        text = normalized_request_text(request)
        request_files = extract_request_files(request, files)

        if self._has_cloud_only_file(request_files) or matches_any(text, CLOUD_REQUIRED_PATTERNS):
            return TaskComplexity.CLOUD_REQUIRED
        if request_files or matches_any(text, CONTEXTUAL_RAG_PATTERNS):
            return TaskComplexity.CONTEXTUAL_RAG
        if matches_any(text, FAST_COMMAND_PATTERNS):
            return TaskComplexity.FAST_COMMAND
        if matches_any(text, REASONING_REQUIRED_PATTERNS):
            return TaskComplexity.REASONING_REQUIRED
        if matches_any(text, SIMPLE_CHAT_PATTERNS):
            return TaskComplexity.SIMPLE_CHAT
        return TaskComplexity.SIMPLE_CHAT

    def score(self, request: Any, files: list[Any] | None = None) -> int:
        return int(self.classify_request(request, files))

    def label(self, request: Any, files: list[Any] | None = None) -> str:
        return self.classify_request(request, files).name.lower()

    def _has_cloud_only_file(self, files: list[Any]) -> bool:
        for file in files:
            content_type = str(getattr(file, "type", "") or getattr(file, "content_type", "") or "")
            name = str(getattr(file, "name", "") or "")
            if content_type.startswith("video/") or name.lower().endswith((".mp4", ".mov", ".avi", ".mkv")):
                return True
            content = str(getattr(file, "content", "") or "")
            if len(content) > 200_000:
                return True
        return False


task_complexity_scorer = TaskComplexityScorer()
