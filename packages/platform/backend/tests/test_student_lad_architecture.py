import unittest
from datetime import datetime, timedelta, timezone

from app.services.calendar.conflict_detector import calendar_conflict_detector
from app.services.fast_path_router import fast_path_router
from app.services.task_complexity import TaskComplexity, task_complexity_scorer


class StudentLADArchitectureTests(unittest.TestCase):
    def test_fast_command_returns_action_draft_without_planner(self):
        result = fast_path_router.route("Please set a reminder for Monday at 4pm")
        self.assertTrue(result["bypassed_planner"])
        self.assertEqual(result["intent"], "create_reminder")
        self.assertEqual(result["status"], "draft")
        self.assertTrue(result["requires_confirmation"])
        self.assertEqual(result["execution_mode"], "offline")
        self.assertTrue(result["action_id"].startswith("ACT-"))

    def test_family_health_finance_and_navigation_are_fast_commands(self):
        examples = [
            "Add my daughter parent-teacher meeting next Wednesday at 12 PM",
            "Schedule doctor appointment Friday at 3 PM",
            "Track gym membership renewal on July 20",
            "Go to calendar",
        ]
        for text in examples:
            with self.subTest(text=text):
                self.assertEqual(task_complexity_scorer.classify_request(text), TaskComplexity.FAST_COMMAND)

    def test_cloud_required_work_is_not_fast_path(self):
        result = fast_path_router.route("Generate a large image with cloud fallback")
        self.assertFalse(result["bypassed_planner"])
        self.assertEqual(result["complexity"], "cloud_required")

    def test_calendar_conflict_detection_is_deterministic(self):
        start = datetime(2026, 7, 13, 16, 0, tzinfo=timezone.utc)
        requested = {"title": "Parent-teacher meeting", "start": start.isoformat(), "duration_minutes": 60}
        existing = [{"title": "Statistics class", "start": (start + timedelta(minutes=30)).isoformat(), "duration_minutes": 60}]
        result = calendar_conflict_detector.detect(requested, existing)
        self.assertTrue(result["has_conflict"])
        self.assertEqual(result["severity"], "hard")
        self.assertEqual(result["existing_event"]["title"], "Statistics class")
        self.assertGreaterEqual(len(result["alternatives"]), 1)

    def test_calendar_conflict_detection_handles_clear_slot(self):
        requested = {"title": "Study block", "start": "2026-07-13T16:00:00+00:00", "duration_minutes": 60}
        existing = [{"title": "Morning class", "start": "2026-07-13T09:00:00+00:00", "duration_minutes": 60}]
        result = calendar_conflict_detector.detect(requested, existing)
        self.assertFalse(result["has_conflict"])
        self.assertEqual(result["recommendation"], "No calendar conflict detected.")


if __name__ == "__main__":
    unittest.main()

