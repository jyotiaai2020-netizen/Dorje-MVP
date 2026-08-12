import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine, inspect

from app.core.config import settings
from app.main import initialize_runtime_database
import app.main as main_module


class RuntimeDatabaseBootstrapTests(unittest.TestCase):
    def test_fresh_sqlite_runtime_database_creates_auth_tables(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / 'student-runtime.db'
            database_url = f'sqlite:///{db_path}'
            engine = create_engine(database_url, connect_args={'check_same_thread': False})
            with patch.object(main_module, 'engine', engine), patch.object(settings, 'DATABASE_URL', database_url):
                initialize_runtime_database()
            tables = set(inspect(engine).get_table_names())
            self.assertIn('users', tables)
            self.assertIn('organizations', tables)
            self.assertIn('refresh_tokens', tables)
            self.assertIn('user_settings', tables)
            self.assertIn('user_connectors', tables)


if __name__ == '__main__':
    unittest.main()
