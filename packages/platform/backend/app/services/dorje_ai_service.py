"""Compatibility exports for code that previously imported the independent AI service.

DorjeAI execution now belongs to :class:`DorjeOrchestrator`. New code should import it
from ``app.orchestration`` directly.
"""

from app.orchestration import DorjeOrchestrator
from app.orchestration.utils import chunk_text


class DorjeAIService(DorjeOrchestrator):
    """Deprecated compatibility name backed by the hierarchical orchestrator."""


__all__ = ["DorjeAIService", "chunk_text"]
