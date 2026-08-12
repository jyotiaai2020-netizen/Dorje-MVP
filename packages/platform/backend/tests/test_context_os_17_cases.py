from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import uuid

from app.services.ceda_service import CEDAService
from app.services.context_os_service import ContextOSService


class ContextOSSeventeenCases(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.ceda = CEDAService(Path(self.tmp.name) / "workspace")
        self.os = ContextOSService(self.ceda)

    def tearDown(self):
        self.tmp.cleanup()

    def observe(self, text, event, user=1, source="dorje_ai_chat"):
        return self.ceda.observe_event(user, "UserMessageObserved", {"text": text}, source, event_id=event)

    def approve(self, text, event, user=1, source="dorje_ai_chat"):
        candidate = self.observe(text, event, user, source)["candidate"]
        return self.ceda.decide(user, candidate["id"], True)["context_object_id"]

    def test_01_working_context_remains_temporary(self):
        self.assertIsNone(self.observe("Explain linear regression.", "working")["candidate"])
        self.assertEqual(self.os.registry(1), [])

    def test_02_active_academic_context(self):
        context_id = self.approve("Remember Statistics Assignment 2 is due July 20.", "academic")
        item = self.os.registry(1)[0]
        self.assertEqual((item["layer"], item["workspace"]), ("active", "Academic"))
        self.assertTrue(context_id.startswith("CTX-ACA-"))
        self.assertEqual(len(self.ceda.reminders(1)), 1)
        self.assertEqual(self.os.search(1, "statistics assignment")[0]["context_id"], context_id)

    def test_03_persistent_preference_shared_by_both_interfaces(self):
        context_id = self.approve("Always remind me 14 days before assignments.", "preference")
        item = self.ceda.get_context_object(1, context_id)
        self.assertEqual((item["domain"], item["layer"]), ("preferences", "persistent"))
        self.assertIn(context_id, self.os.retrieve_for_request(1, "Plan assignments", "kamal"))
        self.assertIn(context_id, self.os.retrieve_for_request(1, "Plan assignments", "dorje_ai"))

    def test_04_same_deadline_different_meaning_stays_separate(self):
        statistics = self.approve("Remember Statistics Assignment is due July 20.", "meaning-1")
        economics = self.approve("Remember Economics Assignment is due July 20.", "meaning-2")
        self.assertNotEqual(statistics, economics)
        self.assertEqual(len(self.os.registry(1)), 2)

    def test_05_exact_duplicate_merges(self):
        first = self.approve("Remember Statistics Assignment 2 is due July 20.", "dedupe-1")
        second = self.approve("Remember Statistics Assignment 2 is due July 20.", "dedupe-2")
        self.assertEqual(first, second)
        self.assertEqual(len(self.os.registry(1)), 1)
        self.assertEqual(len(self.ceda.reminders(1)), 1)

    def test_06_semantic_search_ranking(self):
        expected = self.approve("Remember Statistics coursework assignment is due July 20.", "search-1")
        self.approve("Remember Career recruiter interview is due July 25.", "search-2")
        results = self.os.search(1, "statistics coursework")
        self.assertEqual([item["context_id"] for item in results], [expected])
        self.assertGreater(results[0]["relevance_score"], results[0]["confidence"])

    def test_07_three_workspace_catalog(self):
        self.approve("Remember Statistics assignment is due July 20.", "ws-1")
        self.approve("Remember my I-20 program ends on May 15, 2027.", "ws-2")
        self.approve("Remember career interview is due July 25.", "ws-3")
        catalog = self.os.workspaces(1)
        self.assertEqual({row["workspace"] for row in catalog}, {"Academic", "Immigration", "Career"})
        self.assertTrue(all(row["objects"] == 1 and row["domains"] and row["average_quality"] > 0 and row["offline_available"] for row in catalog))

    def test_08_context_graph_chain_and_idempotency(self):
        course = self.approve("Remember Statistics course exam is due July 20.", "graph-1")
        assignment = self.approve("Remember Statistics assignment is due July 25.", "graph-2")
        paper = self.approve("Remember Research Paper is due July 30.", "graph-3")
        self.ceda.link_context(1, course, assignment, "related_to")
        self.ceda.link_context(1, assignment, paper, "requires")
        replay = self.ceda.link_context(1, assignment, paper, "requires")
        self.assertTrue(replay["idempotent_replay"])
        self.assertEqual({item["context_id"] for item in self.os.related(1, assignment)["related"]}, {course, paper})

    def test_09_degraded_context_health_and_suggestions(self):
        context_id = self.approve("Remember Statistics assignment is due July 20.", "health")
        old = (datetime.now(timezone.utc) - timedelta(days=200)).isoformat()
        with self.ceda._connect() as db:
            db.execute("UPDATE context_objects SET short_summary=NULL,updated_at=? WHERE id=?", (old, context_id))
            db.execute("INSERT INTO context_edges(id,user_id,source_id,target_id,relation,metadata,created_at) VALUES(?,?,?,?,?,?,?)", (str(uuid.uuid4()), 1, context_id, "CTX-ACA-MISSING", "related_to", self.ceda._encrypt({}), old))
        health = self.os.health(1)
        self.assertLess(health["score"], 100)
        self.assertEqual((health["missing_metadata"], health["stale_objects"], health["broken_relationships"]), (1, 1, 1))
        self.assertGreaterEqual(len(health["suggestions"]), 3)

    def test_10_immigration_security_metadata(self):
        context_id = self.approve("Remember my I-20 program ends on May 15, 2027.", "security")
        item = self.ceda.get_context_object(1, context_id)
        self.assertEqual(item["sensitivity"], "sensitive")
        self.assertEqual(item["permissions"], ["owner"])
        self.assertEqual(item["allowed_models"], ["local"])
        self.assertTrue(item["offline_available"])
        self.assertFalse(item["cloud_available"])

    def test_11_policy_enforcement(self):
        self.ceda.update_policy(1, "academic", {"save": "never"})
        result = self.observe("Remember Assignment 3 is due October 12.", "policy")
        self.assertEqual(result["candidate"]["status"], "rejected")
        self.assertEqual((self.ceda.pending(1), self.os.registry(1), self.ceda.reminders(1)), ([], [], []))

    def test_12_bidirectional_cross_interface_retrieval(self):
        from_kamal = self.approve("Remember research presentation is due September 5.", "cross-1", source="kamal_chat")
        from_dorje = self.approve("Always remind me early about presentations.", "cross-2", source="dorje_ai_chat")
        dorje_result = self.os.retrieve_for_request(1, "Plan my research presentation", "dorje_ai")
        kamal_result = self.os.retrieve_for_request(1, "Plan my presentation", "kamal")
        self.assertIn(from_kamal, dorje_result)
        self.assertIn(from_dorje, kamal_result)
        self.assertEqual(len(self.os.registry(1)), 2)

    def test_13_archive_removes_search_and_retrieval(self):
        context_id = self.approve("Remember Statistics assignment is due July 20.", "archive")
        archived = self.ceda.transition_context_object(1, context_id, "archived", "test")
        self.assertEqual(archived["version"], 2)
        self.assertEqual(self.os.registry(1), [])
        self.assertEqual(self.os.search(1, "statistics"), [])
        self.assertNotIn(context_id, self.os.retrieve_for_request(1, "Plan statistics", "kamal"))

    def test_14_secure_deletion_erases_graph_and_snapshots(self):
        first = self.approve("Remember Statistics assignment is due July 20.", "delete-1")
        second = self.approve("Remember Research paper is due July 25.", "delete-2")
        self.ceda.link_context(1, first, second, "requires")
        deleted = self.ceda.transition_context_object(1, first, "deleted", "test")
        self.assertEqual((deleted["payload"], deleted["source"], deleted["relationships"]), ({}, {}, []))
        self.assertEqual(len(deleted["versions"]), 1)

    def test_15_automatic_expiration(self):
        context_id = self.approve("Remember Statistics assignment is due July 20.", "expiry")
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        self.ceda.update_context_object(1, context_id, {"expires_at": past}, "test")
        self.assertEqual(self.ceda.dashboard(1)["expired_archived"], 1)
        self.assertEqual(self.ceda.get_context_object(1, context_id)["status"], "archived")
        self.assertEqual(self.os.search(1, "statistics"), [])

    def test_16_complete_user_isolation(self):
        first = self.approve("Remember Statistics assignment is due July 20.", "isolation-1", user=1)
        second = self.approve("Remember Research paper is due July 25.", "isolation-2", user=1)
        self.assertEqual(self.os.registry(2), [])
        self.assertEqual(self.os.search(2, "statistics"), [])
        self.assertNotIn(first, self.os.retrieve_for_request(2, "Plan statistics", "kamal"))
        for action in (
            lambda: self.ceda.get_context_object(2, first),
            lambda: self.ceda.update_context_object(2, first, {"confidence": 0.5}, "unauthorized"),
            lambda: self.ceda.link_context(2, first, second, "related_to"),
        ):
            with self.assertRaises(ValueError):
                action()

    def test_17_api_key_is_absent_from_all_context_boundaries(self):
        secret = "abc123"
        result = self.observe(f"Remember my API key is {secret}.", "secret")
        self.assertEqual(result["candidate"]["status"], "rejected")
        self.assertEqual(self.os.registry(1), [])
        self.assertEqual(self.os.search(1, secret), [])
        self.assertNotIn(secret, self.os.retrieve_for_request(1, "What is my API key?", "dorje_ai"))
        with self.ceda._connect() as db:
            event_payload = self.ceda._decrypt(db.execute("SELECT payload FROM ceda_events WHERE event_id='secret'").fetchone()[0])
        self.assertNotIn(secret, event_payload)


if __name__ == "__main__":
    unittest.main()
