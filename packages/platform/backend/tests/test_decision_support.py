import unittest

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


class DecisionSupportAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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
            org_a = Organization(name="Decision Tenant A")
            org_b = Organization(name="Decision Tenant B")
            db.add_all([org_a, org_b])
            db.flush()
            user_a = User(email="decision-a@example.com", full_name="Decision A", password_hash=hash_password("pw"), organization_id=org_a.id, role=Role.CLIENT_USER.value)
            user_b = User(email="decision-b@example.com", full_name="Decision B", password_hash=hash_password("pw"), organization_id=org_b.id, role=Role.CLIENT_USER.value)
            db.add_all([user_a, user_b])
            db.commit()
            self.user_ids = {user_a.email: user_a.id, user_b.email: user_b.id}

    def tearDown(self):
        app.dependency_overrides.clear()

    def headers_for(self, email: str) -> dict[str, str]:
        token = create_access_token({"sub": email, "user_id": self.user_ids[email]})
        return {"Authorization": f"Bearer {token}"}

    def create_scenario(self) -> str:
        response = self.client.post(
            "/api/v1/decision-support/scenarios",
            headers=self.headers_for("decision-a@example.com"),
            json={
                "title": "Study time allocation",
                "domain": "academic",
                "workspace_id": "academic",
                "purpose": "Compare study effort scenarios",
                "assumptions": {"study_hours": 8, "assignment_weight": 20},
                "objective": {"goal": "maximize grade readiness"},
            },
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertTrue(payload["allowed"])
        return payload["scenario"]["id"]

    def test_create_scenario_records_policy_and_history(self):
        scenario_id = self.create_scenario()
        history = self.client.get("/api/v1/decision-support/history", headers=self.headers_for("decision-a@example.com"))
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json()["scenarios"][0]["id"], scenario_id)
        self.assertEqual(history.json()["scenarios"][0]["domain"], "academic")

    def test_what_if_compares_changed_assumptions(self):
        scenario_id = self.create_scenario()
        response = self.client.post(
            "/api/v1/decision-support/what-if",
            headers=self.headers_for("decision-a@example.com"),
            json={"scenario_id": scenario_id, "changes": {"study_hours": 10}},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["estimated_direction"], "improves")
        self.assertTrue(any(item["field"] == "study_hours" and item["changed"] for item in payload["comparison"]))

    def test_monte_carlo_simulation_returns_distribution_metrics(self):
        scenario_id = self.create_scenario()
        response = self.client.post(
            "/api/v1/decision-support/simulate",
            headers=self.headers_for("decision-a@example.com"),
            json={
                "scenario_id": scenario_id,
                "inputs": {
                    "trials": 500,
                    "seed": 7,
                    "variables": [{"name": "demand", "distribution": "uniform", "min": 80, "max": 120}],
                    "formula": {"base": 10, "coefficients": {"demand": 1.5}},
                    "risk_threshold": 150,
                    "risk_direction": "below",
                },
            },
        )
        self.assertEqual(response.status_code, 200)
        result = response.json()["simulation"]["result"]
        self.assertEqual(result["trials"], 500)
        self.assertLess(result["p10"], result["p90"])
        self.assertIsNotNone(result["risk_probability"])

    def test_optimization_selects_options_within_budget(self):
        response = self.client.post(
            "/api/v1/decision-support/optimize",
            headers=self.headers_for("decision-a@example.com"),
            json={
                "inputs": {
                    "budget": 5,
                    "options": [
                        {"id": "readings", "cost": 2, "benefit": 7},
                        {"id": "practice", "cost": 3, "benefit": 8},
                        {"id": "extra-project", "cost": 5, "benefit": 5},
                    ],
                }
            },
        )
        self.assertEqual(response.status_code, 200)
        optimization = response.json()["optimization"]
        self.assertLessEqual(optimization["total_cost"], 5)
        selected_ids = {item["id"] for item in optimization["selected_options"]}
        self.assertEqual(selected_ids, {"readings", "practice"})

    def test_recommendation_returns_top_three_and_requires_confirmation(self):
        response = self.client.post(
            "/api/v1/decision-support/recommend",
            headers=self.headers_for("decision-a@example.com"),
            json={
                "options": [
                    {"id": "assignment", "impact": 0.9, "urgency": 0.9, "confidence": 0.8, "effort": 0.4, "risk": 0.2},
                    {"id": "gym", "impact": 0.5, "urgency": 0.3, "confidence": 0.9, "effort": 0.2, "risk": 0.1},
                    {"id": "networking", "impact": 0.7, "urgency": 0.4, "confidence": 0.6, "effort": 0.5, "risk": 0.2},
                    {"id": "cleanup", "impact": 0.2, "urgency": 0.2, "confidence": 0.9, "effort": 0.1, "risk": 0.1},
                ]
            },
        )
        self.assertEqual(response.status_code, 200)
        recommendation = response.json()["recommendation"]["recommendation"]
        self.assertEqual(len(recommendation["top_recommendations"]), 3)
        self.assertTrue(recommendation["requires_confirmation"])
        self.assertEqual(recommendation["top_recommendations"][0]["id"], "assignment")

    def test_tenant_isolation_blocks_other_user_scenario(self):
        scenario_id = self.create_scenario()
        response = self.client.post(
            "/api/v1/decision-support/what-if",
            headers=self.headers_for("decision-b@example.com"),
            json={"scenario_id": scenario_id, "changes": {"study_hours": 30}},
        )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
