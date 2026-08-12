# reminder_creation_skill
Version: 1.0

## Trigger Intents
- create_reminder
- update_reminder
- recurring_reminder

## Required Tools
- calendar
- reminder_store

## Allowed Tiers
- free
- paid
- enterprise

## Offline Support
Yes. Use local context and deterministic stores first.

## Steps
1. Extract task, date, time, recurrence, and priority.
2. Check existing local reminders and calendar connector availability.
3. Apply approved semantic reminder preferences.
4. Require confirmation before changing calendar or notifications.
5. Write preference memory only after explicit correction or repeated approved behavior.

## Validator Requirements
- ActionValidator
- MemoryPolicyEngine

## Memory Write Rules
- Save only distilled conclusions, not raw transcripts.
- Sensitive memory requires explicit confirmation.
- Corrections may create semantic memory and an episodic lesson.

## Confirmation Rules
- External actions, calendar updates, connector sends, and sensitive memory require confirmation.
