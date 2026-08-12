import unittest

from app.services.ceda_memory import ceda_memory_system
from app.services.context_composer import context_composer
from app.services.episodic_distiller import episodic_distiller
from app.services.memory_candidate_service import MemoryCandidateService
from app.services.memory_retriever import MemoryRetriever


class MemoryArchitectureTests(unittest.TestCase):
    def setUp(self):
        self.service = MemoryCandidateService()
        self.retriever = MemoryRetriever(self.service)

    def test_memory_candidate_created_from_preference(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "Always remind me in the evening."})
        self.assertEqual(candidate.category, "preference")
        self.assertEqual(candidate.memory_type, "semantic")
        self.assertIn("evening", candidate.content.lower())

    def test_sensitive_memory_requires_confirmation(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "Remember my password is TestPassword123."})
        self.assertEqual(candidate.sensitivity, "high")
        self.assertTrue(candidate.requires_confirmation)
        self.assertNotEqual(candidate.status, "approved")

    def test_low_risk_preference_auto_saved_when_enabled(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "I prefer evening reminders for homework."}, auto_memory_enabled=True)
        self.assertEqual(candidate.status, "approved")
        memories = self.service.list_memories(user_id="1")
        self.assertEqual(len(memories), 1)

    def test_user_rejection_blocks_memory_save(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "Remember I like morning reminders."}, auto_memory_enabled=False)
        rejected = self.service.reject(candidate.candidate_id)
        self.assertEqual(rejected.status, "rejected")
        self.assertEqual(self.service.list_memories(user_id="1"), [])

    def test_user_edit_updates_memory_content(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "I prefer evening reminders."})
        memory = self.service.approve(candidate.candidate_id)
        edited = self.service.update_memory(memory.memory_id, "User prefers reminders after 7 PM.")
        self.assertEqual(edited.status, "active")
        self.assertEqual(memory.memory_id, edited.supersedes_memory_id)

    def test_forget_memory_removes_from_retrieval(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "I prefer evening reminders."})
        memory = self.service.approve(candidate.candidate_id)
        self.assertTrue(self.service.forget(memory.memory_id, user_id="1"))
        found = self.retriever.retrieve("evening reminders", user_id="1", limit=5)
        self.assertEqual(found, [])

    def test_context_composer_respects_free_mobile_budget(self):
        composed = context_composer.compose(user_id="1", message="Plan homework", tier="free", device_mode="mobile", resource_profile="8gb", connectivity_mode="offline", task_complexity="simple_chat")
        self.assertLessEqual(composed["budget"]["max_recent_messages"], 2)
        self.assertLessEqual(composed["budget"]["max_memory_items"], 3)
        self.assertTrue(composed["budget"]["summary_required"])

    def test_context_composer_blocks_sensitive_cloud_memory(self):
        candidate = self.service.create_candidate({"user_id": "1", "workspace_id": "default", "user_message": "Remember my api key is abc123."})
        if candidate.status != "approved":
            self.assertTrue(candidate.requires_confirmation)
        found = self.retriever.retrieve("api key", user_id="1", include_sensitive=False, limit=5)
        self.assertEqual(found, [])

    def test_episodic_distiller_creates_lesson_from_correction(self):
        episode = episodic_distiller.distill({"user_message": "No, don't remind me in the morning. I prefer evening reminders."})
        self.assertIsNotNone(episode)
        self.assertIn("evening", episode["lesson"].lower())

    def test_procedural_skill_loaded_for_reminder_intent(self):
        composed = context_composer.compose(user_id="1", message="Remind me tomorrow", intent="create_reminder")
        self.assertIn("reminder_creation_skill", composed["procedural_skill"])

    def test_memory_retriever_filters_expired_memory(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "I prefer evening reminders."})
        memory = self.service.approve(candidate.candidate_id)
        memory.expires_at = "2000-01-01T00:00:00+00:00"
        found = self.retriever.retrieve("evening reminders", user_id="1", limit=5)
        self.assertEqual(found, [])

    def test_memory_retriever_filters_superseded_memory(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "I prefer evening reminders."})
        memory = self.service.approve(candidate.candidate_id)
        self.service.update_memory(memory.memory_id, "User prefers reminders after dinner.")
        found = self.retriever.retrieve("evening reminders", user_id="1", limit=5)
        self.assertTrue(all(row["memory"]["status"] != "superseded" for row in found))

    def test_memory_retriever_enforces_tenant_boundary(self):
        candidate = self.service.create_candidate({"user_id": "1", "workspace_id": "academic", "user_message": "I prefer evening reminders."})
        self.service.approve(candidate.candidate_id)
        found = self.retriever.retrieve("evening reminders", user_id="2", workspace_id="academic", limit=5)
        self.assertEqual(found, [])

    def test_feedback_reduces_confidence_after_rejection(self):
        candidate = self.service.create_candidate({"user_id": "1", "user_message": "I prefer evening reminders."})
        memory = self.service.approve(candidate.candidate_id)
        before = memory.confidence
        result = self.service.feedback({"feedback_type": "disliked", "target_memory_id": memory.memory_id})
        self.assertLess(result["memory"]["confidence"], before)

    def test_ceda_loop_updates_context_after_approval(self):
        result = ceda_memory_system.process_interaction({"user_id": "1", "user_message": "I prefer evening reminders for assignments."})
        self.assertIn("candidate", result)
        self.assertTrue(result["context_updated"])


if __name__ == "__main__":
    unittest.main()
