# note_capture_skill
Version: 1.0

## Trigger Intents
- create_note
- save_note
- capture_note

## Required Tools
- local_notes

## Allowed Tiers
- free
- paid
- enterprise

## Offline Support
Yes. Use local context and deterministic stores first.

## Steps
1. Capture concise note content.
2. Classify academic, career, immigration, or personal domain.
3. Ask before saving sensitive context.
4. Store source reference, not raw chat, when durable memory is requested.

## Validator Requirements
- SafetyValidator
- MemoryPolicyEngine

## Memory Write Rules
- Save only distilled conclusions, not raw transcripts.
- Sensitive memory requires explicit confirmation.
- Corrections may create semantic memory and an episodic lesson.

## Confirmation Rules
- External actions, calendar updates, connector sends, and sensitive memory require confirmation.
