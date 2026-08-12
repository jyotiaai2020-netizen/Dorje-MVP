from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services.ceda_service import CEDAService


class CEDAServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = TemporaryDirectory()
        self.service = CEDAService(Path(self.temporary.name) / "Student-LAD-Workspace")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _approve(self, user_id: int, text: str, event_id: str) -> dict:
        event = self.service.observe_event(
            user_id,
            "UserMessageObserved",
            {"text": text},
            "test_chat",
            event_id=event_id,
        )
        self.assertEqual(event["status"], "processed")
        self.assertIsNotNone(event["candidate"])
        return self.service.decide(user_id, event["candidate"]["id"], True)

    def test_event_is_idempotent_and_temporary_payload_is_discarded(self) -> None:
        payload = {"text": "Remember that Statistics Assignment 2 is due July 20"}
        first = self.service.observe_event(10, "UserMessageObserved", payload, "kamal", event_id="event-1")
        replay = self.service.observe_event(10, "UserMessageObserved", payload, "kamal", event_id="event-1")

        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(replay["idempotent_replay"])
        self.assertEqual(len(self.service.pending(10)), 1)
        with self.service._connect() as db:
            row = db.execute("SELECT payload,status FROM ceda_events WHERE event_id='event-1'").fetchone()
        self.assertEqual(row["status"], "processed")
        self.assertEqual(self.service._decrypt(row["payload"]), "{}")

    def test_approval_creates_versioned_context_object(self) -> None:
        decision = self._approve(20, "Store this: Statistics Assignment 2 is due July 20", "event-2")
        context_id = decision["context_object_id"]
        context = self.service.get_context_object(20, context_id)

        self.assertTrue(context_id.startswith("CTX-ACA-"))
        self.assertEqual(context["domain"], "academic")
        self.assertEqual(context["status"], "active")
        self.assertEqual(context["version"], 1)
        self.assertEqual(len(context["versions"]), 1)
        self.assertNotIn("Statistics Assignment 2 is due July 20", str(context["source"]))

        updated = self.service.update_context_object(
            20,
            context_id,
            {"confidence": 0.99, "title": "Statistics Assignment 2 deadline"},
            "user corrected the title",
        )
        self.assertEqual(updated["version"], 2)
        self.assertEqual(updated["confidence"], 0.99)
        self.assertEqual(len(updated["versions"]), 2)

    def test_context_graph_is_idempotent_and_user_isolated(self) -> None:
        assignment = self._approve(30, "Remember assignment is due July 20", "event-3")["context_object_id"]
        exam = self._approve(30, "Remember exam is due July 30", "event-4")["context_object_id"]

        first = self.service.link_context(30, assignment, exam, "depends_on", {"reason": "study sequence"})
        replay = self.service.link_context(30, assignment, exam, "depends_on", {"reason": "study sequence"})
        self.assertFalse(first["idempotent_replay"])
        self.assertTrue(replay["idempotent_replay"])
        self.assertEqual(len(self.service.get_context_object(30, assignment)["relationships"]), 1)

        with self.assertRaises(ValueError):
            self.service.get_context_object(31, assignment)
        with self.assertRaises(ValueError):
            self.service.link_context(31, assignment, exam, "related_to")

    def test_lifecycle_archives_expired_context_and_securely_deletes(self) -> None:
        context_id = self._approve(40, "Remember project deadline is due July 20", "event-5")["context_object_id"]
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        self.service.update_context_object(40, context_id, {"expires_at": yesterday}, "shorten retention")

        dashboard = self.service.dashboard(40)
        self.assertEqual(dashboard["expired_archived"], 1)
        self.assertEqual(self.service.get_context_object(40, context_id)["status"], "archived")

        deleted = self.service.transition_context_object(40, context_id, "deleted", "user requested deletion")
        self.assertEqual(deleted["status"], "deleted")
        self.assertEqual(deleted["payload"], {})
        self.assertEqual(deleted["source"], {})
        self.assertEqual(len(deleted["versions"]), 1)

    def test_credentials_are_rejected_before_context_creation(self) -> None:
        result = self.service.observe_event(
            50,
            "UserMessageObserved",
            {"text": "Remember my password is do-not-store-this"},
            "dorje_ai",
            event_id="event-secret",
            sensitivity="sensitive",
        )
        self.assertEqual(result["candidate"]["status"], "rejected")
        self.assertEqual(self.service.context_objects(50), [])
        self.assertEqual(self.service.pending(50), [])

    def test_submitted_document_colon_deadline_creates_reminder_after_approval(self) -> None:
        event = self.service.observe_event(
            60,
            "SubmittedDocumentObserved",
            {"text": "Statistics Assignment 2\nDue: July 20\nTopic: Probability distributions"},
            "wkim_submission",
            event_id="submitted-document-deadline",
        )
        self.assertEqual(event["candidate"]["kind"], "deadline")
        self.assertEqual(self.service.reminders(60), [])
        self.service.decide(60, event["candidate"]["id"], True)
        reminders = self.service.reminders(60)
        self.assertEqual(len(reminders), 1)
        self.assertIn("July 20", reminders[0]["title"])


if __name__ == "__main__":
    unittest.main()
