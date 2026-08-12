import unittest

from app.services.model_residency import model_residency_manager
from app.services.task_complexity import TaskComplexity


class ModelResidencyManagerTests(unittest.TestCase):
    def test_8gb_blocks_qwen_and_image_models(self):
        plan = model_residency_manager.plan("free", "8gb", "offline", TaskComplexity.SIMPLE_CHAT)
        self.assertEqual(plan["resident_models"], ["intent_classifier"])
        self.assertIn("qwen3:8b", plan["disabled_local_models"])
        self.assertIn("ssd-1b", plan["disabled_local_models"])
        self.assertIn("tiny-sd", plan["disabled_local_models"])
        self.assertFalse(model_residency_manager.can_load_model("qwen3:8b", "free", "8gb", "offline"))

    def test_16gb_keeps_deepseek_resident_and_ssd_disabled(self):
        plan = model_residency_manager.plan("free", "16gb", "hybrid")
        self.assertIn("deepseek-r1:1.5b", plan["resident_models"])
        self.assertIn("tiny-sd", plan["lazy_models"])
        self.assertIn("qwen3:8b", plan["lazy_models"])
        self.assertIn("ssd-1b", plan["disabled_local_models"])

    def test_32gb_paid_allows_ssd_and_keeps_qwen_resident(self):
        plan = model_residency_manager.plan("paid", "32gb", "online")
        self.assertIn("qwen3:8b", plan["resident_models"])
        self.assertNotIn("ssd-1b", plan["disabled_local_models"])
        self.assertTrue(plan["cloud_fallback_allowed"])

    def test_32gb_free_blocks_ssd_even_when_device_can_run_it(self):
        plan = model_residency_manager.plan("free", "32gb", "online")
        self.assertIn("ssd-1b", plan["disabled_local_models"])
        self.assertFalse(plan["cloud_fallback_allowed"])

    def test_deepseek_is_preferred_only_for_reasoning_tasks(self):
        simple = model_residency_manager.plan("paid", "32gb", "hybrid", TaskComplexity.SIMPLE_CHAT)
        reasoning = model_residency_manager.plan("paid", "32gb", "hybrid", TaskComplexity.REASONING_REQUIRED)
        self.assertEqual(simple["deepseek_policy"], "reasoning_only")
        self.assertEqual(reasoning["deepseek_policy"], "preferred")


if __name__ == "__main__":
    unittest.main()
