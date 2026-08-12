import re

from app.orchestration.models import AgentName, ExecutionPlan, Intent, WorkflowStep
from app.schemas.dorje_ai import UploadedFileReference


TUTORIAL_PATTERN = re.compile(
    r"\b(how to|steps to|show me how|guide me|instructions for|where do i click|walk me through|tutorial)\b"
    r"|\b(in|using)\s+(jasp|excel|spss|r|python|jamovi|stata|power bi|tableau)\b",
    re.IGNORECASE,
)

STATISTICS_CALCULATION_PATTERN = re.compile(
    r"\b(calculate|compute|run|perform|analy[sz]e|test|estimate|model|fit|create).{0,90}\b"
    r"(correlation|regression|anova|t-?test|chi-?square|pca|histogram|scatter|boxplot|heatmap|pareto|chart|graph)\b"
    r"|\b(attached data|dataset|source rows|csv|xlsx|spreadsheet)\b",
    re.IGNORECASE,
)

STATISTICS_TOPIC_PATTERN = re.compile(
    r"\b(statistics?|regression|correlation|anova|probability|histogram|scatter|boxplot|heatmap|pareto|pca|chart|graph)\b",
    re.IGNORECASE,
)

STATISTICAL_INTERPRETATION_PATTERN = re.compile(
    r"\b(interpret|read|explain|understand).{0,90}\b(correlation table|jasp table|output|results|p-?value|confidence interval|coefficient)\b"
    r"|\bthis\s+jasp\s+correlation\s+table\b",
    re.IGNORECASE,
)

STATISTICAL_GUIDANCE_PATTERN = re.compile(
    r"\b(which|what)\b.{0,80}\b(correlation method|statistical method|test)\b"
    r"|\bshould\s+i\s+choose\b.{0,80}\b(pearson|spearman|kendall|correlation|anova|t-?test)\b",
    re.IGNORECASE,
)

INTENT_PATTERNS: list[tuple[Intent, str]] = [
    (Intent.IMAGE, r"\b(generate|create|draw|render|design).{0,80}\b(image|picture|illustration|logo|poster)\b"),
    (Intent.REPORT, r"\b(report|executive brief|whitepaper|assessment)\b"),
    (Intent.PRESENTATION, r"\b(presentation|slide deck|powerpoint|pptx)\b"),
    (Intent.CODE, r"\b(code|python|typescript|javascript|sql|debug|function|api)\b"),
    (Intent.EMAIL, r"\b(email|mail|reply|subject line)\b"),
    (Intent.SOCIAL, r"\b(linkedin|social post|instagram|facebook|caption)\b"),
    (Intent.EXPORT, r"\b(export|download|pdf|docx|xlsx|csv)\b"),
    (Intent.SEARCH, r"\b(search|find|look up)\b"),
    (Intent.NAVIGATION, r"\b(open|navigate|go to|dashboard|settings|connectors)\b"),
]


class IntentRouter:
    def detect(self, message: str, files: list[UploadedFileReference]) -> Intent:
        lowered = message.lower()
        if any(item.type.startswith("image/") or item.type == "video/mp4" for item in files):
            return Intent.OCR if re.search(r"\b(ocr|read|extract text)\b", lowered) else Intent.FILE
        if files:
            return Intent.RAG if re.search(r"\b(according to|from the file|document|attachment)\b", lowered) else Intent.FILE
        if TUTORIAL_PATTERN.search(lowered):
            return Intent.SOFTWARE_TUTORIAL
        if STATISTICAL_INTERPRETATION_PATTERN.search(lowered):
            return Intent.STATISTICAL_INTERPRETATION
        if STATISTICAL_GUIDANCE_PATTERN.search(lowered):
            return Intent.STATISTICAL_GUIDANCE
        labeled_values = re.findall(r"(?:^|\n)\s*[^\n:]{1,80}:\s*-?\d+(?:\.\d+)?\s*(?=$|\n)", message)
        if len(labeled_values) >= 2:
            return Intent.STATISTICS
        if STATISTICS_CALCULATION_PATTERN.search(lowered):
            return Intent.STATISTICS
        for intent, pattern in INTENT_PATTERNS:
            if re.search(pattern, lowered, re.IGNORECASE):
                return intent
        if STATISTICS_TOPIC_PATTERN.search(lowered):
            return Intent.CHAT
        return Intent.CHAT

    def fallback_plan(self, message: str, files: list[UploadedFileReference]) -> ExecutionPlan:
        intent = self.detect(message, files)
        agents: list[AgentName] = [AgentName.PLANNER]
        if intent in {Intent.FILE, Intent.OCR} and any(item.type.startswith("image/") or item.type == "video/mp4" for item in files):
            agents.append(AgentName.VISION)
        if intent == Intent.IMAGE:
            agents.append(AgentName.IMAGE)
        elif intent == Intent.STATISTICS:
            agents.extend([AgentName.DETERMINISTIC_DATA, AgentName.CONTENT])
        elif intent not in {Intent.NAVIGATION, Intent.EXPORT}:
            agents.append(AgentName.CONTENT)
        steps = [
            WorkflowStep(order=index + 1, agent=agent, action=self._action(agent, intent), expected_output=self._output(agent))
            for index, agent in enumerate(agents)
        ]
        rules = ["answer must be complete", "do not claim unavailable evidence was used"]
        if files:
            rules.append("reference supplied files and never claim they are unavailable")
        if intent == Intent.STATISTICS:
            rules.extend(["never invent numeric values", "chart values must originate from validated user data"])
        if intent == Intent.SOFTWARE_TUTORIAL:
            rules.extend(["provide operating steps for the named software", "do not force a statistics calculation template without supplied data"])
        if intent == Intent.STATISTICAL_INTERPRETATION:
            rules.extend(["interpret supplied statistical output without inventing missing source data", "do not force a calculation workflow unless asked"])
        if intent == Intent.STATISTICAL_GUIDANCE:
            rules.extend(["explain method choice criteria and assumptions", "do not fabricate a dataset or calculation table"])
        return ExecutionPlan(
            intent=intent,
            required_agents=agents,
            steps=steps,
            optimized_prompt=message,
            validation_rules=rules,
            requires_confirmation=intent in {Intent.EMAIL, Intent.EXPORT, Intent.NAVIGATION},
        )

    @staticmethod
    def _action(agent: AgentName, intent: Intent) -> str:
        actions = {
            AgentName.PLANNER: f"plan the {intent.value} workflow",
            AgentName.CONTENT: "produce the requested language output from the optimized instructions",
            AgentName.VISION: "return structured observations from attached visual evidence",
            AgentName.IMAGE: "generate an image from an optimized visual prompt",
            AgentName.DETERMINISTIC_DATA: "parse and validate source data without inventing values",
            AgentName.DECISION_SUPPORT: "run governed what-if, simulation, optimization, or recommendation analysis",
            AgentName.VOICE: "transcribe speech into structured text only",
        }
        return actions[agent]

    @staticmethod
    def _output(agent: AgentName) -> str:
        return {
            AgentName.PLANNER: "JSON execution plan",
            AgentName.CONTENT: "complete final draft",
            AgentName.VISION: "structured visual observations",
            AgentName.IMAGE: "PNG image",
            AgentName.DETERMINISTIC_DATA: "validated dataset and metadata",
            AgentName.DECISION_SUPPORT: "explainable decision recommendation",
            AgentName.VOICE: "structured transcript",
        }[agent]
