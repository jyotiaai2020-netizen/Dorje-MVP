import json
import logging
import re
from collections.abc import AsyncIterator

from langchain_core.messages import HumanMessage
from langchain_ollama import ChatOllama

from app.core.config import settings
from app.orchestration.context import ContextManager
from app.orchestration.memory import MemoryManager
from app.orchestration.models import AgentName, ExecutionPlan, Intent, OrchestratedResult
from app.orchestration.registry import AgentRegistry
from app.orchestration.router import IntentRouter
from app.orchestration.validator import ResponseValidator
from app.schemas.dorje_ai import ChatMessage, StructuredTable, UploadedFileReference
from app.orchestration.utils import chunk_text

logger = logging.getLogger("lotus.ai.orchestrator")

PLANNER_PROMPT = """You are DorjeAI's workflow planner. You never answer the user.
Create a compact execution plan for specialist agents. Prefer deterministic_data for
statistics, tables, charts, Excel, PDF, and conversions. Use qwen_vision only for visual
evidence, tiny_sd_image only for image generation, and qwen_content for language output.
Return only JSON matching: {"intent":"chat","required_agents":["qwen_content"],
"steps":[{"order":1,"agent":"qwen_content","action":"...","expected_output":"..."}],
"optimized_prompt":"...","validation_rules":["..."],"fallback_plan":"...",
"requires_confirmation":false}. Never include hidden reasoning."""

CONTENT_PROMPT = """You are DorjeAI's content specialist. Execute the planner's exact
instructions using only supplied context and specialist observations. Do not perform a new
workflow plan. Do not invent file contents or numeric data. Produce a complete professional
answer with clear headings, valid Markdown, and LaTeX for formulas when useful. Never expose
internal model names, hidden reasoning, or orchestration JSON."""

VISION_PROMPT = """Return structured observations from the supplied visual evidence.
Include visible text/OCR, objects, relationships, chart labels and values, uncertainty, and
anything relevant to the requested task. Do not write a final report. Do not invent details."""


class DorjeOrchestrator:
    def __init__(self) -> None:
        base = {"base_url": settings.OLLAMA_BASE_URL}
        lazy_keep_alive = f"{settings.MODEL_IDLE_TIMEOUT_SECONDS}s"
        self.planner = ChatOllama(model=settings.OLLAMA_REASONING_MODEL, reasoning=True, temperature=0.1, num_predict=settings.OLLAMA_REASONING_NUM_PREDICT, keep_alive=settings.OLLAMA_KEEP_ALIVE, **base)
        self.content = ChatOllama(model=settings.OLLAMA_FAST_MODEL or settings.OLLAMA_CHAT_MODEL, reasoning=settings.OLLAMA_FAST_THINKING, temperature=0.3, num_ctx=settings.OLLAMA_FAST_NUM_CTX, num_predict=settings.OLLAMA_FAST_NUM_PREDICT, keep_alive=lazy_keep_alive, **base)
        self.deep_content = ChatOllama(model=settings.OLLAMA_DEEP_MODEL or settings.OLLAMA_CHAT_MODEL, reasoning=settings.OLLAMA_DEEP_THINKING, temperature=0.2, num_ctx=settings.OLLAMA_DEEP_NUM_CTX, num_predict=settings.OLLAMA_DEEP_NUM_PREDICT, keep_alive=lazy_keep_alive, **base)
        self.vision = ChatOllama(model=settings.OLLAMA_VISION_MODEL, reasoning=False, temperature=0.2, num_predict=settings.OLLAMA_VISION_NUM_PREDICT, keep_alive=lazy_keep_alive, **base)
        self.router = IntentRouter(); self.context = ContextManager(); self.memory = MemoryManager(); self.validator = ResponseValidator(); self.registry = AgentRegistry()

    async def plan(self, message: str, files: list[UploadedFileReference]) -> ExecutionPlan:
        fallback = self.router.fallback_plan(message, files)
        inventory = ", ".join(f"{item.name} ({item.type})" for item in files) or "None"
        prompt = f"{PLANNER_PROMPT}\n\nDetected intent: {fallback.intent.value}\nFiles: {inventory}\nUser request: {message[:4000]}\nJSON:"
        try:
            response = chunk_text((await self.planner.ainvoke(prompt)).content)
            match = re.search(r"\{[\s\S]*\}", response)
            if not match:
                return fallback
            plan = ExecutionPlan.model_validate(json.loads(match.group(0)))
            plan.intent = fallback.intent
            plan.required_agents = self._safe_agents(plan.required_agents, fallback.required_agents)
            if not plan.optimized_prompt.strip():
                plan.optimized_prompt = fallback.optimized_prompt
            return plan
        except Exception as exc:
            logger.warning("planner_fallback error=%s", exc)
            return fallback

    async def execute(
        self,
        message: str,
        context: str = "",
        history: list[ChatMessage] | None = None,
        files: list[UploadedFileReference] | None = None,
        mode: str = "Fast Chat",
    ) -> OrchestratedResult:
        history = history or []; files = files or []
        mode_key = self._mode_key(mode)
        fast_chat = mode_key == "fast chat"
        deep_analysis = mode_key == "deep analysis"
        fallback_plan = self.router.fallback_plan(message, files)
        planner_needed = self._planner_needed(fallback_plan.intent, files)
        plan = await self.plan(message, files) if planner_needed and not (fast_chat and self._simple_fast_intent(fallback_plan.intent, files)) else fallback_plan
        visual_observations = await self._observe_visuals(message, files, plan)
        if deep_analysis:
            prompt = self._qwen_raw_prompt(message, context, history, files, visual_observations)
            validation_plan = plan.model_copy(update={"intent": Intent.CHAT})
            model_client = self.deep_content
        elif fast_chat:
            prompt = self._fast_prompt(message, context, history, files, visual_observations)
            validation_plan = plan.model_copy(update={"intent": Intent.CHAT})
            model_client = self.content
        else:
            prompt = self._content_prompt(message, context, history, files, plan, visual_observations)
            validation_plan = plan
            model_client = self.content
        attempts = 1
        try:
            content = chunk_text((await model_client.ainvoke(prompt)).content).strip()
        except Exception as exc:
            logger.warning("content_engine_failed mode=%s error=%s", mode_key, exc)
            content = self._fallback(message, files)
        validation = self.validator.validate(content, validation_plan, files, message)
        if not validation.valid and not (fast_chat or deep_analysis):
            attempts = 2
            correction = f"{prompt}\n\nVALIDATION FAILED: {'; '.join(validation.errors)}. Regenerate once and correct every failure."
            try:
                content = chunk_text((await model_client.ainvoke(correction)).content).strip()
                validation = self.validator.validate(content, validation_plan, files, message)
            except Exception as exc:
                logger.warning("validation_retry_failed error=%s", exc)
        return OrchestratedResult(content=content or self._fallback(message, files), plan=plan, validation=validation, attempts=attempts)

    async def stream(self, message: str, context: str = "", history: list[ChatMessage] | None = None, files: list[UploadedFileReference] | None = None, mode: str = "Fast Chat") -> AsyncIterator[str]:
        result = await self.execute(message, context, history, files, mode)
        for start in range(0, len(result.content), 96):
            yield result.content[start:start + 96]

    async def optimize_image_prompt(self, message: str, context: str = "", preferences: list[str] | None = None) -> str:
        preferences = preferences or []
        instruction = (
            "You are the DorjeAI planner preparing instructions for Tiny-SD. Return only one detailed diffusion prompt. "
            "Preserve the exact subject and requested text, infer composition, environment, lighting, camera, materials, "
            "color palette and professional quality. Do not answer the user and do not add headings.\n\n"
            f"Request: {message[:2000]}\nContext: {context[:1500]}\nPreferences: {', '.join(preferences[:10]) or 'None'}"
        )
        try:
            prompt = chunk_text((await self.planner.ainvoke(instruction)).content).strip().strip('"')
            if len(prompt) >= 40:
                return prompt
        except Exception as exc:
            logger.warning("image_prompt_planner_fallback error=%s", exc)
        return f"Professional high-quality image of {message[:800]}, balanced composition, detailed textures, natural lighting, accurate colors, sharp focus"

    async def structure_table(self, source: str) -> StructuredTable:
        """Planner-guided table extraction with deterministic shape validation."""
        plan = await self.plan(f"Convert supplied content into a structured table without inventing facts: {source[:1500]}", [])
        prompt = (
            f"{CONTENT_PROMPT}\nPlanner instruction: {plan.optimized_prompt}\n"
            'Return only JSON: {"title":"...","columns":["..."],"rows":[["..."]],"explanation":"..."}. '
            "Preserve source values exactly. Every row must match the column count.\n\nSOURCE:\n"
            f"{source[:50_000]}"
        )
        try:
            raw = chunk_text((await self.content.ainvoke(prompt)).content).strip()
            match = re.search(r"\{[\s\S]*\}", raw)
            if not match:
                raise ValueError("No table JSON")
            table = StructuredTable.model_validate(json.loads(match.group(0)))
            if not table.columns or not table.rows:
                raise ValueError("Empty table")
            width = len(table.columns)
            table.rows = [(row + [""] * width)[:width] for row in table.rows]
            table.model_used = "DorjeAI Orchestrator"
            table.source_columns = list(table.columns)
            return table
        except Exception as exc:
            logger.warning("table_engine_fallback error=%s", exc)
            lines = [re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", line).strip() for line in source.splitlines() if line.strip()]
            rows = []
            for index, line in enumerate(lines[:200], start=1):
                key, separator, value = line.partition(":")
                rows.append([str(index), key.strip(), value.strip() if separator else ""])
            return StructuredTable(title="DorjeAI Data", columns=["Row", "Item", "Details"], rows=rows, source_columns=["Row", "Item", "Details"], explanation="Deterministic fallback extraction", model_used="DorjeAI Orchestrator")

    async def _observe_visuals(self, message: str, files: list[UploadedFileReference], plan: ExecutionPlan) -> str:
        if AgentName.VISION not in plan.required_agents:
            return "None"
        images: list[str] = []
        for item in files:
            if item.type.startswith("image/"):
                images.append(item.content)
            elif item.type == "video/mp4":
                try:
                    images.extend(json.loads(item.content).get("frames", []))
                except (json.JSONDecodeError, AttributeError):
                    pass
        if not images:
            return "None"
        content = [{"type": "text", "text": f"{VISION_PROMPT}\nTask: {message[:2000]}"}, *[{"type": "image_url", "image_url": image} for image in images[:4]]]
        try:
            return chunk_text((await self.vision.ainvoke([HumanMessage(content=content)])).content).strip()
        except Exception as exc:
            logger.warning("vision_specialist_failed error=%s", exc)
            return "Visual specialist unavailable; do not claim visual evidence was analyzed."

    @staticmethod
    def _mode_key(mode: str) -> str:
        return mode.casefold().replace("_", " ").replace("-", " ").strip()

    @staticmethod
    def _simple_fast_intent(intent: Intent, files: list[UploadedFileReference]) -> bool:
        return not files and intent in {
            Intent.CHAT,
            Intent.SOFTWARE_TUTORIAL,
            Intent.STATISTICAL_GUIDANCE,
            Intent.STATISTICAL_INTERPRETATION,
        }

    @staticmethod
    def _planner_needed(intent: Intent, files: list[UploadedFileReference]) -> bool:
        return bool(files) or intent in {
            Intent.IMAGE,
            Intent.STATISTICS,
            Intent.FILE,
            Intent.OCR,
            Intent.RAG,
            Intent.EMAIL,
            Intent.SOCIAL,
            Intent.REPORT,
            Intent.PRESENTATION,
            Intent.EXPORT,
            Intent.NAVIGATION,
        }

    def _fast_prompt(self, message: str, context: str, history: list[ChatMessage], files: list[UploadedFileReference], observations: str) -> str:
        sections = [
            "Answer the current request directly and concisely. Use simple language. "
            "Do not use a fixed template. Do not add unrelated sections, fabricated data, or calculations. "
            "Do not reveal hidden reasoning or orchestration details."
        ]
        if context.strip():
            sections.append(f"Clearly relevant context only:\n{context[:1800]}")
        file_text = self.context.file_text(message, files)
        if file_text != "No files supplied.":
            sections.append(f"Files:\n{file_text}")
        if observations != "None":
            sections.append(f"Visual observations:\n{observations}")
        history_text = self.context.history(history[-2:])
        if history_text != "None":
            sections.append(f"Recent conversation:\n{history_text}")
        sections.append(f"User request:\n{message}")
        return "\n\n".join(sections)

    def _content_prompt(self, message: str, context: str, history: list[ChatMessage], files: list[UploadedFileReference], plan: ExecutionPlan, observations: str) -> str:
        return (
            f"{CONTENT_PROMPT}\n\nWORKFLOW INTENT: {plan.intent.value}\nPLANNER INSTRUCTIONS:\n{plan.optimized_prompt}"
            f"\n\nVALIDATION RULES:\n- " + "\n- ".join(plan.validation_rules)
            + f"\n\nWORKING CONTEXT:\n{context[:3000] or 'None'}\n\nFILES:\n{self.context.file_text(message, files)}"
            f"\n\nVISION OBSERVATIONS:\n{observations}\n\nRECENT HISTORY:\n{self.context.history(history)}"
            f"\n\nORIGINAL USER REQUEST:\n{message[:4000]}\n\nFINAL RESPONSE:"
        )

    def _qwen_raw_prompt(self, message: str, context: str, history: list[ChatMessage], files: list[UploadedFileReference], observations: str) -> str:
        sections = []
        if context.strip():
            sections.append(f"Context:\n{context[:6000]}")
        file_text = self.context.file_text(message, files)
        if file_text != "No files supplied.":
            sections.append(f"Files:\n{file_text}")
        if observations != "None":
            sections.append(f"Visual observations:\n{observations}")
        history_text = self.context.history(history)
        if history_text != "None":
            sections.append(f"Recent conversation:\n{history_text}")
        sections.append(
            "Answer the current request comprehensively and with sufficient depth. "
            "Develop all material steps, explanations, assumptions, examples, limitations, and recommendations relevant to the request. "
            "Preserve a natural Qwen-style final answer. Do not replace the requested answer with a generic template. "
            "Do not summarize or shorten the final answer unless the user asks for brevity. "
            "Do not add unrelated sections, fabricated data, calculations, formulas, or chart recommendations unless the user asks for them. "
            "Do not reveal hidden reasoning or private chain-of-thought.\n\n"
            f"User request:\n{message}"
        )
        return "\n\n".join(sections)

    @staticmethod
    def _safe_agents(requested: list[AgentName], fallback: list[AgentName]) -> list[AgentName]:
        allowed = set(AgentName)
        agents = [agent for agent in requested if agent in allowed]
        return list(dict.fromkeys([AgentName.PLANNER, *fallback, *agents]))

    @staticmethod
    def _fallback(message: str, files: list[UploadedFileReference]) -> str:
        attachment_note = f" I received {len(files)} attached file(s)." if files else ""
        return f"DorjeAI could not complete the planned workflow locally.{attachment_note} Your request was: “{message[:500]}”. Verify that Ollama and the required specialist model are available, then try again."
