# AI Orchestrator

The shared orchestrator implementation lives in `../platform/backend/app/orchestrator` and
`../platform/backend/app/services`. All editions use the same implementation.

## Current routing services

The production routing layer is assembled from deterministic backend services:

- `tier_policy.py` — free, paid, and enterprise capability enforcement.
- `device_profile.py` — mobile/desktop mode, RAM profile, connectivity mode,
  model residency, upload limits, and context-size rules.
- `task_complexity.py` — request complexity classification before planning.
- `fast_path_router.py` — deterministic bypass for reminders, notes, task
  creation, exports, saved-summary retrieval, and basic calculations.
- `context_budget.py` — tier/device/connectivity/complexity-aware prompt budget.
- `memory_policy.py` — temporary/session/workspace/durable/sensitive memory
  classification and storage approval rules.
- `upload_policy.py` — tier-aware upload limits and Paid Tier upgrade decisions
  for large documents.
- `model_residency.py` — resident/lazy/disabled model planning from tier, device
  profile, connectivity mode, and task complexity.

DeepSeek planning is intentionally skipped for `FAST_COMMAND` requests. The
planner is reserved for contextual RAG, reasoning, cloud-required work, and
specialist workflows where task decomposition actually improves the result.
