from app.orchestration.models import AgentName, Intent
from app.orchestration.router import IntentRouter
from app.orchestration.validator import ResponseValidator
from app.schemas.dorje_ai import UploadedFileReference


def test_statistics_routes_to_deterministic_data_and_content():
    plan = IntentRouter().fallback_plan("Create a correlation chart from revenue data", [])
    assert plan.intent == Intent.STATISTICS
    assert AgentName.DETERMINISTIC_DATA in plan.required_agents
    assert AgentName.CONTENT in plan.required_agents


def test_visual_attachment_routes_through_vision():
    files = [UploadedFileReference(name="chart.png", type="image/png", content="data:image/png;base64,abc")]
    plan = IntentRouter().fallback_plan("Explain this chart", files)
    assert AgentName.VISION in plan.required_agents
    assert AgentName.CONTENT in plan.required_agents


def test_validator_rejects_missing_source_values():
    plan = IntentRouter().fallback_plan("Product A: 120\nProduct B: 185", [])
    assert plan.intent == Intent.STATISTICS
    result = ResponseValidator().validate("The chart shows values 900 and 800.", plan, [], "Product A: 120\nProduct B: 185")
    assert result.valid is False


def test_validator_rejects_false_file_access_claim():
    files = [UploadedFileReference(name="brief.pdf", type="application/pdf", content="Readable text")]
    plan = IntentRouter().fallback_plan("Summarize the attachment", files)
    result = ResponseValidator().validate("I cannot access the attached file.", plan, files, "Summarize")
    assert result.valid is False


def test_tutorial_statistics_keywords_do_not_force_statistics_workflow():
    router = IntentRouter()
    examples = {
        "Give me JASP steps to perform correlation.": Intent.SOFTWARE_TUTORIAL,
        "How do I run Pearson correlation in JASP?": Intent.SOFTWARE_TUTORIAL,
        "Explain Pearson correlation.": Intent.CHAT,
        "Calculate correlation using the attached data.": Intent.STATISTICS,
        "Interpret this JASP correlation table.": Intent.STATISTICAL_INTERPRETATION,
        "Create a scatterplot from this dataset.": Intent.STATISTICS,
        "Which correlation method should I choose?": Intent.STATISTICAL_GUIDANCE,
    }
    for prompt, expected in examples.items():
        assert router.detect(prompt, []) == expected, prompt


def test_software_tutorial_plan_uses_content_not_deterministic_statistics():
    plan = IntentRouter().fallback_plan("Give me JASP steps to perform correlation.", [])
    assert plan.intent == Intent.SOFTWARE_TUTORIAL
    assert AgentName.CONTENT in plan.required_agents
    assert AgentName.DETERMINISTIC_DATA not in plan.required_agents
    assert "do not force a statistics calculation template" in " ".join(plan.validation_rules)
