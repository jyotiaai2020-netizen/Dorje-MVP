import unittest

from app.services.upload_policy import upload_policy_engine


class UploadPolicyEngineTests(unittest.TestCase):
    def test_free_tier_limits_use_temporary_upgrade_bypass(self):
        self.assertEqual(upload_policy_engine.limits_for("free", "8gb")["max_file_size_mb"], 10)
        self.assertEqual(upload_policy_engine.limits_for("free", "8gb")["daily_upload_limit"], 3)
        self.assertEqual(upload_policy_engine.limits_for("free", "16gb")["max_file_size_mb"], 25)
        self.assertEqual(upload_policy_engine.limits_for("free", "32gb")["max_file_size_mb"], 100)
        self.assertTrue(upload_policy_engine.limits_for("free", "16gb")["temporary_upgrade_bypass"])

    def test_paid_tier_limits_follow_resource_profile_without_daily_cap(self):
        self.assertEqual(upload_policy_engine.limits_for("paid", "8gb")["max_file_size_mb"], 10)
        self.assertEqual(upload_policy_engine.limits_for("paid", "16gb")["max_file_size_mb"], 25)
        self.assertEqual(upload_policy_engine.limits_for("paid", "32gb")["max_file_size_mb"], 100)
        self.assertIsNone(upload_policy_engine.limits_for("paid", "16gb")["daily_upload_limit"])

    def test_large_free_upload_uses_temporary_upgrade_bypass(self):
        decision = upload_policy_engine.evaluate_upload("free", "8gb", file_size_bytes=3 * 1024 * 1024)
        self.assertTrue(decision["allowed"])
        self.assertFalse(decision["upgrade_required"])
        self.assertEqual(decision["tier"], "free")
        self.assertEqual(decision["resource_profile"], "8gb")
        self.assertEqual(decision["max_file_size_mb"], 10)
        self.assertTrue(decision["large_documents_available"])
        self.assertTrue(decision["temporary_upgrade_bypass"])

    def test_free_daily_upload_limit_blocks_after_profile_limit(self):
        decision = upload_policy_engine.evaluate_upload("free", "16gb", file_size_bytes=1024, daily_upload_count=5)
        self.assertFalse(decision["allowed"])
        self.assertTrue(decision["upgrade_required"])
        self.assertEqual(decision["required_tier"], "paid")

    def test_paid_upload_is_allowed_within_paid_profile_limit(self):
        decision = upload_policy_engine.evaluate_upload("paid", "32gb", file_size_bytes=90 * 1024 * 1024)
        self.assertTrue(decision["allowed"])
        self.assertEqual(decision["max_file_size_mb"], 100)


if __name__ == "__main__":
    unittest.main()
