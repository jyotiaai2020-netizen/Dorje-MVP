# chart_validation_skill
Version: 1.0

## Trigger Intents
- chart
- statistics
- analytics

## Required Tools
- analytics_engine
- dataset_registry

## Allowed Tiers
- free
- paid
- enterprise

## Offline Support
Yes. Use local context and deterministic stores first.

## Steps
1. Extract or select locked dataset.
2. Run deterministic calculations.
3. Render chart from validated rows only.
4. Reject synthetic rows unless user supplied them.

## Validator Requirements
- DatasetValidator
- ChartValidator

## Memory Write Rules
- Save only distilled conclusions, not raw transcripts.
- Sensitive memory requires explicit confirmation.
- Corrections may create semantic memory and an episodic lesson.

## Confirmation Rules
- External actions, calendar updates, connector sends, and sensitive memory require confirmation.
