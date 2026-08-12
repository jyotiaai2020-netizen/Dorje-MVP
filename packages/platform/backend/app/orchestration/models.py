from enum import Enum

from pydantic import BaseModel, Field


class Intent(str, Enum):
    CHAT = "chat"
    CODE = "code"
    IMAGE = "image"
    STATISTICS = "statistics"
    SOFTWARE_TUTORIAL = "software_tutorial"
    STATISTICAL_INTERPRETATION = "statistical_interpretation"
    STATISTICAL_GUIDANCE = "statistical_guidance"
    FILE = "file"
    OCR = "ocr"
    VOICE = "voice"
    NAVIGATION = "navigation"
    EXPORT = "export"
    EMAIL = "email"
    SOCIAL = "social"
    REPORT = "report"
    PRESENTATION = "presentation"
    RAG = "rag"
    SEARCH = "search"
    ADMINISTRATION = "administration"


class AgentName(str, Enum):
    PLANNER = "deepseek_planner"
    CONTENT = "qwen_content"
    VISION = "qwen_vision"
    VOICE = "whisper_voice"
    IMAGE = "tiny_sd_image"
    DETERMINISTIC_DATA = "deterministic_data"
    DECISION_SUPPORT = "decision_support"


class WorkflowStep(BaseModel):
    order: int
    agent: AgentName
    action: str
    expected_output: str


class ExecutionPlan(BaseModel):
    intent: Intent = Intent.CHAT
    required_agents: list[AgentName] = Field(default_factory=list)
    steps: list[WorkflowStep] = Field(default_factory=list)
    optimized_prompt: str = ""
    validation_rules: list[str] = Field(default_factory=list)
    fallback_plan: str = "Return a concise, transparent response and ask for missing context."
    requires_confirmation: bool = False


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class OrchestratedResult(BaseModel):
    content: str
    plan: ExecutionPlan
    validation: ValidationResult
    attempts: int = 1
