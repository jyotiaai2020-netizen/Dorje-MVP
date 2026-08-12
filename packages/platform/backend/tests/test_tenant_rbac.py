import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rbac import Role
from app.core.security import create_access_token, hash_password
from app.db.database import Base
from app.db.session import get_db
from app.main import app
from app.models.organization import Organization
from app.models.user import User
from app.api.v1.dorje_ai import orchestrator as dorje_service
from app.api.v1.dorje_ai import image_generator
from app.api.v1.dorje_ai import image_job_store
from app.api.v1.dorje_ai_connectors import service as connector_service
from app.schemas.dorje_ai import StructuredTable
from app.services.image_job_store import ImageJobStore
from app.models.user_connector import UserConnector
from app.services.token_encryption_service import TokenEncryptionService
from app.core.config import settings
from cryptography.fernet import Fernet


class TenantRBACTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)

    def setUp(self):
        Base.metadata.drop_all(self.engine)
        Base.metadata.create_all(self.engine)

        def override_get_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

        with self.Session() as db:
            org_a = Organization(name="Tenant A")
            org_b = Organization(name="Tenant B")
            db.add_all([org_a, org_b])
            db.flush()
            users = [
                User(
                    email="admin-a@example.com",
                    full_name="Admin A",
                    password_hash=hash_password("strong-password"),
                    organization_id=org_a.id,
                    role=Role.ORG_ADMIN.value,
                ),
                User(
                    email="consultant-a@example.com",
                    full_name="Consultant A",
                    password_hash=hash_password("strong-password"),
                    organization_id=org_a.id,
                    role=Role.CONSULTANT.value,
                ),
                User(
                    email="client-a@example.com",
                    full_name="Client A",
                    password_hash=hash_password("strong-password"),
                    organization_id=org_a.id,
                    role=Role.CLIENT_USER.value,
                ),
                User(
                    email="paid-a@example.com",
                    full_name="Paid A",
                    password_hash=hash_password("strong-password"),
                    organization_id=org_a.id,
                    role="professional_user",
                ),
                User(
                    email="admin-b@example.com",
                    full_name="Admin B",
                    password_hash=hash_password("strong-password"),
                    organization_id=org_b.id,
                    role=Role.ORG_ADMIN.value,
                ),
            ]
            db.add_all(users)
            db.commit()
            self.org_a_id = org_a.id
            self.org_b_id = org_b.id
            self.user_ids = {user.email: user.id for user in users}

    def tearDown(self):
        app.dependency_overrides.clear()

    def headers_for(self, email: str) -> dict[str, str]:
        token = create_access_token({"sub": email, "user_id": self.user_ids[email]})
        return {"Authorization": f"Bearer {token}"}

    def test_user_cannot_access_another_tenants_organization(self):
        response = self.client.get(
            f"/api/v1/organizations/{self.org_b_id}",
            headers=self.headers_for("client-a@example.com"),
        )
        self.assertEqual(response.status_code, 404)

    def test_user_cannot_create_report_outside_their_organization(self):
        response = self.client.post(
            "/api/v1/reports/generate",
            headers=self.headers_for("consultant-a@example.com"),
            json={
                "organization_id": self.org_b_id,
                "company": "Tenant B",
                "industry": "Technology",
                "employees": 20,
                "goal": "Cross-tenant attempt",
            },
        )
        self.assertEqual(response.status_code, 404)

    def test_admin_consultant_and_client_permissions(self):
        client_headers = self.headers_for("client-a@example.com")
        consultant_headers = self.headers_for("consultant-a@example.com")
        admin_headers = self.headers_for("admin-a@example.com")
        payload = {
            "organization_id": self.org_a_id,
            "name": "Tenant project",
            "description": "RBAC test",
        }

        self.assertEqual(
            self.client.post("/api/v1/projects/", headers=client_headers, json=payload).status_code,
            403,
        )
        created = self.client.post(
            "/api/v1/projects/", headers=consultant_headers, json=payload
        )
        self.assertEqual(created.status_code, 201, created.text)
        project_id = created.json()["id"]
        self.assertEqual(
            self.client.get(f"/api/v1/projects/{project_id}", headers=client_headers).status_code,
            200,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/projects/{project_id}", headers=client_headers).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/projects/{project_id}", headers=admin_headers).status_code,
            204,
        )

    def test_refresh_rotation_and_logout(self):
        login = self.client.post(
            "/api/v1/auth/login",
            json={"email": "client-a@example.com", "password": "strong-password"},
        )
        self.assertEqual(login.status_code, 200, login.text)
        self.assertIn("lotus_access_token", self.client.cookies)
        self.assertIn("lotus_refresh_token", self.client.cookies)

        refresh = self.client.post("/api/v1/auth/refresh")
        self.assertEqual(refresh.status_code, 200, refresh.text)
        self.assertEqual(self.client.post("/api/v1/auth/logout").status_code, 204)
        self.assertEqual(self.client.post("/api/v1/auth/refresh").status_code, 401)

    def test_dorje_and_kamal_stream_chunks(self):
        async def chunks():
            yield "First "
            yield "chunk"
        headers = self.headers_for("client-a@example.com")
        with patch.object(dorje_service, "stream", return_value=chunks()):
            response = self.client.post(
                "/api/v1/dorje-ai/chat",
                headers=headers,
                json={"message": "Help with strategy", "history": [], "files": []},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.text, "First chunk")

        plan = dorje_service.router.fallback_plan("Summarize this PDF", [])
        document_prompt = dorje_service._content_prompt("Summarize this PDF", "", [], [SimpleNamespace(name="Profile.pdf", type="application/pdf", content="Profile content " * 1000)], plan, "None")
        self.assertIn("FILE: Profile.pdf", document_prompt)
        self.assertIn("Profile content", document_prompt)
        self.assertGreater(len(document_prompt), 6000)
        self.assertTrue(response.headers["content-type"].startswith("text/plain"))

        async def kamal_chunks():
            yield SimpleNamespace(content="First ")
            yield SimpleNamespace(content="chunk")
        fake_llm = SimpleNamespace(astream=lambda prompt: kamal_chunks())
        with patch("app.api.v1.chat.llm", fake_llm):
            response = self.client.post(
                "/api/v1/chat/kamal",
                headers=headers,
                json={"message": "Explain analytics strategy", "history": []},
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.text, "First chunk")

    def test_image_job_is_owned_and_returns_content(self):
        free_headers = self.headers_for("client-a@example.com")
        headers = self.headers_for("paid-a@example.com")
        other_headers = self.headers_for("admin-b@example.com")
        png_bytes = b"\x89PNG\r\n\x1a\nmock-image-content"

        unauthorized = self.client.post(
            "/api/v1/dorje-ai/image/jobs",
            json={"message": "Generate an image of a parrot", "history": [], "files": []},
        )
        self.assertEqual(unauthorized.status_code, 401)

        free_prompt_response = self.client.post(
            "/api/v1/dorje-ai/image-prompt",
            headers=free_headers,
            json={"message": "Create a parrot image prompt", "history": [], "files": []},
        )
        self.assertEqual(free_prompt_response.status_code, 200, free_prompt_response.text)
        self.assertIn("prompt", free_prompt_response.json())
        image_status = self.client.get("/api/v1/dorje-ai/image/status", headers=headers)
        self.assertEqual(image_status.status_code, 200, image_status.text)
        image_status_body = image_status.json()
        self.assertEqual(image_status_body["capability"]["capability"], "image_generation")
        self.assertIn("model_residency", image_status_body)
        self.assertIn("runtime", image_status_body)
        self.assertIn("tiny-sd", image_status_body["models"])
        self.assertIn("locally_cached", image_status_body["models"]["tiny-sd"])

        with patch.object(
            dorje_service,
            "optimize_image_prompt",
            new=AsyncMock(return_value="A premium illustration of a friendly green parrot"),
        ):
            prompt_response = self.client.post(
                "/api/v1/dorje-ai/image-prompt",
                headers=headers,
                json={"message": "Create a parrot image prompt", "history": [], "files": []},
            )
        self.assertEqual(prompt_response.status_code, 200, prompt_response.text)
        self.assertEqual(
            prompt_response.json(),
            {"prompt": "A premium illustration of a friendly green parrot"},
        )

        with (
            patch.object(dorje_service, "optimize_image_prompt", new=AsyncMock(return_value="a parrot")),
            patch.object(image_generator, "generate", return_value=png_bytes),
        ):
            image_response = self.client.post(
                "/api/v1/dorje-ai/image",
                headers=headers,
                json={"message": "Generate an image of a parrot", "history": [], "files": []},
            )
        self.assertEqual(image_response.status_code, 200, image_response.text)
        self.assertEqual(image_response.headers["content-type"], "image/png")
        self.assertEqual(image_response.content, png_bytes)

        with (
            patch.object(dorje_service, "optimize_image_prompt", new=AsyncMock(return_value="a parrot")),
            patch.object(image_generator, "generate", return_value=png_bytes),
        ):
            created = self.client.post(
                "/api/v1/dorje-ai/image/jobs",
                headers=headers,
                json={"message": "Generate an image of a parrot", "history": [], "files": []},
            )
        self.assertEqual(created.status_code, 202, created.text)
        job_id = created.json()["job_id"]
        self.assertEqual(
            self.client.get(f"/api/v1/dorje-ai/image/jobs/{job_id}", headers=other_headers).status_code,
            404,
        )
        status_response = self.client.get(
            f"/api/v1/dorje-ai/image/jobs/{job_id}", headers=headers
        )
        self.assertEqual(status_response.json()["status"], "complete")
        content = self.client.get(
            f"/api/v1/dorje-ai/image/jobs/{job_id}/content", headers=headers
        )
        self.assertEqual(content.status_code, 200)
        self.assertEqual(content.headers["content-type"], "image/png")
        self.assertEqual(content.content, png_bytes)
        reloaded_store = ImageJobStore(image_job_store.base_dir)
        self.assertEqual(reloaded_store.get(job_id)["status"], "complete")
        self.assertEqual(reloaded_store.image(job_id), png_bytes)

    def test_chat_pdf_and_table_exports(self):
        headers = self.headers_for("client-a@example.com")
        pdf = self.client.post(
            "/api/v1/dorje-ai/chat/pdf",
            headers=headers,
            json={"message": "Export chat", "history": [{"role": "assistant", "content": "A useful result\n|\n| Name | Value |\n| --- | --- |\n| Lotus | 42 |"}], "files": []},
        )
        self.assertEqual(pdf.status_code, 200, pdf.text)
        self.assertEqual(pdf.headers["content-type"], "application/pdf")
        self.assertTrue(pdf.content.startswith(b"%PDF"))

        structured = StructuredTable(
            title="Project Data",
            columns=["Project", "Status"],
            rows=[["Lotus", "Active"]],
        )
        with patch.object(dorje_service, "structure_table", new=AsyncMock(return_value=structured)):
            table = self.client.post(
                "/api/v1/dorje-ai/table",
                headers=headers,
                json={"content": "Lotus project is active"},
            )
        self.assertEqual(table.status_code, 200, table.text)
        workbook = self.client.post(
            "/api/v1/dorje-ai/table/xlsx",
            headers=headers,
            json=table.json(),
        )
        self.assertEqual(workbook.status_code, 200, workbook.text)
        self.assertTrue(workbook.content.startswith(b"PK"))
        table_pdf = self.client.post(
            "/api/v1/dorje-ai/table/pdf", headers=headers, json=table.json()
        )
        self.assertEqual(table_pdf.status_code, 200, table_pdf.text)
        self.assertTrue(table_pdf.content.startswith(b"%PDF"))
        table_png = self.client.post(
            "/api/v1/dorje-ai/table/png", headers=headers, json=table.json()
        )
        self.assertEqual(table_png.status_code, 200, table_png.text)
        self.assertTrue(table_png.content.startswith(b"\x89PNG"))

    def test_productivity_endpoints_are_protected_and_gmail_requires_configuration(self):
        self.assertEqual(self.client.get("/api/v1/dorje-ai/connectors").status_code, 401)
        headers = self.headers_for("client-a@example.com")
        connectors = self.client.get("/api/v1/dorje-ai/connectors", headers=headers)
        self.assertEqual(connectors.status_code, 200)
        self.assertTrue(all(item["status"] == "not_connected" for item in connectors.json()))

        connection = self.client.post(
            "/api/v1/dorje-ai/connectors/gmail/connect", headers=headers
        )
        self.assertEqual(connection.status_code, 405)
        oauth = self.client.get(
            "/api/v1/connectors/google/gmail/connect", headers=headers, follow_redirects=False
        )
        self.assertIn(oauth.status_code, {200, 503})
        if oauth.status_code == 200:
            self.assertTrue(oauth.json()["authorization_url"].startswith("https://accounts.google.com/"))
        else:
            self.assertFalse(any("token" in key.lower() for key in oauth.json()))

        fake_llm = SimpleNamespace(
            invoke=lambda prompt: SimpleNamespace(
                content='{"subject":"Draft subject","body":"Draft body"}'
            )
        )
        with patch.object(connector_service, "llm", fake_llm):
            draft = self.client.post(
                "/api/v1/dorje-ai/email/draft",
                headers=headers,
                json={"goal": "Schedule a meeting", "tone": "Executive"},
            )
        self.assertEqual(draft.status_code, 200, draft.text)
        self.assertEqual(draft.json()["subject"], "Draft subject")

    def test_google_auth_start_uses_configured_student_redirect_uri(self):
        with (
            patch.object(settings, "GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com"),
            patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-secret"),
            patch.object(settings, "GOOGLE_REDIRECT_URI", "http://127.0.0.1:3100/api/oauth/google/callback"),
        ):
            response = self.client.get("/api/v1/auth/google/start")
        self.assertEqual(response.status_code, 200, response.text)
        query = parse_qs(urlparse(response.json()["authorization_url"]).query)
        self.assertEqual(query["redirect_uri"], ["http://127.0.0.1:3100/api/oauth/google/callback"])
        self.assertEqual(query["client_id"], ["test-client.apps.googleusercontent.com"])

    def test_password_recovery_reset_and_change_password(self):
        recovery = self.client.post("/api/v1/auth/forgot-password", json={"email": "client-a@example.com"})
        self.assertEqual(recovery.status_code, 200, recovery.text)
        reset_token = recovery.json().get("reset_token")
        self.assertTrue(reset_token)

        reset = self.client.post("/api/v1/auth/reset-password", json={"token": reset_token, "new_password": "new-strong-password"})
        self.assertEqual(reset.status_code, 200, reset.text)

        old_login = self.client.post("/api/v1/auth/login", json={"email": "client-a@example.com", "password": "strong-password"})
        self.assertEqual(old_login.status_code, 401)
        new_login = self.client.post("/api/v1/auth/login", json={"email": "client-a@example.com", "password": "new-strong-password"})
        self.assertEqual(new_login.status_code, 200, new_login.text)

        change = self.client.post(
            "/api/v1/auth/change-password",
            headers={"Authorization": f"Bearer {new_login.json()['access_token']}"},
            json={"current_password": "new-strong-password", "new_password": "final-strong-password"},
        )
        self.assertEqual(change.status_code, 200, change.text)
        final_login = self.client.post("/api/v1/auth/login", json={"email": "client-a@example.com", "password": "final-strong-password"})
        self.assertEqual(final_login.status_code, 200, final_login.text)

    def test_password_recovery_does_not_reveal_unknown_account(self):
        response = self.client.post("/api/v1/auth/forgot-password", json={"email": "missing@example.com"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("reset_token", response.json())


    def test_google_auth_callback_uses_server_session_when_cookie_is_missing(self):
        class FakeFlow:
            def __init__(self):
                self.redirect_uri = None
                self.credentials = SimpleNamespace(id_token="fake-id-token")

            def fetch_token(self, code: str):
                self.fetched_code = code

        fake_flow = FakeFlow()
        with (
            patch.object(settings, "GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com"),
            patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-secret"),
            patch.object(settings, "GOOGLE_REDIRECT_URI", "http://127.0.0.1:3100/api/oauth/google/callback"),
            patch.object(settings, "APP_URL", "http://127.0.0.1:3100"),
        ):
            start = self.client.get("/api/v1/auth/google/start")
            self.assertEqual(start.status_code, 200, start.text)
            query = parse_qs(urlparse(start.json()["authorization_url"]).query)
            state = query["state"][0]
            # Simulate Safari/local-host cookie loss during the Google round trip.
            self.client.cookies.clear()
            with (
                patch("app.api.v1.auth.Flow.from_client_config", return_value=fake_flow),
                patch("app.api.v1.auth.google_id_token.verify_oauth2_token", return_value={"email": "google.student@example.com", "email_verified": True, "name": "Google Student"}),
            ):
                callback = self.client.get(
                    f"/api/v1/auth/google/callback?code=test-code&state={state}",
                    follow_redirects=False,
                )
        self.assertEqual(callback.status_code, 302, callback.text)
        self.assertIn("/auth/google/complete", callback.headers["location"])
        ticket = parse_qs(urlparse(callback.headers["location"]).query)["ticket"][0]
        self.assertIn("lotus_access_token", callback.headers.get("set-cookie", ""))
        self.client.cookies.clear()
        exchanged = self.client.post("/api/v1/auth/google/complete", json={"ticket": ticket})
        self.assertEqual(exchanged.status_code, 200, exchanged.text)
        self.assertEqual(exchanged.json()["user"]["email"], "google.student@example.com")
        self.assertIn("lotus_access_token", exchanged.headers.get("set-cookie", ""))
        replay = self.client.post("/api/v1/auth/google/complete", json={"ticket": ticket})
        self.assertEqual(replay.status_code, 400)

    def test_gmail_connector_status_is_isolated_per_user(self):
        with self.Session() as db:
            db.add(UserConnector(
                user_id=self.user_ids["client-a@example.com"],
                organization_id=self.org_a_id,
                provider="gmail",
                provider_account_email="client.a@gmail.com",
                scope="https://www.googleapis.com/auth/gmail.send",
                status="connected",
            ))
            db.commit()
        own = self.client.get(
            "/api/v1/dorje-ai/connectors", headers=self.headers_for("client-a@example.com")
        ).json()
        other = self.client.get(
            "/api/v1/dorje-ai/connectors", headers=self.headers_for("admin-b@example.com")
        ).json()
        own_gmail = next(item for item in own if item["provider"] == "gmail")
        other_gmail = next(item for item in other if item["provider"] == "gmail")
        self.assertEqual(own_gmail["status"], "connected")
        self.assertEqual(own_gmail["account_email"], "client.a@gmail.com")
        self.assertEqual(other_gmail["status"], "not_connected")
        self.assertIsNone(other_gmail["account_email"])

    def test_oauth_token_encryption_never_stores_plaintext(self):
        previous_key = settings.TOKEN_ENCRYPTION_KEY
        settings.TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()
        try:
            service = TokenEncryptionService()
            encrypted = service.encrypt("secret-refresh-token")
            self.assertNotIn("secret-refresh-token", encrypted)
            self.assertEqual(service.decrypt(encrypted), "secret-refresh-token")
        finally:
            settings.TOKEN_ENCRYPTION_KEY = previous_key

    def test_device_profile_settings_are_authenticated_user_scoped_and_persisted(self):
        self.assertEqual(self.client.get("/api/v1/settings/device-profile").status_code, 401)
        client_headers = self.headers_for("client-a@example.com")
        other_headers = self.headers_for("admin-b@example.com")

        default_profile = self.client.get(
            "/api/v1/settings/device-profile",
            headers=client_headers,
        )
        self.assertEqual(default_profile.status_code, 200, default_profile.text)
        self.assertEqual(default_profile.json()["device_mode"], "desktop")
        self.assertEqual(default_profile.json()["resource_profile"], "16gb")
        self.assertEqual(default_profile.json()["connectivity_mode"], "hybrid")
        self.assertEqual(default_profile.json()["resource_rules"]["max_context_tokens"], 3000)

        updated = self.client.put(
            "/api/v1/settings/device-profile",
            headers=client_headers,
            json={
                "device_mode": "mobile",
                "resource_profile": "8gb",
                "connectivity_mode": "offline",
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        body = updated.json()
        self.assertEqual(body["device_mode"], "mobile")
        self.assertEqual(body["resource_profile"], "8gb")
        self.assertEqual(body["connectivity_mode"], "offline")
        self.assertIn("qwen3:8b", body["resource_rules"]["disabled_local_models"])
        self.assertIn("cloud_model_fallback", body["connectivity_rules"]["blocked"])

        reloaded = self.client.get(
            "/api/v1/settings/device-profile",
            headers=client_headers,
        ).json()
        self.assertEqual(reloaded["device_mode"], "mobile")
        self.assertEqual(reloaded["resource_profile"], "8gb")
        self.assertEqual(reloaded["connectivity_mode"], "offline")

        other_user_default = self.client.get(
            "/api/v1/settings/device-profile",
            headers=other_headers,
        ).json()
        self.assertEqual(other_user_default["device_mode"], "desktop")
        self.assertEqual(other_user_default["resource_profile"], "16gb")
        self.assertEqual(other_user_default["connectivity_mode"], "hybrid")

    def test_app_preferences_are_authenticated_user_scoped_and_persisted(self):
        self.assertEqual(self.client.get("/api/v1/settings/app-preferences").status_code, 401)
        client_headers = self.headers_for("client-a@example.com")
        other_headers = self.headers_for("admin-b@example.com")

        default_preferences = self.client.get(
            "/api/v1/settings/app-preferences",
            headers=client_headers,
        )
        self.assertEqual(default_preferences.status_code, 200, default_preferences.text)
        self.assertEqual(default_preferences.json()["preferences"]["theme"], "System")
        self.assertEqual(default_preferences.json()["preferences"]["notifications"]["calendar"], True)

        updated = self.client.put(
            "/api/v1/settings/app-preferences",
            headers=client_headers,
            json={
                "preferences": {
                    "theme": "Dark",
                    "mode": "Offline",
                    "uiTheme": "Studio",
                    "accentColor": "Rose",
                    "notifications": {"inApp": False, "desktop": True, "email": True, "calendar": False},
                }
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        body = updated.json()["preferences"]
        self.assertEqual(body["theme"], "Dark")
        self.assertEqual(body["mode"], "Offline")
        self.assertEqual(body["uiTheme"], "Studio")
        self.assertEqual(body["accentColor"], "Rose")
        self.assertEqual(body["notifications"]["email"], True)
        self.assertEqual(body["notifications"]["calendar"], False)

        reloaded = self.client.get(
            "/api/v1/settings/app-preferences",
            headers=client_headers,
        ).json()["preferences"]
        self.assertEqual(reloaded["theme"], "Dark")
        self.assertEqual(reloaded["notifications"]["inApp"], False)

        other_user_default = self.client.get(
            "/api/v1/settings/app-preferences",
            headers=other_headers,
        ).json()["preferences"]
        self.assertEqual(other_user_default["theme"], "System")
        self.assertEqual(other_user_default["notifications"]["email"], False)

    def test_history_policy_endpoint_is_tier_scoped(self):
        free = self.client.get(
            "/api/v1/settings/history-policy",
            headers=self.headers_for("client-a@example.com"),
        )
        self.assertEqual(free.status_code, 200, free.text)
        free_body = free.json()
        self.assertEqual(free_body["tier"], "free")
        self.assertEqual(free_body["history_policy"]["raw_chat_history_days"], 7)
        self.assertEqual(free_body["history_policy"]["summary_history_days"], 30)
        self.assertFalse(free_body["history_policy"]["weekly_summary_enabled"])
        self.assertFalse(free_body["history_policy"]["cross_device_history"])
        self.assertEqual(free_body["history_policy"]["max_saved_conversations"], 10)
        self.assertEqual(free_body["ui_rules"]["recent_conversation_limit"], 3)
        self.assertTrue(free_body["memory_policy"]["durable_memory_requires_policy_engine"])

        paid = self.client.get(
            "/api/v1/settings/history-policy",
            headers=self.headers_for("paid-a@example.com"),
        )
        self.assertEqual(paid.status_code, 200, paid.text)
        paid_body = paid.json()
        self.assertEqual(paid_body["tier"], "paid")
        self.assertEqual(paid_body["history_policy"]["raw_chat_history_days"], 30)
        self.assertEqual(paid_body["history_policy"]["summary_history_days"], 365)
        self.assertTrue(paid_body["history_policy"]["weekly_summary_enabled"])
        self.assertTrue(paid_body["history_policy"]["cross_device_history"])
        self.assertEqual(paid_body["history_policy"]["max_saved_conversations"], 100)

    def test_kamal_can_create_local_ceda_reminder_without_calendar_connector(self):
        headers = self.headers_for("client-a@example.com")
        created = self.client.post(
            "/api/v1/ceda/reminders",
            headers=headers,
            json={
                "title": "Reminder from Kamal",
                "due_at": "2026-07-11T23:00:00.000Z",
                "reminder_date": "2026-07-11T23:00:00.000Z",
                "priority": "normal",
                "source": "kamal_voice_command",
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        body = created.json()
        self.assertEqual(body["title"], "Reminder from Kamal")
        self.assertEqual(body["status"], "active")
        self.assertEqual(body["due_at"], "2026-07-11T23:00:00.000Z")
        self.assertTrue(body["context_id"].startswith("CTX-PER-"), body)

        registry = self.client.get("/api/v1/context-os/registry", headers=headers)
        self.assertEqual(registry.status_code, 200, registry.text)
        self.assertTrue(any(item["context_id"] == body["context_id"] and item["type"] == "reminder" for item in registry.json()))

        patched = self.client.patch(
            f"/api/v1/ceda/reminders/{body['id']}",
            headers=headers,
            json={"title": "Updated Kamal reminder", "priority": "high"},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["title"], "Updated Kamal reminder")
        self.assertEqual(patched.json()["priority"], "high")

        deleted = self.client.delete(f"/api/v1/ceda/reminders/{body['id']}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertEqual(deleted.json()["status"], "deleted")

        earlier = self.client.post(
            "/api/v1/ceda/reminders",
            headers=headers,
            json={
                "title": "Earlier calendar reminder",
                "due_at": "2026-07-10T14:00:00.000Z",
                "reminder_date": "2026-07-10T14:00:00.000Z",
                "priority": "high",
                "source": "kamal_voice_command",
            },
        )
        self.assertEqual(earlier.status_code, 200, earlier.text)

        reminders = self.client.get("/api/v1/ceda/reminders", headers=headers)
        self.assertEqual(reminders.status_code, 200, reminders.text)
        items = reminders.json()["items"]
        self.assertFalse(any(item["id"] == body["id"] and item["status"] != "deleted" for item in items))
        ordered_ids = [item["id"] for item in items]
        self.assertIn(earlier.json()["id"], ordered_ids)

        tasks = self.client.get("/api/v1/tasks", headers=headers)
        self.assertEqual(tasks.status_code, 200, tasks.text)
        task_body = tasks.json()
        self.assertIn("items", task_body)
        self.assertIn("counts", task_body)
        self.assertIn("overdue", task_body["rules"])
        self.assertTrue(any(item["id"] == earlier.json()["id"] for item in task_body["items"]))
        self.assertGreaterEqual(task_body["counts"]["all"], 1)
        self.assertGreaterEqual(task_body["counts"]["overdue"], 1)

        overdue_tasks = self.client.get("/api/v1/tasks?scope=overdue", headers=headers)
        self.assertEqual(overdue_tasks.status_code, 200, overdue_tasks.text)
        self.assertTrue(all(item["status"] not in {"completed", "cancelled", "archived"} for item in overdue_tasks.json()["items"]))

        academic_tasks = self.client.get("/api/v1/tasks?category=academic", headers=headers)
        self.assertEqual(academic_tasks.status_code, 200, academic_tasks.text)
        self.assertTrue(all(item["category"] == "academic" for item in academic_tasks.json()["items"]))

        exact_task = self.client.get(f"/api/v1/tasks/{earlier.json()['id']}", headers=headers)
        self.assertEqual(exact_task.status_code, 200, exact_task.text)
        self.assertEqual(exact_task.json()["id"], earlier.json()["id"])
        self.assertEqual(exact_task.json()["status"], "active")

        missing_task = self.client.get("/api/v1/tasks/TASK-NOT-OWNED", headers=headers)
        self.assertEqual(missing_task.status_code, 404)

    def test_orchestration_policy_endpoint_combines_tier_device_memory_upload_and_residency(self):
        client_headers = self.headers_for("client-a@example.com")
        updated = self.client.put(
            "/api/v1/settings/device-profile",
            headers=client_headers,
            json={
                "device_mode": "mobile",
                "resource_profile": "8gb",
                "connectivity_mode": "offline",
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)

        response = self.client.get(
            "/api/v1/settings/orchestration-policy",
            headers=client_headers,
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["tier"], "free")
        self.assertEqual(body["device_profile"]["resource_profile"], "8gb")
        self.assertEqual(body["upload_limits"]["max_file_size_mb"], 10)
        self.assertEqual(body["upload_limits"]["daily_upload_limit"], 3)
        self.assertTrue(body["upload_limits"]["large_documents_available"])
        self.assertTrue(body["upload_limits"].get("temporary_upgrade_bypass"))
        self.assertIn("qwen3:8b", body["model_residency"]["disabled_local_models"])
        self.assertIn("ssd-1b", body["model_residency"]["disabled_local_models"])
        self.assertEqual(body["model_residency"]["deepseek_policy"], "reasoning_only")
        self.assertIn("classes", body["memory_policy"])
        self.assertTrue(any(item["memory_class"] == "sensitive" and not item["allowed"] for item in body["memory_policy"]["classes"]))


if __name__ == "__main__":
    unittest.main()
