# CEDA Next-Best-Action Suggestion Engine

The Next-Best-Action Suggestion Engine is the shared recommendation layer used by
both Dorje AI Workspace and Kamal Chat.

It follows the platform sequence:

```text
Current document/message
  → Authorized CEDA context
  → Evidence-backed candidate actions
  → Policy and capability filtering
  → Three explainable suggestions
  → User selection or edit
  → Confirmation-aware execution
  → Outcome learning
  → Updated CEDA context
```

## Principles

- One shared service is used for both `dorje_workspace` and `kamal_chat`.
- Suggestions are generated only from the controlled action registry.
- Uploaded-document instructions are treated as untrusted content.
- Hidden chain-of-thought is never returned, stored, or logged.
- Suggestions return explainable recommendation evidence: source reference,
  short reason, confidence, required permissions, and confirmation requirement.
- Durable memory is not silently created from document extraction; extracted
  facts remain proposed context until policy and user approval allow storage.

## Backend components

- `app/models/suggestion.py` stores CEDA suggestions, suggestion feedback, and
  governed actions.
- `app/repositories/suggestion_repository.py` provides tenant-scoped persistence
  and idempotent action creation.
- `app/services/action_registry.py` defines the allowlisted executable action
  catalog.
- `app/services/suggestion_service.py` generates, scores, filters, selects,
  edits, dismisses, confirms, cancels, and records suggestion outcomes.
- `app/api/v1/suggestions.py` exposes the REST contract under `/api/v1`.
- `migrations/versions/20260721_0006_ceda_suggestions.py` creates the portable
  SQLAlchemy-backed tables.

## REST endpoints

```text
POST /api/v1/suggestions/generate
GET  /api/v1/suggestions/{suggestion_id}
POST /api/v1/suggestions/{suggestion_id}/select
POST /api/v1/suggestions/{suggestion_id}/edit
POST /api/v1/suggestions/{suggestion_id}/dismiss
POST /api/v1/actions/{action_id}/confirm
POST /api/v1/actions/{action_id}/cancel
GET  /api/v1/actions/{action_id}/events
```

Request payloads do not trust user, tenant, or organization IDs from the
browser. Identity and tenant scope are resolved from the authenticated request.

## Frontend components

- `components/dorje-ai/CedaSuggestionButtons.tsx` renders the shared accessible
  suggestion buttons.
- Dorje AI Workspace uses the component below uploaded attachments and workspace
  composer context.
- Kamal Chat uses the same component for personal/contextual next actions.

Each suggestion supports select, edit, and dismiss. Selecting copies the
editable instruction into the composer and records the selection.
Confirmation-required actions return a preview and wait for explicit
confirmation before consequential execution.

## Action lifecycle

Suggestions may move through these statuses:

```text
generated → displayed → selected/edited/dismissed
selected → executed
selected → awaiting_confirmation → executed/cancelled
```

Consequential actions such as reminders, calendar changes, connector writes,
external sharing, deletion, or cloud-sensitive operations must use preview-first
confirmation.

## Validation

Run the core tests with:

```bash
cd /Users/mayanshkadian/LotusAI/lotus-api/Student-LAD/packages/platform/backend
./.venv/bin/python -m unittest tests.test_suggestions -v
```

Run the CEDA and Context OS regression group with:

```bash
./.venv/bin/python -m unittest \
  tests.test_context_graph_service \
  tests.test_context_os \
  tests.test_context_os_17_cases \
  tests.test_ceda_service \
  tests.test_ceda_acceptance \
  tests.test_ceda_structured \
  tests.test_suggestions -v
```

Run frontend checks with:

```bash
cd /Users/mayanshkadian/LotusAI/lotus-api/Student-LAD/packages/platform/frontend
npm run lint
npm run build
```
