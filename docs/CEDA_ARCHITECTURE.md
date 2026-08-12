# CEDA Core Intelligence Architecture

## 3.1 Purpose and authority

CEDA—**Context Extraction, Decision & Adaptation Architecture**—is the
model-independent intelligence core of Dorje AI. It transforms interactions and
events into structured, policy-governed context instead of treating conversation
history or vector recall as durable truth.

CEDA continuously answers:

1. What happened?
2. What matters?
3. Should it become long-term context?
4. How may it influence future behavior?
5. When should obsolete context be forgotten?

This chapter is the CEDA implementation contract for the canonical
[Dorje AI Platform Enterprise Architecture](./PLATFORM_ARCHITECTURE.md). It applies
unchanged to Student-LAD, Professional-LAD, Enterprise-LAD, Lotus & Dorje SaaS,
Kamal, and all agent modules.

## 3.2 Design principles

- **Context over conversation:** conversation is temporary; approved context may be
  durable. See **CEDA-001**, **CEDA-003**, and **CEDA-004**.
- **Structured intelligence:** only structured objects that pass policy evaluation
  become persistent. See **CEDA-001** and **CEDA-002**.
- **User sovereignty:** users approve, inspect, modify, archive, export, and delete
  their context. See **CEDA-006** and **CEDA-007**.
- **Explainability:** each object records origin, retention reason, policy,
  confidence, usage, and expiration. See **CEDA-007**.
- **Minimal retention:** raw conversation and temporary reasoning are discarded
  unless explicitly preserved. See **CEDA-003** and **CEDA-004**.
- **Progressive intelligence:** behavior evolves only from approved decisions,
  corrections, preferences, and policy changes. See **CEDA-006**.

### Identifier normalization

The source design used `CEDA-001` through `CEDA-006` both for principle labels and
again for different requirements. To prevent ambiguous traceability, section 3.19 is
the authoritative permanent ID registry. Principle names above reference those
requirements and are not a second identifier namespace.

## 3.3 Position within the platform

```text
User
  -> Kamal (conversation layer)
  -> Dorje AI Orchestrator
  -> CEDA Platform
       -> Observation Engine
       -> Extraction Engine
       -> Classification Engine
       -> Decision Engine
       -> Policy Engine
       -> Context Engine
       -> Adaptation Engine
       -> Learning Engine
  -> Context OS | Workspace | Knowledge | Reminders | AI Agents
```

CEDA is mandatory infrastructure. Features submit standardized events and requests;
they do not create durable context directly. **CEDA-008**

Kamal reminder commands are a fast-path CEDA action: after user confirmation,
Kamal creates a local active reminder without requiring any external calendar
connector. Calendar sync is optional and routed through an explicit provider
prompt for Gmail / Google Calendar, Apple Calendar, or Microsoft Calendar.
Calendar & Timeline, Upcoming, My Day, and Tasks all consume the same CEDA
reminder collection. Calendar navigation spans 1999 through 2100, highlights the
current date, overlays United States federal holidays, and renders Calendar,
Timeline, Agenda, and Milestones views without creating a second reminder store.

## 3.4 Internal engines

### Observation Engine

Consumes prompts, uploads, connector events, approvals, edits, reminder outcomes,
and recurring behaviors. It produces immutable, short-lived `ObservationEvent`
records with source, actor, time, classification hints, and sensitivity flags.

### Extraction Engine

Extracts candidate entities, facts, dates, preferences, relationships, and actions.
For “Statistics Assignment due July 20,” candidates may include assignment, due
date, course, effort, priority, and dependencies. Extraction is not persistence.

### Classification Engine

Maps candidates to academic, immigration, career, projects, research, social,
finance, personal, preferences, knowledge, and future health/enterprise domains.
Multiple classifications are allowed; cross-domain use still requires policy.

### Decision Engine

Chooses whether to ignore, summarize, ask, propose a policy, create a reminder,
create a new object, or propose an update to an existing object. It cannot bypass
policy evaluation or required approval.

### Context Engine

Creates versioned Context Objects, validates state transitions, manages retention,
and maintains references and graph relationships. **CEDA-001**, **CEDA-005**

### Adaptation Engine

Proposes transparent changes to priority, recommendations, reminder timing, writing
style, study habits, and workflows without mutating source facts. **CEDA-007**

### Learning Engine

Learns only from approved actions, repeated corrections, explicit preferences, and
policy changes—never assumptions or hidden model reasoning. **CEDA-006**

## 3.5 Deterministic lifecycle

```text
Interaction
  -> Observe
  -> Extract
  -> Classify
  -> Score confidence
  -> Evaluate policies
  -> Determine approval requirement
  -> User decision
  -> Create/update Context Object
  -> Generate Context Instructions
  -> Update Context Graph
  -> Delete temporary data
```

Rejection or missing required approval terminates persistence. Temporary data must
still follow a bounded deletion policy.

## 3.6 Chew → Extract → Store → Discard

1. **Chew:** inspect an interaction, file reference, or event in working memory.
2. **Extract:** identify candidate durable facts, relationships, and instructions.
3. **Store:** after policy and approval, persist only structured metadata, policies,
   instructions, references, relationships, deadlines, preferences, and approved
   summaries.
4. **Discard:** remove temporary prompts, intermediate reasoning, duplicates,
   irrelevant material, and unapproved candidates. **CEDA-003**, **CEDA-004**

## 3.7 Context Object model

```json
{
  "context_id": "CTX-ACA-0001",
  "owner_id": "user-id",
  "domain": "academic",
  "type": "assignment",
  "title": "Statistics Assignment 2",
  "source": { "type": "manual_note", "reference": "external-reference" },
  "retention_reason": "Confirmed academic deadline",
  "confidence": 0.98,
  "policy_ids": ["POL-ACA-001"],
  "created_at": "ISO-8601",
  "last_used_at": null,
  "expires_at": "ISO-8601",
  "related_context": [],
  "actions": [],
  "references": [],
  "status": "active",
  "version": 1
}
```

Required metadata includes ownership, origin, retention reason, applied policies,
confidence, status, version, last usage, and expiration rule. Sensitive payloads are
encrypted; source documents remain in user-selected storage whenever possible.

## 3.8 Context taxonomy

```text
Academic: Courses, Assignments, Exams, Notes, Research, Projects
Immigration: Passport, Visa, I-20, CPT, OPT, STEM OPT, EAD, USCIS
Career: Resume, Recruiters, Interviews, Skills, Portfolio
Preferences: Writing, Reminders, Study, Privacy, Connectors
```

Additional registered domains use the same object and policy contracts rather than
new storage models.

## 3.9 Context relationships

CEDA links rather than duplicates:

```text
Statistics Course
  -> has assignment -> Assignment 2
  -> requires -> Research Paper
  -> produces -> Reminder
  -> related to -> Study Plan
  -> synchronized with -> Calendar Event
```

References identify external source documents without copying them into context.

## 3.10 Confidence

Confidence considers source reliability, extraction certainty, explicit confirmation,
frequency, contradictions, and age. Confidence controls whether CEDA may suggest,
must ask, or must refuse an automatic update; it never overrides policy.

## 3.11 Aging and retention

```text
Draft -> Pending approval -> Active -> Dormant -> Archived -> Deleted
```

Transitions are policy-driven, auditable, and reversible where secure-deletion rules
permit. Assignments may expire after course completion; immigration objects remain
until superseded, expired, or removed; preferences persist until changed or deleted.

## 3.12 Policy evaluation pipeline

```text
Extracted candidate
  -> Domain Policy
  -> Privacy Policy
  -> Retention Policy
  -> Connector/Cloud Policy
  -> Approval Decision
```

No durable context bypasses this pipeline. **CEDA-002**

## 3.13 Context Graph

The lightweight graph supports person, course, assignment, document, reminder, goal,
policy, connector, and project nodes. Standard edges include `assigned_to`,
`depends_on`, `generated_from`, `requires`, `references`, `supersedes`, and
`related_to`. Graph mutations are scoped by owner and policy. **CEDA-005**

## 3.14 Context Instructions

Instructions convert approved choices into behavior without retaining conversation:

```text
Instruction: Suggest reminders 21 days before statistics assignments.
Policy: Academic reminder policy.
Source: Explicit user preference.
```

Instructions never grant broader permissions than their governing policies.

## 3.15 Pattern recognition

CEDA may detect repeated delays, accepted tone, schedules, productive hours,
frequently referenced courses, and document templates. Patterns create suggestions,
not silent facts or policy changes. **CEDA-006**

## 3.16 Adaptation

CEDA may propose adjusted reminder timing, study blocks, organization improvements,
or tone changes. Every proposal states evidence, affected behavior, policy, and undo
path. Adaptations are explainable and reversible. **CEDA-007**

## 3.17 Event Bus

All modules publish versioned events such as `DocumentUploaded`,
`ReminderCompleted`, `PolicyChanged`, `AssignmentCreated`,
`ImmigrationDocumentUpdated`, `ResumePublished`, and `SocialPostApproved`.

An event envelope contains event ID, schema version, actor, owner, source module,
timestamp, sensitivity, correlation ID, payload reference, and retention deadline.
CEDA consumers are idempotent; events do not themselves authorize persistence.
**CEDA-008**

## 3.18 Stable CEDA APIs

The stable service contract includes:

- `ObserveEvent`
- `ExtractContext`
- `EvaluatePolicies`
- `CreateContext`
- `UpdateContext`
- `LinkContext`
- `ArchiveContext`
- `DeleteContext`
- `GenerateSuggestions`
- `RetrieveRelevantContext`

HTTP, local IPC, and future message-bus adapters must preserve the same ownership,
policy, approval, idempotency, and audit semantics.

The current HTTP foundation exposes authenticated dashboard, capture, context,
pending-decision, policy, and reminder endpoints under `/api/v1/ceda`.

## 3.19 Authoritative requirement registry

| ID | Permanent requirement |
| --- | --- |
| CEDA-001 | All durable knowledge is represented as versioned Context Objects. |
| CEDA-002 | Every Context Object passes policy evaluation before persistence or use. |
| CEDA-003 | CEDA stores approved instructions and structured context, not raw conversation. |
| CEDA-004 | Temporary prompts and reasoning are discarded after bounded processing. |
| CEDA-005 | Context relationships are maintained through the Context Graph. |
| CEDA-006 | Learning derives only from explicit approval, corrections, and policy changes. |
| CEDA-007 | Adaptations are transparent, explainable, user-controlled, and reversible. |
| CEDA-008 | Modules communicate with CEDA through versioned events and stable APIs. |

## 3.20 Current implementation profile

| Capability | Status |
| --- | --- |
| Encrypted per-user context candidates and instructions | Implemented foundation |
| Policy evaluation and explicit approval queue | Implemented foundation |
| Shared DorjeAI and Kamal retrieval adapter | Implemented foundation |
| Temporary Student-LAD chat with explicit save | Implemented |
| Context dashboard, policies, and reminder suggestions | Implemented foundation |
| Context Object versioning and active/dormant/archived/deleted lifecycle | Implemented foundation |
| Typed Context Graph and owner-scoped relationship APIs | Implemented foundation |
| Versioned persisted event ingestion and idempotent processing | Implemented foundation |
| Pattern/adaptation proposal engine | Planned |
| External workspace indexer and OS keychain vault | Planned |
| Configurable USCIS rule-pack engine | Planned |

The current Student-LAD implementation stores encrypted lightweight records in its
isolated runtime workspace. Planned capabilities must extend shared packages and pass
the requirements above; they must not introduce edition-specific CEDA forks.
