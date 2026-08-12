from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services.ceda_service import CEDAService
from app.services.context_os_service import ContextOSService


class ContextOSTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.ceda = CEDAService(Path(self.temporary.name) / "workspace")
        self.context_os = ContextOSService(self.ceda)

    def tearDown(self):
        self.temporary.cleanup()

    def approve(self, text, event_id, user=1):
        event = self.ceda.observe_event(user, "UserMessageObserved", {"text": text}, "test", event_id=event_id)
        return self.ceda.decide(user, event["candidate"]["id"], True)["context_object_id"]

    def test_registry_exposes_five_layer_security_and_quality_metadata(self):
        context_id = self.approve("Remember Statistics Assignment 2 is due July 20", "registry")
        item = self.context_os.registry(1)[0]
        self.assertEqual(item["context_id"], context_id)
        self.assertEqual(item["layer"], "active")
        self.assertEqual(item["workspace"], "Academic")
        self.assertTrue(item["short_summary"] and item["detailed_summary"])
        self.assertEqual(item["permissions"], ["owner"])
        self.assertEqual(item["allowed_models"], ["local"])
        self.assertTrue(item["offline_available"])
        self.assertFalse(item["cloud_available"])
        self.assertGreater(item["quality_score"], 0)

    def test_search_ranks_meaning_not_filename(self):
        assignment = self.approve("Remember Statistics Assignment 2 is due July 20", "search-1")
        self.approve("Remember Career interview is due July 25", "search-2")
        results = self.context_os.search(1, "statistics assignment")
        self.assertEqual(results[0]["context_id"], assignment)
        self.assertGreater(results[0]["relevance_score"], 0)

    def test_workspace_catalog_and_health(self):
        self.approve("Remember Statistics Assignment 2 is due July 20", "workspace-1")
        self.approve("Remember my I-20 program ends on May 15, 2027", "workspace-2")
        workspaces = self.context_os.workspaces(1)
        self.assertEqual({item["workspace"] for item in workspaces}, {"Academic", "Immigration"})
        health = self.context_os.health(1)
        self.assertEqual(health["total_objects"], 2)
        self.assertEqual(health["duplicate_objects"], 0)
        self.assertGreater(health["score"], 0)
        self.assertTrue(health["suggestions"])

    def test_relationship_retrieval_is_owner_scoped(self):
        course = self.approve("Remember Statistics course exam is due July 20", "related-1")
        assignment = self.approve("Remember Statistics Assignment is due July 25", "related-2")
        self.ceda.link_context(1, course, assignment, "related_to")
        result = self.context_os.related(1, course)
        self.assertEqual(result["related"][0]["context_id"], assignment)
        with self.assertRaises(ValueError):
            self.context_os.related(2, course)

    def test_exact_duplicate_merges_without_duplicate_reminder(self):
        first = self.approve("Remember Statistics Assignment 2 is due July 20", "duplicate-1")
        second = self.approve("Remember Statistics Assignment 2 is due July 20", "duplicate-2")
        self.assertEqual(first, second)
        self.assertEqual(len(self.context_os.registry(1)), 1)
        self.assertEqual(len(self.ceda.reminders(1)), 1)

    def test_orchestrator_retrieval_uses_context_os_policy_boundary(self):
        context_id = self.approve("Always remind me early about statistics assignments", "retrieval")
        result = self.context_os.retrieve_for_request(1, "Plan my statistics coursework", "kamal")
        self.assertIn(context_id, result)
        self.assertIn("policies=", result)


if __name__ == "__main__":
    unittest.main()
