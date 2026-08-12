# report_generation_skill
Version: 1.0

## Trigger Intents
- report
- long_report
- presentation

## Required Tools
- export_engine
- retriever

## Allowed Tiers
- free
- paid
- enterprise

## Offline Support
Yes. Use local context and deterministic stores first.

## Steps
1. Build outline from user intent.
2. Retrieve approved context and source excerpts.
3. Generate report sections.
4. Validate tables/charts with deterministic engines.
5. Export only validated assets.

## Validator Requirements
- FactValidator
- ExportValidator

## Memory Write Rules
- Save only distilled conclusions, not raw transcripts.
- Sensitive memory requires explicit confirmation.
- Corrections may create semantic memory and an episodic lesson.

## Confirmation Rules
- External actions, calendar updates, connector sends, and sensitive memory require confirmation.
