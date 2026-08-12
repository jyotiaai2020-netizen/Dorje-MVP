# DorjeAI Memory Architecture

DorjeAI now uses a CEDA-governed memory layer instead of treating chat history as memory.

## Memory layers

1. **Working memory** — volatile task/session context only.
2. **Semantic memory** — approved durable preferences, goals, facts, workspace/project context, and document summaries.
3. **Procedural memory** — versioned task skills in `packages/platform/backend/app/skills` loaded only when relevant.
4. **Episodic memory** — compact lessons from corrections, accepted/rejected outputs, and workflow outcomes.

## CEDA loop

Every meaningful interaction may flow through:

```text
Capture → Understand → Link → Evaluate → Decide → Act → Learn → Update Context
```

The system stores distilled conclusions, not raw transcripts. Sensitive memory is never auto-saved.

## Workspace AI runtime memory flow

Workspace AI now uses memory in two separate directions:

1. **Before generation** — `/api/v1/dorje-ai/chat` calls `ContextComposer`.
   It retrieves bounded, approved semantic and episodic memory, relevant
   procedural skill text, recent conversation summary, file excerpts, and policy
   constraints. The context budget is determined by tier, device mode, RAM
   profile, connectivity mode, and task complexity.
2. **After generation** — the streaming response is accumulated and submitted
   back to `CEDAMemorySystem` with the user message, assistant response, route,
   model, files used, intent, and task complexity. CEDA then decides whether a
   semantic memory candidate, episodic lesson, workspace memory, or rejection is
   appropriate.

This makes Deep Analysis closer to an interactive Qwen terminal session because
recent conversation and approved prior lessons are available to the model. It
does **not** turn raw chat into permanent memory. Ordinary Q&A remains working
memory unless CEDA detects a meaningful preference, correction, goal, document
fact, project fact, uploaded source, or workflow outcome.

Deep Analysis is allowed to use Qwen's natural long-form generation path through
a dedicated deep model profile. The governance layer only controls what context
may be injected before the model call and what, if anything, may be distilled
after the answer. Standalone software tutorials use the current request first and
do not pull unrelated memories simply because the topic contains a statistics
keyword such as correlation, regression, or ANOVA.

## Backend components

- `app/services/ceda_memory.py`
- `app/services/memory_candidate_service.py`
- `app/services/memory_retriever.py`
- `app/services/context_composer.py`
- `app/services/episodic_distiller.py`
- `app/api/v1/dorje_ai_memory.py`
- `app/models/memory.py`
- Alembic migration `20260712_0005_memory_architecture.py`

## Frontend

Student-LAD includes a **Memory Center** page with:

- pending memories;
- saved memories;
- preferences;
- goals;
- lessons learned;
- sensitive / expired memory;
- approve, reject, edit, forget, pin, and export actions.

## Tests

- Backend: `tests/test_memory_architecture.py`
- Frontend: `tests/e2e/memory-center.spec.ts`

Run focused checks:

```bash
cd packages/platform/backend
python3 -m unittest tests.test_memory_architecture -v

cd ../frontend
npx playwright test tests/e2e/memory-center.spec.ts --project=chromium
```
