from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.pool import NullPool

from app.core.config import DatabaseMode, settings


@dataclass(frozen=True)
class DatabaseRuntimeConfig:
    mode: DatabaseMode
    url: str
    database_type: str
    safe_url: str
    engine_kwargs: dict[str, Any]


def redact_database_url(url: str) -> str:
    """Return a URL safe for logs, health checks, and errors."""
    try:
        parsed = make_url(url)
        return parsed.render_as_string(hide_password=True)
    except Exception:
        return "<invalid-or-redacted-database-url>"


def database_type_for_url(url: str) -> str:
    try:
        driver = make_url(url).drivername
    except Exception:
        return "unknown"
    if driver.startswith("sqlite"):
        return "sqlite"
    if driver.startswith("postgresql"):
        return "postgresql"
    return driver.split("+")[0]


def build_database_runtime_config() -> DatabaseRuntimeConfig:
    url = settings.runtime_database_url
    db_type = database_type_for_url(url)
    kwargs: dict[str, Any] = {}

    if db_type == "sqlite":
        kwargs["connect_args"] = {"check_same_thread": False}
    elif db_type == "postgresql":
        kwargs.update(
            pool_pre_ping=True,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT_SECONDS,
            pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
            connect_args={"connect_timeout": settings.DB_CONNECT_TIMEOUT_SECONDS},
        )
        if settings.DATABASE_REQUIRE_SSL and "sslmode=" not in url:
            kwargs["connect_args"]["sslmode"] = settings.DATABASE_SSL_MODE
        if ":6543/" in url:
            # Supavisor transaction pooler/serverless mode: avoid multiplying pools.
            kwargs["poolclass"] = NullPool
            for key in ("pool_size", "max_overflow", "pool_timeout", "pool_recycle"):
                kwargs.pop(key, None)

    return DatabaseRuntimeConfig(
        mode=settings.DATABASE_MODE,
        url=url,
        database_type=db_type,
        safe_url=redact_database_url(url),
        engine_kwargs=kwargs,
    )


def configure_sqlite_foreign_keys(engine: Engine) -> None:
    if database_type_for_url(str(engine.url)) != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_application_engine() -> Engine:
    runtime = build_database_runtime_config()
    engine = create_engine(runtime.url, **runtime.engine_kwargs)
    configure_sqlite_foreign_keys(engine)
    return engine


def ping_database(engine: Engine) -> dict[str, Any]:
    started = time.perf_counter()
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    return {
        "mode": settings.DATABASE_MODE.value,
        "database_type": database_type_for_url(str(engine.url)),
        "status": "connected",
        "latency_ms": latency_ms,
        "pool": safe_pool_status(engine),
    }


def safe_pool_status(engine: Engine) -> str | None:
    try:
        status = engine.pool.status()
    except Exception:
        return None
    # Pool status has no credentials, but keep it concise for health checks.
    return status[:240]
