import unittest

from app.services.device_profile import (
    ConnectivityMode,
    DeviceMode,
    ResourceProfile,
    device_profile_manager,
)


class DeviceProfileManagerTests(unittest.TestCase):
    def test_resource_profiles_define_expected_model_residency_and_budgets(self):
        mobile_rules = device_profile_manager.get_resource_rules(ResourceProfile.RAM_8GB)
        self.assertEqual(mobile_rules["resident_models"], ["intent_classifier"])
        self.assertIn("qwen3:8b", mobile_rules["disabled_local_models"])
        self.assertEqual(mobile_rules["max_context_tokens"], 1200)
        self.assertEqual(mobile_rules["daily_upload_limit_free"], 3)

        laptop_rules = device_profile_manager.get_resource_rules(ResourceProfile.RAM_16GB)
        self.assertIn("deepseek-r1:1.5b", laptop_rules["resident_models"])
        self.assertIn("qwen3:8b", laptop_rules["lazy_models"])
        self.assertEqual(laptop_rules["max_rag_chunks"], 4)

        desktop_rules = device_profile_manager.get_resource_rules(ResourceProfile.RAM_32GB)
        self.assertIn("qwen3:8b", desktop_rules["resident_models"])
        self.assertEqual(desktop_rules["disabled_local_models"], [])
        self.assertEqual(desktop_rules["max_file_size_mb_paid"], 100)

    def test_connectivity_modes_gate_cloud_and_connector_features(self):
        offline = device_profile_manager.get_connectivity_rules(ConnectivityMode.OFFLINE)
        self.assertIn("local_reminders", offline["allowed"])
        self.assertIn("cloud_model_fallback", offline["blocked"])
        self.assertIn("external_email_sending", offline["blocked"])
        self.assertFalse(device_profile_manager.can_use_connectivity_feature("offline", "web_search"))

        hybrid = device_profile_manager.get_connectivity_rules(ConnectivityMode.HYBRID)
        self.assertIn("local_first_execution", hybrid["allowed"])
        self.assertIn("cloud_fallback_if_paid", hybrid["allowed"])
        self.assertEqual(hybrid["blocked"], [])

        online = device_profile_manager.get_connectivity_rules(ConnectivityMode.ONLINE)
        self.assertIn("cloud_model_fallback", online["allowed"])
        self.assertIn("multi_device_sync", online["allowed"])

    def test_build_profile_normalizes_invalid_values_to_safe_defaults(self):
        profile = device_profile_manager.build_profile("tablet", "12gb", "sometimes")
        self.assertEqual(profile["device_mode"], DeviceMode.DESKTOP.value)
        self.assertEqual(profile["resource_profile"], ResourceProfile.RAM_16GB.value)
        self.assertEqual(profile["connectivity_mode"], ConnectivityMode.HYBRID.value)
        self.assertEqual(profile["resource_rules"]["max_context_tokens"], 3000)

    def test_context_budget_is_extracted_for_orchestrator_routing(self):
        budget = device_profile_manager.context_budget("32gb")
        self.assertEqual(
            budget,
            {
                "max_context_tokens": 8000,
                "max_recent_messages": 8,
                "max_memory_items": 12,
                "max_rag_chunks": 8,
            },
        )


if __name__ == "__main__":
    unittest.main()
