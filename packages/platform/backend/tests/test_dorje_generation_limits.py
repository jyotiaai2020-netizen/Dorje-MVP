import asyncio
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.core.config import settings
from app.api.v1.dorje_ai import chat_mode_intent, dorje_route_trace, is_standalone_deep_tutorial, normalize_chat_mode, should_run_ceda_learning
from app.orchestration.engine import DorjeOrchestrator
from app.orchestration.models import Intent
from app.schemas.dorje_ai import DorjeChatRequest


class FakeLLM:
    def __init__(self, response: str, label: str, calls: list[str]):
        self.response = response
        self.label = label
        self.calls = calls

    async def ainvoke(self, prompt: str):
        self.calls.append(self.label)
        return SimpleNamespace(content=self.response)


class DorjeGenerationLimitTests(unittest.TestCase):
    def test_fast_chat_is_bounded_below_deep_analysis_budget(self):
        """Fast Chat should stay concise while Deep Analysis has the larger runway."""
        self.assertEqual(settings.OLLAMA_FAST_NUM_CTX, 4096)
        self.assertEqual(settings.OLLAMA_FAST_NUM_PREDICT, 512)
        self.assertFalse(settings.OLLAMA_FAST_THINKING)
        self.assertEqual(settings.OLLAMA_DEEP_NUM_CTX, 8192)
        self.assertEqual(settings.OLLAMA_DEEP_NUM_PREDICT, 3072)
        self.assertTrue(settings.OLLAMA_DEEP_THINKING)
        self.assertLess(settings.OLLAMA_FAST_NUM_PREDICT, settings.OLLAMA_DEEP_NUM_PREDICT)

    def test_deep_analysis_raw_qwen_prompt_preserves_full_user_message(self):
        orchestrator = DorjeOrchestrator()
        long_marker = "UNTRUNCATED_DEEP_ANALYSIS_END"
        message = "Explain local multimodal routing. " + ("detail " * 2000) + long_marker
        prompt = orchestrator._qwen_raw_prompt(message, "", [], [], "None")
        self.assertIn(long_marker, prompt)
        self.assertIn("Answer the current request comprehensively and with sufficient depth", prompt)
        self.assertIn("Do not replace the requested answer with a generic template", prompt)
        self.assertIn("Do not summarize or shorten the final answer unless the user asks for brevity", prompt)
        self.assertNotIn("DEEP ANALYSIS RESPONSE", prompt)
        self.assertNotIn("PLANNER INSTRUCTIONS", prompt)
        self.assertNotIn("WORKFLOW INTENT", prompt)
        self.assertNotIn("Problem Understanding", prompt)
        self.assertNotIn("Calculation Table", prompt)

    def test_deep_analysis_routes_to_memory_intent_and_learning_gate(self):
        request = DorjeChatRequest(message="Compare local multimodal options.", mode="Deep Analysis")
        self.assertEqual(chat_mode_intent(request), "deep_analysis")
        self.assertTrue(should_run_ceda_learning(request, "Use Gemma locally and keep cloud fallback optional."))


    def test_invalid_mode_is_rejected_instead_of_silent_fallback(self):
        with self.assertRaises(HTTPException) as ctx:
            normalize_chat_mode("Statistic Deep-ish")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_deep_analysis_jasp_prompt_is_software_tutorial_not_statistics(self):
        request = DorjeChatRequest(message="Give me JASP steps to perform correlation.", mode="Deep Analysis")
        orchestrator = DorjeOrchestrator()
        self.assertEqual(orchestrator.router.detect(request.message, []), Intent.SOFTWARE_TUTORIAL)
        self.assertEqual(chat_mode_intent(request), "deep_analysis")
        self.assertTrue(is_standalone_deep_tutorial(request))

    def test_route_trace_reports_deep_analysis_route_without_private_prompt(self):
        request = DorjeChatRequest(message="Give me JASP steps to perform correlation.", mode="Deep Analysis", conversation_id="conv-1")
        trace = dorje_route_trace(
            request_id="req-1",
            request=request,
            intent="software_tutorial",
            route="qwen_deep_analysis",
            model="qwen3:8b",
            context_tokens=0,
            output_token_budget=3072,
        )
        self.assertEqual(trace["selected_mode_ui"], "Deep Analysis")
        self.assertEqual(trace["mode_received_backend"], "Deep Analysis")
        self.assertEqual(trace["intent_selected"], "software_tutorial")
        self.assertEqual(trace["route_selected"], "qwen_deep_analysis")
        self.assertEqual(trace["output_token_budget"], settings.OLLAMA_DEEP_NUM_PREDICT)
        self.assertNotIn("message", trace)
        self.assertNotIn("prompt", trace)

    def test_deep_analysis_uses_deep_qwen_client_and_preserves_tutorial_shape(self):
        async def run_case():
            calls: list[str] = []
            orchestrator = DorjeOrchestrator()
            orchestrator.deep_content = FakeLLM(
                "Open JASP, import your data, confirm measurement levels, choose Regression > Correlation Matrix, select Pearson or Spearman, handle missing values, read rho and p-value, then report responsibly.",
                "deep",
                calls,
            )
            orchestrator.content = FakeLLM("Problem Understanding\nFormula\nCalculation Table", "fast", calls)
            result = await orchestrator.execute("Give me JASP steps to perform correlation.", mode="Deep Analysis")
            self.assertEqual(calls, ["deep"])
            self.assertEqual(result.plan.intent, Intent.SOFTWARE_TUTORIAL)
            self.assertIn("Open JASP", result.content)
            self.assertNotIn("Calculation Table", result.content)

        asyncio.run(run_case())


    def test_fast_simple_request_skips_planner_and_uses_concise_prompt(self):
        async def run_case():
            calls: list[str] = []
            orchestrator = DorjeOrchestrator()
            orchestrator.planner = FakeLLM('{"intent":"chat"}', "planner", calls)
            orchestrator.content = FakeLLM("A correlation measures how two variables move together.", "fast", calls)
            result = await orchestrator.execute("Explain Pearson correlation.", mode="Fast Chat")
            self.assertEqual(calls, ["fast"])
            self.assertEqual(result.attempts, 1)
            self.assertEqual(result.plan.intent, Intent.CHAT)

        asyncio.run(run_case())

    def test_deep_simple_request_skips_planner_and_uses_deep_client(self):
        async def run_case():
            calls: list[str] = []
            orchestrator = DorjeOrchestrator()
            orchestrator.planner = FakeLLM('{"intent":"statistics"}', "planner", calls)
            orchestrator.deep_content = FakeLLM("Detailed JASP operating steps without a forced statistics template.", "deep", calls)
            result = await orchestrator.execute("Give me JASP steps to perform correlation.", mode="Deep Analysis")
            self.assertEqual(calls, ["deep"])
            self.assertEqual(result.attempts, 1)
            self.assertEqual(result.plan.intent, Intent.SOFTWARE_TUTORIAL)

        asyncio.run(run_case())

    def test_fast_and_deep_do_not_rewrite_after_validator_failure(self):
        async def run_case(mode: str, client_name: str):
            calls: list[str] = []
            orchestrator = DorjeOrchestrator()
            failing = FakeLLM("Too short", client_name, calls)
            if mode == "Deep Analysis":
                orchestrator.deep_content = failing
            else:
                orchestrator.content = failing
            result = await orchestrator.execute("Explain correlation.", mode=mode)
            self.assertEqual(calls, [client_name])
            self.assertEqual(result.attempts, 1)
            self.assertFalse(result.validation.valid)

        asyncio.run(run_case("Fast Chat", "fast"))
        asyncio.run(run_case("Deep Analysis", "deep"))

    def test_ordinary_fast_chat_does_not_create_durable_memory_candidate(self):
        request = DorjeChatRequest(message="Explain probability distributions.", mode="Fast Chat")
        self.assertFalse(should_run_ceda_learning(request, "A probability distribution describes likely outcomes."))


if __name__ == "__main__":
    unittest.main()
