import unittest

from pydantic import ValidationError

from app.core.config import DatabaseMode, Settings
from app.core.database_config import redact_database_url


class DatabaseConfigTests(unittest.TestCase):
    def test_local_mode_defaults_to_sqlite(self):
        settings = Settings(_env_file=None)
        self.assertEqual(settings.DATABASE_MODE, DatabaseMode.LOCAL)
        self.assertTrue(settings.runtime_database_url.startswith("sqlite"))

    def test_cloud_mode_builds_supabase_url_with_escaped_password(self):
        settings = Settings(
            _env_file=None,
            DATABASE_MODE="cloud",
            DATABASE_URL="sqlite:///./local-default.db",
            SUPABASE_DB_HOST="db.example-ref.supabase.co",
            SUPABASE_DB_USER="postgres",
            SUPABASE_DB_PASSWORD="p@ss/word?#1",
            SECRET_KEY="production-grade-test-secret",
            TOKEN_ENCRYPTION_KEY="test-token-key",
        )
        url = settings.runtime_database_url
        self.assertIn("postgresql+psycopg://postgres:", url)
        self.assertIn("db.example-ref.supabase.co:5432/postgres", url)
        self.assertIn("sslmode=require", url)
        self.assertNotIn("p@ss/word?#1", url)

    def test_redacted_database_url_hides_password(self):
        redacted = redact_database_url("postgresql+psycopg://user:secret@example.com:5432/postgres?sslmode=require")
        self.assertIn("***", redacted)
        self.assertNotIn("secret", redacted)

    def test_production_rejects_insecure_secret_defaults(self):
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, APP_ENV="production", SECRET_KEY="change-before-deployment", TOKEN_ENCRYPTION_KEY="x")


if __name__ == "__main__":
    unittest.main()
