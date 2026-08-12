from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services.ceda_service import CEDAService
from app.services.kamal_action_engine import KamalActionEngine, KamalActionError


class KamalActionEngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.ceda = CEDAService(Path(self.tmp.name) / "workspace")
        self.engine = KamalActionEngine(self.ceda)
        self.user_id = 101
        self.other_user_id = 202

    def tearDown(self):
        self.tmp.cleanup()

    def create_reminder(self, title="Pay electricity bill", user_id=None, status="active"):
        item = self.ceda.create_local_reminder(
            user_id or self.user_id,
            title=title,
            due_at="2026-08-09T16:00:00+00:00",
            reminder_date="2026-08-09T16:00:00+00:00",
            priority="high",
            source="test",
        )
        if status != "active":
            item = self.ceda.update_local_reminder(user_id or self.user_id, item["id"], status=status)
        return item

    def preview_and_execute(self, message="Kamal, mark the electricity bill task as completed."):
        preview = self.engine.preview(user_id=self.user_id, message=message, source="text")
        self.assertEqual(preview["status"], "preview", preview)
        result = self.engine.execute(user_id=self.user_id, action=preview["action"])
        self.assertEqual(result["status"], "success", result)
        return preview, result

    def context_status(self, context_id):
        with self.ceda._connect() as db:
            row = db.execute("SELECT status FROM context_objects WHERE id=? AND user_id=?", (context_id, self.user_id)).fetchone()
        return row["status"]

    def audit_actions(self):
        with self.ceda._connect() as db:
            return [row["action"] for row in db.execute("SELECT action FROM audit_log WHERE user_id=? ORDER BY created_at", (self.user_id,))]

    def test_complete_one_exact_persisted_reminder(self):
        reminder = self.create_reminder()
        preview, result = self.preview_and_execute()

        self.assertEqual(preview["item"]["id"], reminder["id"])
        self.assertEqual(preview["before"]["status"], "active")
        self.assertEqual(preview["after"]["status"], "completed")
        self.assertEqual(result["item"]["id"], reminder["id"])
        self.assertEqual(result["item"]["status"], "completed")
        self.assertTrue(result["undo_token"].startswith("UNDO-"))

    def test_complete_numbered_quiz_phrase_requires_real_mutation(self):
        reminder = self.create_reminder("Weeks 11-12 Quiz 7/26/26 plan it at least a week before")
        preview = self.engine.preview(user_id=self.user_id, message="Put the task 11 to 12 who is as completed", source="text")
        self.assertEqual(preview["status"], "preview", preview)
        self.assertEqual(preview["item"]["id"], reminder["id"])
        result = self.engine.execute(user_id=self.user_id, action=preview["action"])
        self.assertEqual(result["item"]["status"], "completed")

    def test_reopen_a_completed_reminder(self):
        reminder = self.create_reminder(status="completed")
        preview = self.engine.preview(user_id=self.user_id, message="Reopen the electricity bill task.", source="text")
        self.assertEqual(preview["item"]["id"], reminder["id"])
        self.assertEqual(preview["before"]["status"], "completed")
        self.assertEqual(preview["after"]["status"], "active")
        result = self.engine.execute(user_id=self.user_id, action=preview["action"])
        self.assertEqual(result["item"]["status"], "active")

    def test_move_single_completed_task_back_to_active_from_pronoun(self):
        reminder = self.create_reminder("Weeks 11-12 Quiz 7/26/26 plan it at least a week before", status="completed")
        preview = self.engine.preview(user_id=self.user_id, message="Can you move that to active task as not completed?", source="text")
        self.assertEqual(preview["status"], "preview", preview)
        self.assertEqual(preview["item"]["id"], reminder["id"])
        self.assertEqual(preview["before"]["status"], "completed")
        self.assertEqual(preview["after"]["status"], "active")
        result = self.engine.execute(user_id=self.user_id, action=preview["action"])
        self.assertEqual(result["item"]["status"], "active")
        self.assertIn("kamal_action.REOPEN", self.audit_actions())

    def test_move_completed_quiz_title_to_active_and_plan_it(self):
        reminder = self.create_reminder("Weeks 11-12 Quiz 7/26/26 plan it at least a week before", status="completed")
        preview = self.engine.preview(
            user_id=self.user_id,
            message="Can you move Weeks 11-12 Quiz 7/26/26 plan it at least a week before — Jul 17, 26 to active task and plan it",
            source="text",
        )
        self.assertEqual(preview["status"], "preview", preview)
        self.assertEqual(preview["item"]["id"], reminder["id"])
        result = self.engine.execute(user_id=self.user_id, action=preview["action"])
        self.assertEqual(result["item"]["status"], "active")

    def test_undo_restores_prior_status(self):
        self.create_reminder()
        _, result = self.preview_and_execute()
        undo = self.engine.undo(user_id=self.user_id, undo_token=result["undo_token"])
        self.assertEqual(undo["item"]["status"], "active")
        self.assertIn("kamal_action.undo", self.audit_actions())

    def test_zero_matches_produce_no_mutation(self):
        self.create_reminder("Submit assignment")
        preview = self.engine.preview(user_id=self.user_id, message="Mark the electricity bill task completed.", source="text")
        self.assertEqual(preview["status"], "not_found")
        self.assertEqual(self.ceda.reminders(self.user_id)[0]["status"], "active")

    def test_multiple_matches_require_clarification(self):
        self.create_reminder("Pay electricity bill")
        self.create_reminder("Review electricity bill statement")
        preview = self.engine.preview(user_id=self.user_id, message="Mark the electricity bill task completed.", source="text")
        self.assertEqual(preview["status"], "clarification_required")
        self.assertEqual(len(preview["candidates"]), 2)
        self.assertTrue(all(item["status"] == "active" for item in self.ceda.reminders(self.user_id)))

    def test_another_users_task_cannot_be_modified(self):
        other = self.create_reminder(user_id=self.other_user_id)
        preview = self.engine.preview(user_id=self.user_id, message="Mark the electricity bill task completed.", source="text")
        self.assertEqual(preview["status"], "not_found")
        with self.assertRaises(KamalActionError):
            self.engine.execute(
                user_id=self.user_id,
                action={"operation": "COMPLETE", "entityType": "task", "entityId": other["id"], "changes": {"status": "completed"}},
            )

    def test_deleted_records_are_excluded_from_active_search(self):
        reminder = self.create_reminder()
        self.ceda.delete_local_reminder(self.user_id, reminder["id"])
        preview = self.engine.preview(user_id=self.user_id, message="Mark the electricity bill task completed.", source="text")
        self.assertEqual(preview["status"], "not_found")

    def test_completing_reminder_synchronizes_linked_ceda_context(self):
        reminder = self.create_reminder()
        _, result = self.preview_and_execute()
        self.assertEqual(result["item"]["status"], "completed")
        self.assertEqual(self.context_status(reminder["context_id"]), "dormant")

    def test_missing_ceda_context_leaves_recoverable_audit_state(self):
        reminder = self.create_reminder()
        with self.ceda._connect() as db:
            db.execute("DELETE FROM context_objects WHERE id=?", (reminder["context_id"],))
        _, result = self.preview_and_execute()
        self.assertEqual(result["item"]["status"], "completed")
        self.assertIn("kamal_action.ceda_sync_missing", self.audit_actions())

    def test_repeating_same_action_is_idempotent(self):
        self.create_reminder()
        _, first = self.preview_and_execute()
        repeated = self.engine.execute(
            user_id=self.user_id,
            action={"operation": "COMPLETE", "entityType": "task", "entityId": first["item"]["id"], "changes": {"status": "completed"}, "expectedVersion": first["item"]["version"]},
        )
        self.assertTrue(repeated["idempotent"])
        self.assertIsNone(repeated["undo_token"])

    def test_archive_and_delete_result_in_different_statuses(self):
        archive = self.create_reminder("Pay electricity bill")
        delete = self.create_reminder("Pay water bill")
        archive_result = self.engine.execute(user_id=self.user_id, action={"operation": "ARCHIVE", "entityType": "task", "entityId": archive["id"], "changes": {"status": "archived"}, "expectedVersion": archive["version"]})
        delete_result = self.engine.execute(user_id=self.user_id, action={"operation": "DELETE", "entityType": "task", "entityId": delete["id"], "changes": {"status": "deleted"}, "expectedVersion": delete["version"]})
        self.assertEqual(archive_result["item"]["status"], "archived")
        self.assertEqual(delete_result["item"]["status"], "deleted")

    def test_invalid_fields_and_operations_are_rejected(self):
        reminder = self.create_reminder()
        with self.assertRaises(KamalActionError):
            self.engine.execute(user_id=self.user_id, action={"operation": "DROP_TABLE", "entityType": "task", "entityId": reminder["id"], "changes": {"status": "completed"}})
        with self.assertRaises(KamalActionError):
            self.engine.execute(user_id=self.user_id, action={"operation": "COMPLETE", "entityType": "task", "entityId": reminder["id"], "changes": {"sql": "anything"}})

    def test_stale_version_updates_are_rejected_safely(self):
        reminder = self.create_reminder()
        self.ceda.update_local_reminder(self.user_id, reminder["id"], priority="critical")
        with self.assertRaises(KamalActionError):
            self.engine.execute(user_id=self.user_id, action={"operation": "COMPLETE", "entityType": "task", "entityId": reminder["id"], "changes": {"status": "completed"}, "expectedVersion": reminder["version"]})


if __name__ == "__main__":
    unittest.main()
