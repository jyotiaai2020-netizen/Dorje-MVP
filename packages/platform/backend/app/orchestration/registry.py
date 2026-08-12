from dataclasses import dataclass

from app.orchestration.models import AgentName


@dataclass(frozen=True)
class AgentDefinition:
    name: AgentName
    capability: str
    always_resident: bool
    lazy: bool


class AgentRegistry:
    """Discoverable specialist registry for current and future agents."""

    def __init__(self) -> None:
        self._agents = {
            AgentName.PLANNER: AgentDefinition(AgentName.PLANNER, "intent, planning, prompt optimization", True, False),
            AgentName.CONTENT: AgentDefinition(AgentName.CONTENT, "language, code, RAG, reports, explanations", False, False),
            AgentName.VISION: AgentDefinition(AgentName.VISION, "OCR, images, diagrams, charts, video frames", False, True),
            AgentName.VOICE: AgentDefinition(AgentName.VOICE, "speech transcription and command segmentation", True, False),
            AgentName.IMAGE: AgentDefinition(AgentName.IMAGE, "diffusion image generation", False, True),
            AgentName.DETERMINISTIC_DATA: AgentDefinition(AgentName.DETERMINISTIC_DATA, "validated data, statistics, charts, exports", False, False),
            AgentName.DECISION_SUPPORT: AgentDefinition(AgentName.DECISION_SUPPORT, "what-if analysis, simulation, optimization, ranked recommendations", False, False),
        }

    def get(self, name: AgentName) -> AgentDefinition:
        return self._agents[name]

    def available(self) -> list[AgentDefinition]:
        return list(self._agents.values())

    def register(self, definition: AgentDefinition) -> None:
        self._agents[definition.name] = definition
