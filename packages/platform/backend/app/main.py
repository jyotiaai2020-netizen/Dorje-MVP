import asyncio
from contextlib import asynccontextmanager
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database_config import build_database_runtime_config
from app.db.database import Base
from app.db.session import engine

import app.models

from app.api.v1.health import router as health_router
from app.api.v1.reports import router as reports_router
from app.api.v1.auth import router as auth_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.chat import router as chat_router
from app.api.v1.dorje_ai import router as dorje_ai_router
from app.api.v1.dorje_ai_memory import router as dorje_ai_memory_router
from app.api.v1.projects import router as projects_router
from app.api.v1.dorje_ai_connectors import router as dorje_ai_connectors_router
from app.api.v1.google_oauth import router as google_oauth_router
from app.api.v1.ceda import router as ceda_router
from app.api.v1.context_os import router as context_os_router
from app.api.v1.context_graph import router as context_graph_router
from app.api.v1.policy_intelligence import router as pie_router
from app.api.v1.workspace_knowledge import router as wkim_router
from app.api.v1.user_settings import router as user_settings_router
from app.api.v1.student_lad import router as student_lad_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.reminders import router as reminders_router
from app.api.v1.capture import router as capture_router
from app.api.v1.suggestions import actions_router, router as suggestions_router
from app.api.v1.decision_support import router as decision_support_router
from app.api.v1.kamal_actions import router as kamal_actions_router
from app.api.v1.health import warm_ai_model

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("lotus.api")

allowed_origins = [settings.FRONTEND_URL]
if settings.APP_ENV == "development":
    allowed_origins.extend([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "http://localhost:3101",
        "http://127.0.0.1:3101",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ])
allowed_origins = list(dict.fromkeys(allowed_origins))


def initialize_runtime_database() -> None:
    """Create missing local/runtime tables before authenticated routes are used.

    Student-LAD runs as a local-first edition with an isolated SQLite database
    under apps/student/runtime. A fresh runtime database starts empty, so the
    API must bootstrap the schema before login, chat, CEDA, connectors, and
    settings endpoints receive traffic. This is intentionally non-destructive:
    it creates missing tables only and leaves existing data untouched.
    """
    runtime = build_database_runtime_config()
    if runtime.database_type == "sqlite" and (settings.DATABASE_MODE.value in {"local", "test"} or settings.APP_ENV == "development" or settings.DATABASE_ALLOW_CREATE_ALL):
        Base.metadata.create_all(bind=engine)
        logger.info("runtime_database_ready mode=%s database_type=%s url=%s", settings.DATABASE_MODE.value, runtime.database_type, runtime.safe_url)
    elif settings.DATABASE_REQUIRE_MIGRATIONS:
        logger.info("runtime_database_schema_managed_by_migrations mode=%s database_type=%s", settings.DATABASE_MODE.value, runtime.database_type)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_runtime_database()
    warmup_task = asyncio.create_task(warm_ai_model())
    yield
    if not warmup_task.done():
        warmup_task.cancel()

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Production SaaS backend for AI advisory, RAG, reports, and client portal.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    started_at = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started_at) * 1000
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_complete method=%s path=%s status=%s duration_ms=%.2f request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )
    return response

app.include_router(health_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(organizations_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(dorje_ai_router, prefix="/api/v1")
app.include_router(dorje_ai_memory_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")
app.include_router(dorje_ai_connectors_router, prefix="/api/v1")
app.include_router(google_oauth_router, prefix="/api/v1")
app.include_router(ceda_router, prefix="/api/v1")
app.include_router(context_os_router, prefix="/api/v1")
app.include_router(context_graph_router, prefix="/api/v1")
app.include_router(pie_router, prefix="/api/v1")
app.include_router(wkim_router, prefix="/api/v1")
app.include_router(user_settings_router, prefix="/api/v1")
app.include_router(student_lad_router, prefix="/api/v1")
app.include_router(tasks_router, prefix="/api/v1")
app.include_router(reminders_router, prefix="/api/v1")
app.include_router(capture_router, prefix="/api/v1")
app.include_router(suggestions_router, prefix="/api/v1")
app.include_router(actions_router, prefix="/api/v1")
app.include_router(decision_support_router, prefix="/api/v1")
app.include_router(kamal_actions_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"message": "Lotus & Dorje API is running"}
