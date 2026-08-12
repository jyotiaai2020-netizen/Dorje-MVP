from types import SimpleNamespace
import unittest

from app.api.v1.dorje_ai_connectors import connector_is_authorized
from app.services.gmail_connector_service import GOOGLE_CONNECTOR_SCOPES


class GoogleWorkspaceConnectorTests(unittest.TestCase):
    def test_docs_and_sheets_scopes_include_expected_authoring_and_browsing_scopes(self):
        self.assertIn("https://www.googleapis.com/auth/gmail.readonly", GOOGLE_CONNECTOR_SCOPES["gmail"])
        self.assertIn("https://www.googleapis.com/auth/gmail.send", GOOGLE_CONNECTOR_SCOPES["gmail"])
        self.assertIn("https://www.googleapis.com/auth/documents", GOOGLE_CONNECTOR_SCOPES["google-docs"])
        self.assertIn("https://www.googleapis.com/auth/drive.readonly", GOOGLE_CONNECTOR_SCOPES["google-docs"])
        self.assertIn("https://www.googleapis.com/auth/drive.readonly", GOOGLE_CONNECTOR_SCOPES["google-sheets"])

    def test_docs_connected_allows_docs_scope_for_creation(self):
        docs_only = SimpleNamespace(scope="openid https://www.googleapis.com/auth/documents")
        docs_with_drive = SimpleNamespace(scope="openid https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.readonly")

        self.assertTrue(connector_is_authorized("google-docs", docs_only))
        self.assertTrue(connector_is_authorized("google-docs", docs_with_drive))

    def test_sheets_connected_requires_sheets_and_drive_scope(self):
        sheets_only = SimpleNamespace(scope="openid https://www.googleapis.com/auth/spreadsheets")
        sheets_with_drive = SimpleNamespace(scope="openid https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly")

        self.assertFalse(connector_is_authorized("google-sheets", sheets_only))
        self.assertTrue(connector_is_authorized("google-sheets", sheets_with_drive))


if __name__ == "__main__":
    unittest.main()
