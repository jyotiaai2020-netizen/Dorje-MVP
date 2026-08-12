import unittest

from app.services.capture_service import CaptureService


class CaptureServiceTests(unittest.TestCase):
    def test_text_capture_summarizes_without_persisting_when_review_disabled(self):
        service = CaptureService()
        result = service.capture_text(
            user_id=999001,
            content="Statistics webinar explained normal distributions. Assignment 2 is due July 20.",
            source_type="desktop_selection",
            source_title="Statistics webinar",
            requires_ceda_review=False,
        )
        self.assertEqual(result["source_type"], "desktop_selection")
        self.assertFalse(result["requires_ceda_review"])
        self.assertIsNone(result["ceda_batch"])
        self.assertIn("normal distributions", result["summary"])
        self.assertFalse(result["raw_retained"])

    def test_text_capture_can_create_ceda_review_batch(self):
        service = CaptureService()
        result = service.capture_text(
            user_id=999002,
            content="Remember that Statistics Assignment 2 is due July 20.",
            source_type="desktop_selection",
            source_title="Selected LMS text",
            requires_ceda_review=True,
        )
        self.assertTrue(result["requires_ceda_review"])
        self.assertIsNotNone(result["ceda_batch"])
        self.assertGreaterEqual(result["ceda_batch"]["item_count"], 1)


if __name__ == "__main__":
    unittest.main()
