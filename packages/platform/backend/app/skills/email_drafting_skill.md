# email_drafting_skill
Version: 1.0

## Trigger Intents
- email
- draft_email
- reply_email

## Required Tools
- email_draft
- connector_policy

## Allowed Tiers
- free
- paid
- enterprise

## Offline Support
Yes. Use local context and deterministic stores first.

## Steps
1. Identify recipient, objective, tone, and constraints.
2. Use only allowed context.
3. Draft for review first.
4. Require confirmation before sending via connector.

## Validator Requirements
- ActionValidator
- PIE

## Memory Write Rules
- Save only distilled conclusions, not raw transcripts.
- Sensitive memory requires explicit confirmation.
- Corrections may create semantic memory and an episodic lesson.

## Confirmation Rules
- External actions, calendar updates, connector sends, and sensitive memory require confirmation.
