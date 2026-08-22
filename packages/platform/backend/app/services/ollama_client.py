from typing import Any

from app.core.config import settings


def ollama_client_options() -> dict[str, Any]:
    """Return shared Ollama connection options without exposing credentials."""
    options: dict[str, Any] = {"base_url": settings.OLLAMA_BASE_URL}
    if settings.OLLAMA_API_KEY:
        options["client_kwargs"] = {
            "headers": {"Authorization": f"Bearer {settings.OLLAMA_API_KEY}"}
        }
    return options
