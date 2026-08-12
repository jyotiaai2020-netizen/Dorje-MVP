import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from langchain_ollama import ChatOllama
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.runtime.migration import MigrationContext

from app.core.config import settings
from app.core.database_config import ping_database
from app.db.session import engine

router = APIRouter(tags=["Health"])
logger = logging.getLogger("lotus.ai")


def health_llm() -> ChatOllama:
    return ChatOllama(
        model=settings.OLLAMA_CHAT_MODEL,
        reasoning=False,
        base_url=settings.OLLAMA_BASE_URL,
        num_predict=5,
        temperature=0,
        keep_alive=settings.OLLAMA_KEEP_ALIVE,
    )


async def ping_ai(timeout_seconds: float = 10) -> None:
    await asyncio.wait_for(health_llm().ainvoke("Reply only with OK."), timeout_seconds)


async def warm_ai_model() -> None:
    try:
        await ping_ai(timeout_seconds=30)
        logger.info("ai_model_warm model=%s", settings.OLLAMA_CHAT_MODEL)
    except Exception as exc:
        logger.warning("ai_model_warmup_failed model=%s error=%s", settings.OLLAMA_CHAT_MODEL, exc)


@router.get("/health")
def health_check():
    return {"status": "healthy"}


def migration_status() -> dict:
    try:
        backend_dir = Path(__file__).resolve().parents[3]
        alembic_cfg = Config(str(backend_dir / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(backend_dir / "migrations"))
        script = ScriptDirectory.from_config(alembic_cfg)
        head = script.get_current_head()
        with engine.connect() as connection:
            current = MigrationContext.configure(connection).get_current_revision()
        return {"current_revision": current, "head_revision": head, "status": "current" if current == head else "behind"}
    except Exception as exc:
        return {"current_revision": None, "head_revision": None, "status": "unknown", "detail": exc.__class__.__name__}


@router.get("/health/database")
def database_health_check():
    try:
        database = ping_database(engine)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database connection is unavailable") from exc
    database["migration"] = migration_status()
    return database


@router.get("/health/ai")
async def ai_health_check():
    try:
        await ping_ai()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Ollama model {settings.OLLAMA_CHAT_MODEL} is unavailable",
        ) from exc
    return {"status": "healthy", "model": settings.OLLAMA_CHAT_MODEL}
