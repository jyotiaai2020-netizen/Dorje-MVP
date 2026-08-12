import unittest

from app.services.tier_policy import TierName, TierPolicyEngine


class TierPolicyTests(unittest.TestCase):
    def test_large_documents_use_temporary_bypass(self):
        decision = TierPolicyEngine().capability_decision(TierName.FREE, "large_documents")
        self.assertTrue(decision["allowed"])
        self.assertFalse(decision["upgrade_required"])
        self.assertEqual(decision["reason"], "allowed by temporary model-test bypass")

    def test_image_generation_uses_temporary_bypass(self):
        free = TierPolicyEngine().capability_decision("free", "image_generation")
        paid = TierPolicyEngine().capability_decision("paid", "image_generation")
        self.assertTrue(free["allowed"])
        self.assertFalse(free["upgrade_required"])
        self.assertEqual(free["reason"], "allowed by temporary model-test bypass")
        self.assertTrue(paid["allowed"])
        self.assertFalse(paid["upgrade_required"])


if __name__ == "__main__":
    unittest.main()
