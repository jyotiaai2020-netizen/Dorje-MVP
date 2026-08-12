import unittest

from app.api.v1 import google_oauth


class GoogleOAuthSessionTests(unittest.TestCase):
    def test_connector_code_verifier_survives_missing_cookie_once(self):
        state = "connector-state-for-cookie-fallback"
        verifier = "pkce-verifier"

        google_oauth._remember_connector_session(state, verifier)

        self.assertEqual(google_oauth._consume_connector_session(state), verifier)
        self.assertIsNone(google_oauth._consume_connector_session(state))


if __name__ == "__main__":
    unittest.main()
