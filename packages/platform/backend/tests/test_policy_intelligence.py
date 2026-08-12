from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services.ceda_service import CEDAService


class PolicyIntelligenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory(); self.ceda=CEDAService(Path(self.tmp.name)/"workspace"); self.pie=self.ceda.policy_engine
    def tearDown(self): self.tmp.cleanup()

    def create(self,scope="domain",scope_id="academic",effect="deny",actions=None,user=1):
        return self.pie.create_policy(user,"Test user policy",scope,scope_id,effect,actions or ["create_context"],{"reason":"Explicit test policy"},"User created policy")

    def test_pie_001_policies_are_user_owned_and_isolated(self):
        policy=self.create(); self.assertEqual(policy["source"],"user"); self.assertEqual(self.pie.list_policies(2),[])

    def test_pie_002_evaluation_precedes_durable_context(self):
        self.create(); result=self.ceda.capture(1,"Remember assignment is due July 20","test"); self.assertEqual(result["status"],"rejected"); self.assertTrue(result["policy_decision_id"].startswith("DEC-"))

    def test_pie_003_hierarchical_inheritance_and_conflict_resolution(self):
        global_policy=self.create("global",None,"deny",["publish"]); self.create("domain","social","allow",["publish"])
        decision=self.pie.evaluate(1,"publish",domain="social",destination="LinkedIn",purpose="Publish a post")
        self.assertEqual(decision["outcome"],"deny"); self.assertEqual(decision["winning_policy"]["policy_id"],global_policy["policy_id"])

    def test_pie_004_sensitive_operation_requires_explicit_consent(self):
        decision=self.pie.evaluate(1,"publish",domain="immigration",sensitivity="sensitive",destination="LinkedIn",purpose="Share immigration context")
        self.assertTrue(decision["requires_consent"]); self.assertFalse(decision["allowed"])
        approved=self.pie.decide_consent(1,decision["consent_id"],True,"User confirmed"); self.assertTrue(approved["allowed"])

    def test_pie_005_immigration_context_is_sensitive_and_governed(self):
        decision=self.pie.evaluate(1,"send_to_cloud_model",domain="immigration",sensitivity="sensitive",model="cloud",purpose="Analyze I-20")
        self.assertEqual(decision["outcome"],"ask"); self.assertIn("Sensitive",decision["explanation"])

    def test_pie_006_learning_policy_requires_approved_user_choice(self):
        event=self.ceda.observe_event(1,"UserMessageObserved",{"text":"Never include GPA on LinkedIn."},"kamal",event_id="preference")
        self.assertEqual(self.pie.list_policies(1),[])
        self.ceda.decide(1,event["candidate"]["id"],True)
        policies=self.pie.list_policies(1); self.assertEqual(len(policies),1); self.assertEqual(policies[0]["source"],"ceda_user_approval"); self.assertEqual(policies[0]["effect"],"deny")

    def test_pie_007_decision_is_explainable_and_auditable(self):
        decision=self.pie.evaluate(1,"read_context",domain="academic",model="local",purpose="Build study plan")
        explanation=self.pie.explain_decision(1,decision["decision_id"]); self.assertIn("Highest-priority policy",explanation["explanation"]); self.assertEqual(explanation["purpose"],"Build study plan"); self.assertTrue(self.pie.decisions(1))

    def test_pie_008_policy_version_disable_and_restore(self):
        policy=self.create(); updated=self.pie.update_policy(1,policy["policy_id"],{"effect":"ask"},"User changed consent mode"); self.assertEqual(updated["version"],2)
        disabled=self.pie.disable_policy(1,policy["policy_id"],"User disabled"); self.assertFalse(disabled["enabled"])
        restored=self.pie.restore_policy(1,policy["policy_id"],"User restored"); self.assertTrue(restored["enabled"]); self.assertEqual(restored["version"],4); self.assertEqual(len(restored["versions"]),4)

    def test_pie_009_ai_model_access_is_governed(self):
        local=self.pie.evaluate(1,"send_to_model",model="local",purpose="Local answer"); cloud=self.pie.evaluate(1,"send_to_model",model="cloud",purpose="Cloud answer")
        self.assertTrue(local["allowed"]); self.assertTrue(cloud["requires_consent"])

    def test_pie_010_connector_is_individually_governed(self):
        policy=self.create("connector","linkedin","deny",["connector_access"])
        linkedin=self.pie.evaluate(1,"connector_access",connector="linkedin",purpose="Publish post"); gmail=self.pie.evaluate(1,"connector_access",connector="gmail",purpose="Send email")
        self.assertEqual(linkedin["winning_policy"]["policy_id"],policy["policy_id"]); self.assertEqual(linkedin["outcome"],"deny"); self.assertEqual(gmail["outcome"],"ask")


if __name__=="__main__": unittest.main()
