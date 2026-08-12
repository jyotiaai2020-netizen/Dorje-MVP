# rag_summary_skill
Version: 1.0

## Trigger Intents
- rag
- summarize_document
- answer_from_notes

## Required Tools
- retriever
- document_excerpt

## Allowed Tiers
- free
- paid
- enterprise

## Offline Support
Yes. Use local context and deterministic stores first.

## Steps
1. Retrieve policy-allowed chunks only.
2. Summarize source-grounded facts.
3. Cite source references.
4. Do not save document facts without CEDA candidate approval.

## Validator Requirements
- FactValidator
- SourceValidator

## Memory Write Rules
- Save only distilled conclusions, not raw transcripts.
- Sensitive memory requires explicit confirmation.
- Corrections may create semantic memory and an episodic lesson.

## Confirmation Rules
- External actions, calendar updates, connector sends, and sensitive memory require confirmation.
