from enum import Enum
from pathlib import Path
from pydantic import computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class DatabaseMode(str, Enum):
    LOCAL = "local"
    CLOUD = "cloud"
    TEST = "test"


class Settings(BaseSettings):
    APP_NAME: str = "Student-LAD API"
    EDITION_ID: str = "student"
    WORKSPACE_NAME: str = "Student-LAD by Dorje AI"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    DATABASE_MODE: DatabaseMode = DatabaseMode.LOCAL
    DATABASE_URL: str = "sqlite:///./lotus.db"
    DATABASE_MIGRATION_URL: str = ""
    DATABASE_SSL_MODE: str = "require"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT_SECONDS: int = 30
    DB_POOL_RECYCLE_SECONDS: int = 1800
    DB_CONNECT_TIMEOUT_SECONDS: int = 10
    SUPABASE_PROJECT_REF: str = ""
    SUPABASE_DB_HOST: str = ""
    SUPABASE_DB_PORT: int = 5432
    SUPABASE_DB_NAME: str = "postgres"
    SUPABASE_DB_USER: str = ""
    SUPABASE_DB_PASSWORD: str = ""
    DATABASE_REQUIRE_SSL: bool = True
    DATABASE_REQUIRE_MIGRATIONS: bool = True
    DATABASE_ALLOW_CREATE_ALL: bool = False
    RUNTIME_ROOT: str = str(BACKEND_DIR / "runtime")
    UPLOADS_DIR: str = ""
    GENERATED_DIR: str = ""
    EXPORTS_DIR: str = ""
    LOGS_DIR: str = ""
    CACHE_DIR: str = ""
    VECTORSTORE_DIR: str = ""
    SECRET_KEY: str = "local-development-only-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    FRONTEND_URL: str = "http://127.0.0.1:3100"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3:8b"
    OLLAMA_CHAT_MODEL: str = "qwen3:8b"
    OLLAMA_FAST_MODEL: str = "qwen3:8b"
    OLLAMA_DEEP_MODEL: str = "qwen3:8b"
    OLLAMA_VISION_MODEL: str = "qwen3.5:0.8b"
    OLLAMA_REASONING_MODEL: str = "deepseek-r1:1.5b"
    OLLAMA_REPORT_MODEL: str = "qwen3:8b"
    ALLOW_UPGRADE_MODEL_TEST_BYPASS: bool = True
    OLLAMA_KEEP_ALIVE: str = "15m"
    # Workspace AI / Dorje chat should not impose an application-level output cap.
    # Ollama treats -1 as unlimited generation; context budgets still protect input size.
    OLLAMA_CHAT_NUM_PREDICT: int = 512
    OLLAMA_FAST_NUM_CTX: int = 4096
    OLLAMA_FAST_NUM_PREDICT: int = 512
    OLLAMA_FAST_THINKING: bool = False
    OLLAMA_DEEP_NUM_CTX: int = 8192
    OLLAMA_DEEP_NUM_PREDICT: int = 3072
    OLLAMA_DEEP_THINKING: bool = True
    OLLAMA_REASONING_NUM_PREDICT: int = 1200
    OLLAMA_VISION_NUM_PREDICT: int = 700
    OLLAMA_REPORT_NUM_PREDICT: int = 1600
    ORCHESTRATOR_ENABLED: bool = True
    ORCHESTRATOR_MAX_VALIDATION_RETRIES: int = 1
    DEFAULT_USER_TIER: str = "free"
    MODEL_IDLE_TIMEOUT_SECONDS: int = 300
    IMAGE_MODEL_ID: str = "segmind/SSD-1B"
    IMAGE_TEST_MODEL_ID: str = "segmind/tiny-sd"
    IMAGE_SIZE: int = 512
    IMAGE_INFERENCE_STEPS: int = 8
    WHISPER_MODEL: str = "tiny"
    MAX_AUDIO_UPLOAD_MB: int = 25
    MAX_UPLOAD_MB: int = 10
    MAX_VIDEO_UPLOAD_MB: int = 100
    REDIS_URL: str = "redis://localhost:6379/0"
    APP_URL: str = "http://127.0.0.1:3100"
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://127.0.0.1:3100/api/oauth/google/callback"
    TOKEN_ENCRYPTION_KEY: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def runtime_database_url(self) -> str:
        """Return a runtime database URL without logging or exposing credentials."""
        should_build_supabase_url = (
            self.DATABASE_MODE == DatabaseMode.CLOUD
            and self.SUPABASE_DB_HOST
            and (not self.DATABASE_URL or self.DATABASE_URL.startswith("sqlite"))
        )
        if should_build_supabase_url:
            from sqlalchemy import URL

            url = URL.create(
                "postgresql+psycopg",
                username=self.SUPABASE_DB_USER or None,
                password=self.SUPABASE_DB_PASSWORD or None,
                host=self.SUPABASE_DB_HOST or None,
                port=self.SUPABASE_DB_PORT,
                database=self.SUPABASE_DB_NAME or "postgres",
                query={"sslmode": self.DATABASE_SSL_MODE} if self.DATABASE_REQUIRE_SSL else {},
            )
            return url.render_as_string(hide_password=False)
        return self.DATABASE_URL

    @property
    def migration_database_url(self) -> str:
        return self.DATABASE_MIGRATION_URL or self.runtime_database_url

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in {"production", "prod"}

    @model_validator(mode="after")
    def validate_database_and_secret_settings(self):
        if self.DATABASE_MODE == DatabaseMode.CLOUD:
            has_url = bool(self.DATABASE_URL and not self.DATABASE_URL.startswith("sqlite"))
            has_parts = bool(self.SUPABASE_DB_HOST and self.SUPABASE_DB_USER and self.SUPABASE_DB_PASSWORD)
            if not has_url and not has_parts:
                raise ValueError("DATABASE_MODE=cloud requires DATABASE_URL or Supabase PostgreSQL connection fields.")
            if self.DATABASE_REQUIRE_SSL and "sslmode=" not in self.runtime_database_url:
                raise ValueError("DATABASE_MODE=cloud requires an SSL-enabled PostgreSQL URL, for example sslmode=require.")
        if self.is_production:
            insecure = {"", "change-before-deployment", "local-development-only-change-me"}
            if self.SECRET_KEY in insecure:
                raise ValueError("Production startup requires SECRET_KEY to be set to a secure non-default value.")
            if not self.TOKEN_ENCRYPTION_KEY:
                raise ValueError("Production startup requires TOKEN_ENCRYPTION_KEY for connector and vault secrets.")
        return self

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR / ".env.oauth"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
