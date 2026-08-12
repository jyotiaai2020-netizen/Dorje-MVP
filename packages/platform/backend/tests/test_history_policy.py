from datetime import datetime, timedelta, timezone
import unittest

from app.services.history_policy import (
    ENTERPRISE_HISTORY_POLICY,
    FREE_HISTORY_POLICY,
    PAID_HISTORY_POLICY,
    history_policy_engine,
    memory_policy_engine,
)


class HistoryPolicyTests(unittest.TestCase):
    def test_tier_history_policies_match_product_rules(self):
        self.assertEqual(history_policy_engine.get_policy("free"), FREE_HISTORY_POLICY)
        self.assertEqual(history_policy_engine.get_policy("paid"), PAID_HISTORY_POLICY)
        self.assertEqual(history_policy_engine.get_policy("enterprise"), ENTERPRISE_HISTORY_POLICY)

    def test_free_retention_expires_raw_history_but_keeps_recent_summaries(self):
        now = datetime(2026, 7, 10, tzinfo=timezone.utc)
        retained = history_policy_engine.apply_retention(
            [
                {
                    "id": "raw-expired-summary-kept",
                    "updatedAt": (now - timedelta(days=10)).isoformat(),
                    "summary": "Daily study summary",
                    "messages": [{"role": "user", "content": "raw"}],
                },
                {
                    "id": "too-old",
                    "updatedAt": (now - timedelta(days=40)).isoformat(),
                    "summary": "Old summary",
                    "messages": [{"role": "user", "content": "raw"}],
                },
                {
                    "id": "raw-expired-no-summary",
                    "updatedAt": (now - timedelta(days=8)).isoformat(),
                    "messages": [{"role": "user", "content": "raw"}],
                },
                {
                    "id": "fresh",
                    "updatedAt": (now - timedelta(days=1)).isoformat(),
                    "messages": [{"role": "user", "content": "raw"}],
                },
            ],
            "free",
            now,
        )

        self.assertEqual([item["id"] for item in retained], ["fresh", "raw-expired-summary-kept"])
        self.assertEqual(retained[1]["messages"], [])
        self.assertTrue(retained[1]["raw_history_expired"])

    def test_history_limit_is_tier_aware(self):
        now = datetime(2026, 7, 10, tzinfo=timezone.utc)
        conversations = [
            {"id": str(index), "updatedAt": (now - timedelta(hours=index)).isoformat(), "messages": []}
            for index in range(12)
        ]
        self.assertEqual(len(history_policy_engine.apply_retention(conversations, "free", now)), 10)
        self.assertEqual(len(history_policy_engine.apply_retention(conversations, "paid", now)), 12)
        self.assertEqual(len(history_policy_engine.apply_retention(conversations, "enterprise", now)), 12)

    def test_durable_memory_requires_memory_policy_engine_approval(self):
        rejected = memory_policy_engine.evaluate_durable_memory({"summary": "Remember everything"})
        self.assertFalse(rejected["allowed"])
        self.assertTrue(rejected["requires_policy_engine"])

        approved = memory_policy_engine.evaluate_durable_memory(
            {"summary": "Assignment due July 20", "policy_applied": "academic_context_allowed", "status": "approved"}
        )
        self.assertTrue(approved["allowed"])


if __name__ == "__main__":
    unittest.main()
