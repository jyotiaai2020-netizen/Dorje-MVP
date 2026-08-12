from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

from app.services.ceda_service import CEDAService
from app.services.plugins.student_wkim_plugin import StudentWKIMPlugin
from app.services.workspace_knowledge_service import WKIMError, WorkspaceKnowledgeService


class WorkspaceKnowledgeInfrastructureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.ceda = CEDAService(self.root / "runtime")
        self.wkim = WorkspaceKnowledgeService(self.ceda)
        self.folder = self.root / "Academic"
        self.folder.mkdir()
        self.workspace = self.wkim.register_workspace(
            1, "Academic", str(self.folder), category="academic", watcher_enabled=True
        )

    def tearDown(self):
        self.tmp.cleanup()

    def make_file(self, name="Statistics Assignment 2.txt", content="Due July 20"):
        path = self.folder / name
        path.write_text(content, encoding="utf-8")
        return path

    def test_wkim_001_manages_reference_without_modifying_original(self):
        path = self.make_file()
        before = path.read_bytes()
        item = self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(path))
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(item["physical_location"], str(path.resolve()))
        self.assertEqual(item["source_kind"], "external_reference")

    def test_wkim_002_original_remains_user_owned_and_location_is_encrypted(self):
        path = self.make_file()
        item = self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(path))
        with self.ceda._connect() as db:
            raw = db.execute("SELECT physical_location FROM wkim_documents WHERE id=?", (item["document_id"],)).fetchone()[0]
        self.assertNotIn(str(path), str(raw))
        self.assertTrue(path.exists())

    def test_wkim_003_metadata_reference_and_deduplication(self):
        path = self.make_file()
        first = self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(path), metadata={"course": "Statistics"})
        second = self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(path), metadata={"course": "Statistics"})
        self.assertEqual(first["document_id"], second["document_id"])
        self.assertTrue(second["idempotent_replay"])
        self.assertEqual(len(self.wkim.catalog(1)), 1)

    def test_wkim_004_operations_emit_ceda_and_audit_events(self):
        path = self.make_file()
        self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(path))
        with self.ceda._connect() as db:
            event_count = db.execute("SELECT COUNT(*) FROM ceda_events WHERE user_id=1 AND source_module='wkim'").fetchone()[0]
            audit_count = db.execute("SELECT COUNT(*) FROM audit_log WHERE user_id=1 AND action LIKE 'wkim.%'").fetchone()[0]
        self.assertGreaterEqual(event_count, 2)
        self.assertGreaterEqual(audit_count, 2)

    def test_wkim_005_watchers_require_an_approved_enabled_workspace(self):
        result = self.wkim.watcher_event(1, self.workspace["workspace_id"], "updated", str(self.make_file()))
        self.assertTrue(result["reindex_required"])
        other = self.root / "Other"; other.mkdir()
        disabled = self.wkim.register_workspace(1, "Other", str(other), watcher_enabled=False)
        with self.assertRaises(WKIMError):
            self.wkim.watcher_event(1, disabled["workspace_id"], "created", str(other / "x.txt"))

    def test_wkim_006_search_is_contextual_policy_aware_and_user_isolated(self):
        assignment = self.make_file()
        resume = self.make_file("Resume.txt", "Python analyst")
        self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(assignment), summary="Statistics coursework")
        self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(resume), summary="Career portfolio")
        result = self.wkim.search(1, "statistics coursework")
        self.assertEqual(len(result), 1)
        self.assertIn("Statistics", result[0]["title"])
        self.assertEqual(self.wkim.search(2, "statistics"), [])

    def test_wkim_007_cloud_connectors_inherit_pie_governance(self):
        result = self.wkim.register_workspace(1, "Drive", "google-drive://root", storage_type="google_drive", sync_mode="hybrid")
        self.assertEqual(result["status"], "pending_consent")
        self.assertTrue(result["policy_decision"]["requires_consent"])

    def test_wkim_008_student_extension_is_a_plugin(self):
        plugin = StudentWKIMPlugin()
        academic = plugin.classify("Statistics Assignment 2.pdf")
        immigration = plugin.classify("Updated I-20.pdf")
        self.assertEqual((academic["domain"], academic["classification"]), ("academic", "assignment"))
        self.assertEqual((immigration["domain"], immigration["classification"]), ("immigration", "i20"))

    def test_health_detects_broken_reference(self):
        path = self.make_file()
        self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(path))
        path.unlink()
        health = self.wkim.health(1)
        self.assertEqual(health["broken_references"], 1)
        self.assertLess(health["score"], 100)

    def test_application_managed_upload_hides_internal_server_path(self):
        upload_root = self.root / "application-attachments"
        upload_root.mkdir()
        uploaded = upload_root / "Statistics Assignment.txt"
        uploaded.write_text("Due: July 20", encoding="utf-8")
        workspace = self.wkim.ensure_managed_workspace(1, str(upload_root))
        item = self.wkim.catalog_reference(
            1,
            workspace["workspace_id"],
            str(uploaded),
            source_kind="explicit_upload",
        )
        visible_workspace = self.wkim.get_workspace(1, workspace["workspace_id"])
        self.assertEqual(visible_workspace["location"], "Uploaded from this device")
        self.assertEqual(item["physical_location"], "Uploaded from this device")
        with self.ceda._connect() as db:
            stored = db.execute("SELECT physical_location FROM wkim_documents WHERE id=?", (item["document_id"],)).fetchone()[0]
        self.assertNotIn(str(uploaded), str(stored))

    def test_clear_catalog_and_disconnect_never_delete_original_files(self):
        path = self.make_file()
        item = self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(path))
        removed = self.wkim.remove_document_reference(1, item["document_id"])
        self.assertFalse(removed["original_file_deleted"])
        self.assertTrue(path.exists())
        self.wkim.catalog_reference(1, self.workspace["workspace_id"], str(path))
        disconnected = self.wkim.disconnect_workspace(1, self.workspace["workspace_id"], clear_catalog=True)
        self.assertFalse(disconnected["original_files_deleted"])
        self.assertTrue(path.exists())
        self.assertEqual(self.wkim.catalog(1), [])
        self.assertEqual(self.wkim.list_workspaces(1), [])

    def test_storage_locations_include_system_and_only_connected_storage_providers(self):
        connectors = [
            SimpleNamespace(status="connected", provider="gmail", provider_account_email="student@example.com", scope="https://www.googleapis.com/auth/drive.file"),
            SimpleNamespace(status="connected", provider="sharepoint", provider_account_email="student@example.com", scope="files.read"),
            SimpleNamespace(status="connected", provider="postgresql", provider_account_email="student-db", scope="read_only"),
            SimpleNamespace(status="expired", provider="dropbox", provider_account_email="student@example.com", scope="files.read"),
        ]
        locations = self.wkim.storage_locations(1, connectors)
        names = {item["name"] for item in locations}
        self.assertIn("System / Local Device", names)
        self.assertIn("Academic", names)
        self.assertIn("Google Drive", names)
        self.assertIn("Microsoft SharePoint", names)
        self.assertIn("PostgreSQL Database", names)
        self.assertNotIn("Dropbox", names)
        system = next(item for item in locations if item["location_id"] == "system-local")
        self.assertFalse(system["disconnectable"])
        self.assertEqual(system["permission_level"], "user_approved_paths_only")


if __name__ == "__main__":
    unittest.main()
