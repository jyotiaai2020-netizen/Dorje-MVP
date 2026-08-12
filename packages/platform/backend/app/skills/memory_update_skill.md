# memory_update_skill
Version: 1.0

## Trigger Intents
- memory
- remember
- forget
- correction

## Required Tools
- memory_candidate_service
- ceda_memory

## Allowed Tiers
- free
- paid
- enterprise

## Offline Support
Yes. Use local context and deterministic stores first.

## Steps
1. Capture the lesson, not the transcript.
2. Create candidate first.
3. Apply MemoryPolicyEngine.
4. Approve, reject, edit, or forget via user action.
5. Never auto-save sensitive memory.

## Validator Requirements
- MemoryPolicyEngine
- AuditValidator

## Memory Write Rules
- Save only distilled conclusions, not raw transcripts.
- Sensitive memory requires explicit confirmation.
- Corrections may create semantic memory and an episodic lesson.

## Confirmation Rules
- External actions, calendar updates, connector sends, and sensitive memory require confirmation.
