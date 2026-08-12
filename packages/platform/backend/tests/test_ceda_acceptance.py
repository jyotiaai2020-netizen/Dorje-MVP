from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services.ceda_service import CEDAService, IMMIGRATION_DISCLAIMER


class CEDAAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.ceda = CEDAService(Path(self.temporary.name) / "workspace")

    def tearDown(self):
        self.temporary.cleanup()

    def observe(self, user, text, event_id, source="dorje_ai_chat"):
        return self.ceda.observe_event(user, "UserMessageObserved", {"text": text}, source, event_id=event_id)

    def approve(self, user, text, event_id, source="dorje_ai_chat"):
        event = self.observe(user, text, event_id, source)
        self.assertIsNotNone(event["candidate"])
        return self.ceda.decide(user, event["candidate"]["id"], True)

    def test_01_temporary_conversation(self):
        event = self.observe(1, "Explain probability distributions.", "temporary")
        self.assertIsNone(event["candidate"])
        self.assertEqual(self.ceda.pending(1), [])
        self.assertEqual(self.ceda.context_objects(1), [])

    def test_02_academic_extraction(self):
        event = self.observe(2, "Remember that Statistics Assignment 2 is due July 20.", "academic")
        candidate = event["candidate"]
        self.assertEqual((candidate["status"], candidate["category"], candidate["kind"]), ("pending", "academic", "deadline"))
        self.assertGreater(candidate["confidence"], 0)
        with self.ceda._connect() as db:
            payload = db.execute("SELECT payload FROM ceda_events WHERE event_id='academic'").fetchone()[0]
        self.assertEqual(self.ceda._decrypt(payload), "{}")

    def test_03_approval(self):
        decision = self.approve(3, "Remember that Statistics Assignment 2 is due July 20.", "approve")
        item = self.ceda.get_context_object(3, decision["context_object_id"])
        self.assertTrue(item["context_id"].startswith("CTX-ACA-"))
        self.assertEqual((item["status"], item["version"]), ("active", 1))
        self.assertTrue(item["source"] and item["retention_reason"] and item["policy_ids"] and item["expires_at"])
        self.assertEqual(len(self.ceda.reminders(3)), 1)

    def test_04_discard(self):
        event = self.observe(4, "Remember that my Economics exam is due August 10.", "discard")
        self.assertEqual(self.ceda.decide(4, event["candidate"]["id"], False)["status"], "discarded")
        self.assertEqual((self.ceda.pending(4), self.ceda.context_objects(4), self.ceda.reminders(4)), ([], [], []))

    def test_05_context_reuse(self):
        approved = self.approve(5, "Always remind me early about statistics assignments.", "preference")
        discarded = self.observe(5, "Remember that Economics exam is due August 10.", "discarded")
        self.ceda.decide(5, discarded["candidate"]["id"], False)
        context = self.ceda.context_for_request(5, "Help me plan my statistics coursework.", "dorje_ai")
        self.assertEqual(self.ceda.get_context_object(5, approved["context_object_id"])["domain"], "preferences")
        self.assertIn("remind me early", context.lower())
        self.assertNotIn("August 10", context)

    def test_06_shared_kamal_dorje_context(self):
        context_id = self.approve(6, "Remember that my research presentation is due September 5.", "kamal", "kamal_chat")["context_object_id"]
        self.assertIn(context_id, self.ceda.context_for_request(6, "Plan my research presentation", "dorje_ai"))
        self.assertIn(context_id, self.ceda.context_for_request(6, "Help with my research presentation", "kamal"))
        self.assertEqual(len(self.ceda.context_objects(6)), 1)

    def test_07_secret_rejection(self):
        event = self.observe(7, "Remember my password is TestPassword123.", "secret")
        self.assertEqual(event["candidate"]["status"], "rejected")
        self.assertEqual((self.ceda.pending(7), self.ceda.context_objects(7)), ([], []))
        with self.ceda._connect() as db:
            payload = db.execute("SELECT payload FROM ceda_events WHERE event_id='secret'").fetchone()[0]
        self.assertNotIn("TestPassword123", self.ceda._decrypt(payload))

    def test_08_user_isolation(self):
        context_id = self.approve(8, "Remember assignment is due July 20.", "user-a")["context_object_id"]
        self.assertEqual((self.ceda.context_objects(9), self.ceda.reminders(9), self.ceda.pending(9)), ([], [], []))
        with self.assertRaises(ValueError):
            self.ceda.get_context_object(9, context_id)

    def test_09_archive(self):
        context_id = self.approve(10, "Always remind me early about assignments.", "archive")["context_object_id"]
        archived = self.ceda.transition_context_object(10, context_id, "archived", "user archived")
        self.assertEqual((archived["status"], archived["version"]), ("archived", 2))
        self.assertEqual(self.ceda.context_objects(10), [])
        self.assertNotIn(context_id, self.ceda.context_for_request(10, "Plan assignments", "dorje_ai"))

    def test_10_secure_delete(self):
        first = self.approve(11, "Remember assignment is due July 20.", "delete-1")["context_object_id"]
        second = self.approve(11, "Remember project is due July 25.", "delete-2")["context_object_id"]
        self.ceda.link_context(11, first, second, "depends_on")
        deleted = self.ceda.transition_context_object(11, first, "deleted", "user deletion")
        self.assertEqual((deleted["payload"], deleted["source"], deleted["relationships"]), ({}, {}, []))
        self.assertEqual(len(deleted["versions"]), 1)
        self.assertNotIn(first, self.ceda.context_for_request(11, "Plan assignments", "dorje_ai"))

    def test_11_immigration(self):
        decision = self.approve(12, "Remember that my I-20 program ends on May 15, 2027.", "immigration")
        item = self.ceda.get_context_object(12, decision["context_object_id"])
        reminder = self.ceda.reminders(12)[0]
        self.assertEqual((item["domain"], reminder["priority"]), ("immigration", "high"))
        self.assertTrue(reminder["official_verification_required"])
        self.assertEqual(reminder["disclaimer"], IMMIGRATION_DISCLAIMER)
        self.assertIn("DSO", reminder["disclaimer"])

    def test_12_policy_enforcement(self):
        self.ceda.update_policy(13, "academic", {"save": "never"})
        event = self.observe(13, "Remember that Assignment 3 is due October 12.", "policy")
        self.assertEqual(event["candidate"]["status"], "rejected")
        self.assertEqual((self.ceda.pending(13), self.ceda.context_objects(13)), ([], []))

    def test_13_duplicate_event(self):
        payload = {"text": "Remember assignment is due July 20."}
        first = self.ceda.observe_event(14, "UserMessageObserved", payload, "api", event_id="same")
        second = self.ceda.observe_event(14, "UserMessageObserved", payload, "api", event_id="same")
        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(second["idempotent_replay"])
        self.assertEqual(len(self.ceda.pending(14)), 1)

    def test_14_context_graph(self):
        assignment = self.approve(15, "Remember assignment is due July 20.", "graph-1")["context_object_id"]
        project = self.approve(15, "Remember research project is due July 25.", "graph-2")["context_object_id"]
        self.assertFalse(self.ceda.link_context(15, assignment, project, "depends_on")["idempotent_replay"])
        self.assertTrue(self.ceda.link_context(15, assignment, project, "depends_on")["idempotent_replay"])
        self.assertEqual(len(self.ceda.get_context_object(15, assignment)["relationships"]), 1)
        with self.assertRaises(ValueError):
            self.ceda.link_context(16, assignment, project, "depends_on")

    def test_15_automatic_expiration(self):
        context_id = self.approve(17, "Remember assignment is due July 20.", "expiry")["context_object_id"]
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        self.ceda.update_context_object(17, context_id, {"expires_at": past}, "test expiration")
        dashboard = self.ceda.dashboard(17)
        self.assertEqual(dashboard["expired_archived"], 1)
        self.assertEqual(self.ceda.get_context_object(17, context_id)["status"], "archived")
        self.assertEqual(self.ceda.context_objects(17), [])
        self.assertNotIn(context_id, self.ceda.context_for_request(17, "Plan assignments", "dorje_ai"))


if __name__ == "__main__":
    unittest.main()
