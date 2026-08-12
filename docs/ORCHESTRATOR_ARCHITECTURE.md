# DorjeAI Hierarchical Orchestrator

This component implements the orchestration responsibilities defined by
[ARCH-010 and AGENT-001](./PLATFORM_ARCHITECTURE.md#221-requirement-traceability-registry).
The platform-wide boundaries in that canonical architecture take precedence over
edition-specific implementation notes.

Version 1.0 presents one assistant. Users select a task style, not an underlying model.
The current implementation extends that principle into a tier-aware, device-aware,
offline-capable orchestration system for Student-LAD, Professional-LAD, and
Enterprise-LAD.

```text
User
  → InputNormalizer
  → IntentRouter
  → TierPolicyEngine
  → DeviceProfileManager
  → TaskComplexityScorer
  → FastPathRouter
      → Rule Engine
      → Native Device Tools
      → Cache
  → ContextBudgetManager
  → ContextManager + MemoryManager
  → RAG/File Retriever
  → DeepSeek Workflow Planner, only when needed
  → Specialist Registry
      → Qwen Content
      → Qwen Vision
      → Whisper Voice
      → Tiny-SD / SSD Image
      → Deterministic Data/Export Engines
      → Decision Support Engine
      → Cloud Model Fallback, paid only
  → Targeted Validators
      → SafetyValidator
      → FactValidator
      → ActionValidator
  → Result Composer
  → Confirmation-aware UI
```

The orchestrator also exposes shared CEDA next-best-action suggestions for
Dorje AI Workspace and Kamal Chat:

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

See [NEXT_BEST_ACTION_SUGGESTIONS.md](NEXT_BEST_ACTION_SUGGESTIONS.md).

## Boundaries

- Whisper transcribes; it never answers.
- DeepSeek plans and optimizes prompts; it never writes final reports.
- Qwen produces language from planner instructions; it does not choose the workflow.
- Vision returns observations; the content specialist composes the answer.
- Tiny-SD receives a planner-enhanced prompt, never the raw user request.
- Charts and table exports use validated source rows and native libraries.
- Decision support uses approved context, scenario assumptions, local simulation,
  optimization, and ranked recommendations before any action can be confirmed.
- External actions require explicit confirmation in the UI.
- Tier policy controls whether paid-only or enterprise-only features can run.
- Device profile controls model residency, context length, memory windows, and upload limits.
- Fast-path commands bypass DeepSeek and use deterministic handlers where no model planning is needed.

## Tier policy

`backend/app/services/tier_policy.py` defines the platform capability matrix.

- Free tier supports reminders, notes, basic chat, small RAG, daily task planning,
  limited uploads, and local summaries.
- Paid tier adds long reports, large documents, cloud model fallback, image
  generation, video analysis, and multi-device sync.
- Enterprise tier inherits paid capabilities and adds enterprise connectors,
  admin policy controls, audit logs, and tenant governance.

Blocked features return structured upgrade decisions with `allowed`,
`upgrade_required`, and `required_tier` fields so the UI can explain the next step
without guessing.

## Device profile manager

`backend/app/services/device_profile.py` defines device and connectivity constraints.

- `8gb` profile keeps only the intent classifier resident and lazily loads
  lightweight specialists such as DeepSeek and Whisper. Qwen 8B and local image
  models remain blocked.
- `16gb` profile keeps the intent classifier and DeepSeek resident, with Qwen,
  Whisper, Qwen Vision, and Tiny-SD as lazy options. SSD-1B remains disabled by
  default.
- `32gb` profile can keep Qwen 8B resident and allows broader local specialists,
  including Vision, Whisper, Tiny-SD, and SSD-1B where tier policy permits.

Connectivity modes gate execution:

- Offline mode allows local reminders, notes, local summaries, already-indexed
  RAG, deterministic exports, and local task planning.
- Hybrid mode runs local-first and permits cloud fallback only when tier and
  user approval allow it.
- Online mode enables cloud fallback, connectors, multi-device sync, and large
  cloud processing where policy permits.

## Task complexity scoring

`backend/app/services/task_complexity.py` classifies each request before planning.

| Complexity | Use cases | Routing effect |
| --- | --- | --- |
| `FAST_COMMAND` | reminders, notes, task updates, exports, saved summaries, basic calculations | Bypass DeepSeek through `FastPathRouter` |
| `SIMPLE_CHAT` | explain concepts, rewrite short text, brainstorm | Use compact chat context |
| `CONTEXTUAL_RAG` | summarize uploads, answer from notes, retrieve course/project files | Use approved RAG/file retrieval |
| `REASONING_REQUIRED` | daily planning, compare options, study plans, debugging, decision recommendations | Invoke planner with summarized context |
| `CLOUD_REQUIRED` | long reports, large documents, image generation, video analysis, enterprise connector actions | Enforce tier/connectivity policy before cloud or specialist routing |

## Fast-path routing

`backend/app/services/fast_path_router.py` executes deterministic actions before
DeepSeek is loaded. This keeps free-tier and mobile flows fast and avoids spending
model time on operations that native code can handle more reliably.

Fast-path examples:

- create a reminder draft;
- create a confirmed local CEDA reminder that appears in Calendar & Timeline,
  Upcoming, My Day, and Tasks from the shared reminder source;
- create or save a note;
- create or update a task;
- export a table/PDF/CSV/XLSX summary;
- retrieve a saved summary from cache/search;
- evaluate a safe arithmetic expression.

Fast-path actions still return confirmation metadata when they would create,
send, export, or persist user data.

## Decision Support routing

Requests such as "what if", "compare scenarios", "optimize my schedule",
"which task should I prioritize", "simulate risk", or "recommend the next action"
route to the registered `decision_support` specialist when deterministic analysis is
more useful than free-form chat.

Current backend API:

```text
POST /api/v1/decision-support/scenarios
POST /api/v1/decision-support/what-if
POST /api/v1/decision-support/simulate
POST /api/v1/decision-support/optimize
POST /api/v1/decision-support/recommend
GET  /api/v1/decision-support/history
```

The engine is local-first for Student-LAD and returns explainable payloads:

- scenario ID, assumptions, objective, constraints, and policy decision reference;
- simulation distribution metrics and risk probability;
- optimization selections with budget/cost/benefit summary;
- ranked top-three recommendations with rationale and confirmation requirement;
- audit events for creation, simulation, comparison, and recommendation.

Airflow, reinforcement learning, and strict LP/IP solvers are future
Professional/Enterprise execution backends. They may be added only behind this
contract and must still pass through PIE, CEDA, tenant isolation, and confirmation.


## Student-LAD request adapters

Student-LAD exposes edition-specific API adapters without replacing the shared
platform services:

- `/api/v1/student-lad/dashboard` returns a compact dashboard ViewModel for
  priority cards, pending review, reminders, workspace health, and privacy cues.
- `/api/v1/student-lad/my-day`, `/calendar`, `/tasks`, `/review`, `/memory`, and
  `/settings` aggregate existing CEDA, Context OS, memory, tier, device, WKIM,
  and reminder services into UI-ready payloads.
- `/api/v1/reminders` is a compatibility reminder facade over the same governed
  local reminder store used by Calendar & Timeline, My Day, Tasks, Kamal, and
  Workspace AI.

These adapters keep old APIs available while giving Student-LAD stable,
role-specific endpoints. They should not own business logic; they compose the
shared services and return clear ViewModels for the frontend.

## ActionDraft contract

Fast-path deterministic handlers return a standard `ActionDraft` before any
persistence or external action occurs. The draft includes:

```json
{
  "action_id": "ACT-...",
  "intent": "create_calendar_event",
  "status": "draft",
  "requires_confirmation": true,
  "execution_mode": "offline",
  "entities": {},
  "conflicts": [],
  "warnings": [],
  "suggested_actions": []
}
```

Reminder, calendar, task, export, bill/subscription, family, health, finance,
and navigation commands can therefore bypass model planning while still passing
through confirmation-aware UI. Calendar conflict detection is deterministic and
runs before confirmation when start/end windows are available.

## Context budgeting

`backend/app/services/context_budget.py` calculates prompt/context budgets from:

- tier;
- device mode;
- resource profile;
- connectivity mode;
- task complexity.

The returned budget includes:

```json
{
  "max_context_tokens": 1200,
  "max_recent_messages": 2,
  "max_memory_items": 3,
  "max_rag_chunks": 2,
  "max_file_excerpts": 2,
  "summary_required": true
}
```

Free tier always prefers summarized context, top approved memory items, top RAG
chunks, and the current message instead of full conversation history. Fast
commands receive the smallest budget and no RAG excerpts. Paid desktop workflows
can use larger windows when connectivity and policy allow it.

## Memory policy

`backend/app/services/memory_policy.py` defines the durable-memory governance
layer used by CEDA, Kamal, DorjeAI, and future agents.

| Memory class | Retention | Rule |
| --- | --- | --- |
| `temporary` | current interaction | never persisted as durable context |
| `session` | active session | removed when the session ends |
| `workspace` | project/note/task/document lifecycle | must be attached to a workspace reference |
| `durable` | policy retention | requires user approval or an explicit memory setting plus an applied policy |
| `sensitive` | never automatic | rejected before automatic storage |

Offline memory is marked for encrypted local storage where possible. Enterprise
memory decisions require tenant and role boundaries so future Enterprise-LAD
deployments do not mix context across users or organizations.

## Tier-aware upload policy

`backend/app/services/upload_policy.py` converts the saved tier and resource
profile into file-size and daily-upload limits.

| Tier | 8 GB | 16 GB | 32 GB |
| --- | --- | --- | --- |
| Free | 2 MB/file, 3 uploads/day | 5 MB/file, 5 uploads/day | 10 MB/file, 10 uploads/day |
| Paid / Enterprise | 10 MB/file | 25 MB/file | 100 MB/file |

Large documents normally require Paid Tier. In local development, `ALLOW_UPGRADE_MODEL_TEST_BYPASS=true` temporarily allows larger document testing. When bypass is disabled, blocked requests return:

```json
{
  "allowed": false,
  "reason": "Large document processing is available in Paid Tier",
  "upgrade_required": true,
  "required_tier": "paid"
}
```

The DorjeAI upload endpoint uses this policy before staging attachments, so the
frontend and backend enforce the same limits.

## Model residency

`backend/app/services/model_residency.py` decides which local specialists stay
resident, which load lazily, and which are blocked.

- `8gb`: only the intent classifier stays resident; DeepSeek and Whisper are
  lazy; Qwen 8B, SSD-1B, and Tiny-SD are blocked.
- `16gb`: DeepSeek may stay resident; Qwen 8B, Whisper, Vision, and Tiny-SD are
  lazy; SSD-1B is disabled by default.
- `32gb`: DeepSeek and Qwen 8B are resident; Vision, Whisper, Tiny-SD, and
  SSD-1B are lazy; SSD-1B is available only for paid/enterprise users.

DeepSeek is preferred only when reasoning is required. Simple chat and fast
commands avoid planner residency unless complexity scoring says planning adds
value.

## Extension model

Specialists are registered through `AgentRegistry`. A future agent declares a name,
capability, and residency policy, then the planner can reference it without changing UI
model controls. Domain agents must still pass the shared response validator.

## Performance policy

- Planner and voice transcription are treated as resident lightweight services.
- Vision and image generation are lazy specialists.
- Ollama `keep_alive` and `MODEL_IDLE_TIMEOUT_SECONDS` control residency.
- Context is limited by `ContextBudgetManager` according to tier, device,
  connectivity, and task complexity.
- Validation retries at most once by default.

## Deterministic data policy

Statistics, charts, tables, Excel, PDF, and conversions should preserve source data.
The backend analytics engine extracts prompt/file/table values into a locked dataset before
calculation or rendering. The lock records a dataset ID, typed columns, exact source rows,
row count, source message, and SHA-256 source-data hash. Chart rows must match that lock and
receive `validation_status = passed`; synthetic observation labels are rejected unless they
were present in the source. Chi-square expected values are calculated as total observed divided
by the verified category count. PDF, DOCX, and ZIP exporters omit any chart that does not carry
a complete passed validation record. LLMs may recommend and explain charts, but deterministic
SciPy/NumPy code calculates values and the Pillow/SVG renderer builds visual assets.

`StructuredTable` never generates its own identifier. `DatasetRegistry` owns identity through
`create_dataset`, `validate_dataset`, `lock_dataset`, `get_dataset`, and
`reject_legacy_uuid_dataset`. Generic semantic IDs combine task type, source columns, and a
SHA-256 digest of exact source values; the validated material chi-square example uses
`chi_square_materials_001`. A chart is renderable only when its registry-issued ID is non-UUID,
its source snapshot still matches, `locked` is true, and validation status is `passed`.


## Memory Architecture

DorjeAI uses CEDA-governed working, semantic, procedural, and episodic memory. The Workspace AI chat route retrieves bounded memory through `ContextComposer` before model calls and creates memory candidates after the final streamed answer is produced. Raw chat is not durable memory by default. See `docs/MEMORY_ARCHITECTURE.md`.

The Deep Analysis mode deliberately bypasses the structured planner prompt and
uses a dedicated Qwen deep profile (`OLLAMA_DEEP_MODEL`, `OLLAMA_DEEP_NUM_CTX`,
`OLLAMA_DEEP_NUM_PREDICT=3072`, `OLLAMA_DEEP_THINKING=true`) with the user's request,
relevant approved memory, file excerpts, visual observations, and policy
constraints. Fast Chat remains bounded by `OLLAMA_FAST_NUM_PREDICT=512` and
`OLLAMA_FAST_THINKING=false`. Standalone software tutorials are classified as
`software_tutorial`, so statistical topic words do not force the deterministic
Statistics workflow. For simple standalone tutorial requests, unrelated CEDA
memory and old conversation history are excluded to keep the prompt close to a
direct Qwen session. This keeps Deep Analysis closer to direct model reasoning
while preserving the Dorje architecture boundary: memory retrieval is governed
before the model call, and new learning is distilled by CEDA after the outcome
rather than copied from raw conversation.

### Fast Chat vs Deep Analysis Separation

| Setting | Fast Chat | Deep Analysis |
| --- | --- | --- |
| Planner | Skip for simple requests; use only when task planning is necessary. | Skip unless task planning is necessary. |
| Thinking | Off through `OLLAMA_FAST_THINKING=false`. | On through `OLLAMA_DEEP_THINKING=true` when supported. |
| Output budget | 512 by default; may be tuned to 768 or 1024 while staying below Deep Analysis. | 3072 by default. |
| Context window | 4096. | 8192. |
| Style | Direct and concise. | Comprehensive and fully developed. |
| CEDA/history | Only clearly relevant context, with recent history limited for simple answers. | Relevant context within an explicit budget; standalone tutorials exclude unrelated memory/history. |
| Fixed template | No. | No. |
| Validator rewriting | No. Validators may flag, but do not regenerate or rewrite Fast Chat. | No. Validators may flag, but do not regenerate or rewrite Deep Analysis. |


## Context Graph and data architecture policy

Student-LAD now uses a SQL-first graph layer for CEDA and Context OS relationships. New durable records must be created with stable unique IDs before they are stored or linked. Relationships must use controlled definitions from `relationship_definitions`; LLMs may suggest relationships, but deterministic backend code validates the source record, target record, relationship type, user ownership, workspace boundary, and Policy Intelligence Engine decision before storage.

Core tables:

- `record_identity_registry` — registers every durable record by `record_type`, `record_id`, table name, user, organization, and workspace.
- `context_relationships` — stores graph-style edges between registered records or Context Objects.
- `relationship_definitions` — controlled relationship vocabulary such as `has_assignment`, `depends_on`, `sourced_from`, `has_deadline`, and `governed_by_policy`.
- `record_change_events` — audit ledger for record registration, relationship creation, archival, deletion, and future table changes.
- `data_storage_architecture_policies` — persistent architecture guardrails requiring unique IDs, policy checks, relationship definitions, referenceable nodes, and audit logging.

Graph-style APIs are exposed under `/api/v1/context-graph` for registering records, validating architecture compliance, creating relationships, listing neighbors, retrieving related nodes by depth, dependencies, impact analysis, definitions, and audit events. Future Student-LAD, Professional-LAD, and Enterprise-LAD tables should follow this contract instead of introducing isolated relationship logic.
