import unittest

from app.services.memory_policy import MemoryClass, memory_policy_engine


class MemoryPolicyEngineTests(unittest.TestCase):
    def test_temporary_and_session_memory_expire_without_durable_storage(self):
        temporary = memory_policy_engine.evaluate({"summary": "Explain probability"}, MemoryClass.TEMPORARY)
        self.assertTrue(temporary["allowed"])
        self.assertEqual(temporary["expires"], "interaction_end")

        session = memory_policy_engine.evaluate({"session_id": "abc"}, MemoryClass.SESSION)
        self.assertTrue(session["allowed"])
        self.assertEqual(session["expires"], "session_end")

    def test_workspace_memory_requires_project_note_task_or_document_reference(self):
        missing = memory_policy_engine.evaluate({"summary": "Assignment plan"}, MemoryClass.WORKSPACE)
        self.assertFalse(missing["allowed"])
        self.assertTrue(missing["requires_workspace_reference"])

        linked = memory_policy_engine.evaluate({"summary": "Assignment plan", "document_id": "doc-1"}, MemoryClass.WORKSPACE)
        self.assertTrue(linked["allowed"])
        self.assertEqual(linked["expires"], "workspace_lifecycle")

    def test_durable_memory_requires_user_approval_and_policy(self):
        rejected = memory_policy_engine.evaluate({"summary": "Remember this"}, MemoryClass.DURABLE)
        self.assertFalse(rejected["allowed"])
        self.assertTrue(rejected["requires_user_approval"])

        approved = memory_policy_engine.evaluate(
            {"summary": "Statistics deadline", "policy_applied": "academic_context_allowed", "approved": True},
            MemoryClass.DURABLE,
        )
        self.assertTrue(approved["allowed"])
        self.assertEqual(approved["storage_mode"], "encrypted_local")

    def test_sensitive_memory_is_rejected_and_classified(self):
        classified = memory_policy_engine.classify({"summary": "Remember my password is TestPassword123"})
        self.assertEqual(classified, MemoryClass.SENSITIVE)

        rejected = memory_policy_engine.evaluate({"summary": "api key abc123"}, MemoryClass.SENSITIVE)
        self.assertFalse(rejected["allowed"])
        self.assertIn("Sensitive memory", rejected["reason"])

    def test_enterprise_memory_requires_tenant_and_role_boundaries(self):
        decision = memory_policy_engine.evaluate(
            {"policy_applied": "tenant_context_allowed", "approved": True},
            MemoryClass.DURABLE,
            tier="enterprise",
            tenant_id="tenant-1",
            role="analyst",
        )
        self.assertTrue(decision["tenant_boundary_required"])
        self.assertTrue(decision["role_boundary_required"])
        self.assertEqual(decision["tenant_id"], "tenant-1")


if __name__ == "__main__":
    unittest.main()
