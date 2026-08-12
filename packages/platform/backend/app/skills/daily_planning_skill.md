# daily_planning_skill
Version: 1.0

## Trigger Intents
- daily_planning
- study_plan
- task_planning

## Required Tools
- reminder_store
- context_os

## Allowed Tiers
- free
- paid
- enterprise

## Offline Support
Yes. Use local context and deterministic stores first.

## Steps
1. Retrieve approved deadlines and preferences.
2. Prioritize by date, importance, effort, and policy.
3. Propose schedule blocks.
4. Create reminders only after confirmation.

## Validator Requirements
- ActionValidator
- PolicyValidator

## Memory Write Rules
- Save only distilled conclusions, not raw transcripts.
- Sensitive memory requires explicit confirmation.
- Corrections may create semantic memory and an episodic lesson.

## Confirmation Rules
- External actions, calendar updates, connector sends, and sensitive memory require confirmation.
