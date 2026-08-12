from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services.ceda_service import CEDAService
from app.services.ceda_structured_service import StructuredCEDAService


class StructuredCEDATests(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory(); self.ceda=CEDAService(Path(self.tmp.name)/"runtime"); self.service=StructuredCEDAService(self.ceda)
    def tearDown(self): self.tmp.cleanup()

    def extract(self,text="{\\rtf1\\ansi Statistics Assignment 2\\par Due: July 24, 2026\\par Course: Statistics}"):
        return self.service.extract(1,text,"file_upload","assignment.rtf")

    def test_one_clean_batch_without_raw_rtf(self):
        batch=self.extract(); self.assertEqual(batch["item_count"],1); self.assertEqual(len(batch["items"]),1)
        item=batch["items"][0]; self.assertNotIn("rtf",item["summary"].lower()); self.assertNotIn("\\",item["summary"]); self.assertEqual(item["key_date"],"July 24, 2026"); self.assertEqual(item["status"],"pending_review")
        self.assertFalse(item["metadata"]["raw_retained"]); self.assertEqual(item["source_reference"],"assignment.rtf")

    def test_exact_source_replay_does_not_duplicate(self):
        first=self.extract(); second=self.extract(); self.assertTrue(second["idempotent_replay"]); self.assertEqual(first["id"],second["id"]); self.assertEqual(len(self.service.list_items(1)),1)

    def test_same_meaning_from_another_source_is_flagged_duplicate(self):
        self.extract(); duplicate=self.service.extract(1,"Statistics Assignment 2\nDue: July 24, 2026","manual_entry","copied-note")
        self.assertEqual(duplicate["status"],"possible_duplicate"); self.assertEqual(len(self.service.list_items(1)),1)

    def test_approval_creates_context_but_reminder_requires_confirmation(self):
        item=self.extract()["items"][0]; approved=self.service.transition(1,item["id"],"approved")
        self.assertEqual(approved["status"],"approved"); self.assertTrue(approved["context_object_id"]); self.assertEqual(self.ceda.reminders(1),[])
        reminder=self.service.create_reminder(1,item["id"],"7_days"); self.assertEqual(reminder["reminder_date"],"2026-07-17"); self.assertEqual(len(self.ceda.reminders(1)),1)

    def test_denied_and_deleted_items_never_become_context(self):
        item=self.extract()["items"][0]; denied=self.service.transition(1,item["id"],"denied"); self.assertEqual(denied["status"],"denied"); self.assertIsNone(denied["context_object_id"])
        deleted=self.service.transition(1,item["id"],"deleted"); self.assertEqual(deleted["status"],"deleted"); self.assertEqual(self.ceda.context_objects(1),[])

    def test_deleting_approved_item_deletes_durable_context_and_payload(self):
        item=self.extract()["items"][0]; approved=self.service.transition(1,item["id"],"approved"); context_id=approved["context_object_id"]
        deleted=self.service.transition(1,item["id"],"deleted"); self.assertEqual(deleted["summary"],"Deleted information"); self.assertEqual(deleted["metadata"],{}); self.assertEqual(self.ceda.get_context_object(1,context_id)["status"],"deleted")

    def test_edit_copy_preserves_original_as_superseded(self):
        item=self.extract()["items"][0]; edited=self.service.edit_copy(1,item["id"],{"summary":"Statistics Assignment 2 deadline is July 25, 2026.","key_date":"July 25, 2026"})
        original=self.service.get_item(1,item["id"]); self.assertEqual(original["status"],"superseded"); self.assertEqual(original["superseded_by"],edited["id"]); self.assertEqual(edited["version"],2); self.assertEqual(edited["status"],"pending_review")

    def test_bulk_review_and_user_isolation(self):
        one=self.extract("Assignment One Due: July 24, 2026")["items"][0]; two=self.service.extract(1,"Assignment Two Due: July 26, 2026","manual_entry","note-2")["items"][0]
        approved=self.service.bulk(1,[one["id"],two["id"]],"approved"); self.assertEqual({item["status"] for item in approved},{"approved"}); self.assertEqual(self.service.list_items(2),[])

    def test_scheduled_class_is_academic_task_and_reminder_candidate(self):
        batch=self.service.extract(1,"Kamal add scheduled class INTR799 Monday 4pm","kamal_voice_or_text","kamal")
        item=batch["items"][0]
        self.assertEqual(item["type"],"Scheduled Class")
        self.assertEqual(item["metadata"]["directory"],"Scheduled Class")
        self.assertTrue(item["reminder_recommended"])
        self.assertEqual(item["reminder_status"],"needs_confirmation")
        approved=self.service.transition(1,item["id"],"approved")
        self.assertEqual(approved["status"],"approved")
        context=self.ceda.get_context_object(1,approved["context_object_id"])
        self.assertEqual(context["type"],"Scheduled Class")
        self.assertEqual(len(self.ceda.reminders(1)),1)


if __name__=="__main__": unittest.main()
