# Dorje AI Platform Enterprise Architecture

## 2.1 Scope and authority

This is the canonical architecture for Student-LAD, Professional-LAD,
Enterprise-LAD, Lotus & Dorje SaaS, Kamal, CEDA, and every present or future agent.
Shared platform capabilities are implemented once under `packages/platform`; editions
provide configuration, branding, entitlements, and isolated runtime data rather than
forking the architecture.

The requirement identifiers in section 2.21 are permanent contracts. Future design,
code, tests, and migration documents must cite them instead of redefining the same
behavior.

## 2.2 Architecture philosophy

Dorje AI is an AI operating system, not a chatbot. Memory, policy, storage,
planning, automation, reminders, knowledge, connectors, security, and model execution
remain separate engines with explicit boundaries.

```text
User
  -> Kamal (conversation interface)
  -> Dorje AI Orchestrator (intent, planning, routing)
  -> CEDA Platform
       -> Context OS
       -> Policy Engine
       -> Workspace Engine
       -> Connector Engine
       -> Reminder Engine
       -> Knowledge Engine
       -> Security Engine
       -> AI Agent Manager
  -> Local AI | Cloud AI | External Services
  -> Local Workspace | External Storage
  -> Windows | macOS | Linux
```

## 2.3 Platform layers

| Layer | Component | Responsibility |
| --- | --- | --- |
| L1 | Kamal | Conversation and voice interface |
| L2 | Dorje AI Orchestrator | Intent recognition, planning, and routing |
| L3 | CEDA | Context intelligence and adaptation |
| L4 | Context OS | Structured context management |
| L5 | Policy Engine | Privacy, permission, and governance |
| L6 | Workspace Manager | External knowledge locations and indexes |
| L7 | AI Agent Framework | Specialized, registered workers |
| L8 | Connector Framework | Governed external integrations |
| L9 | Knowledge Layer | Local, user, enterprise, and live knowledge |
| L10 | Security Layer | Encryption, vault, redaction, and audit |

## 2.4 Kamal

Kamal is the receptionist, not the intelligence or memory owner. It supports chat,
voice, document upload, attachments, quick commands, task requests, and temporary
conversation history. Kamal does not decide what to retain, which policy applies, or
which model runs. It sends requests to the Orchestrator and never communicates directly
with persistent storage. **ARCH-001**

## 2.5 Dorje AI Orchestrator

Every request passes through the Orchestrator. It performs intent detection, workflow
planning, model/tool/connector routing, policy lookup, context retrieval, agent
activation, and output validation. **ARCH-010**

Example: a LinkedIn request loads the social and career policies, retrieves only
allowed career context and referenced resume material, determines whether local
generation is sufficient, invokes the correct agent, validates the draft, and returns
it for approval.

## 2.6 CEDA

CEDA is the permanent intelligence layer: **Context Extraction, Decision & Adaptation
Architecture**. It continuously asks what happened, what matters, whether it may become
context, which policy governs it, whether approval or a reminder is required, and
whether a reversible preference update should be proposed. **CEDA-001**

## 2.7 CEDA lifecycle

```text
Interaction
  -> observation
  -> extraction
  -> classification
  -> policy evaluation
  -> confidence score
  -> user confirmation
  -> context creation
  -> encrypted instruction storage
  -> temporary data deletion
```

Temporary reasoning is never retained. Chat history is temporary unless the user
explicitly saves it. **CTX-005**

## 2.8 Context domains

CEDA maintains independently governed domains:

- **Academic:** courses, assignments, research, notes, grades, study habits.
- **Immigration:** passport, visa, I-20, SEVIS, CPT, OPT, STEM OPT, EAD, USCIS.
- **Career:** resumes, recruiters, networking, interviews, skills, portfolio.
- **Personal productivity:** goals, projects, calendar, tasks, habits.
- **Social:** LinkedIn, Medium, Instagram, Facebook, WhatsApp, Reddit.
- **Lotus & Dorje:** consulting, research, BI-CASA, CEDA, MVME, books, projects.

Cross-domain use is denied unless the applicable policy explicitly permits it.

## 2.9 Context Operating System

Context OS is structured memory, not chat history. It retains approved goals,
policies, preferences, relationships, deadlines, projects, knowledge references,
document pointers, reminder rules, and connector permissions. Unapproved or
non-durable content is discarded.

```text
Workspace -> Domain -> Project -> Context -> Instruction -> Action -> Reminder -> Policy
```

## 2.10 Policy Engine

Every context update and consequential action passes policy evaluation. Policies cover
academic, immigration, career, social, email, research, vault, connectors, cloud AI,
and offline mode. Policy decisions are explainable, auditable, and reversible.
**POL-001**

## 2.11 Workspace Manager

The Workspace Manager locates information but does not become a file-storage product.
It registers and indexes user-approved local folders, Google Drive, OneDrive,
SharePoint, NAS, external disks, and institutional folders. It manages metadata,
permissions, synchronization, and search while original documents remain in their
chosen location whenever possible. **WS-001**

## 2.12 Knowledge Engine

The Knowledge Engine merges three layers at request time:

1. **Permanent intelligence:** local models for reasoning, coding, writing, and vision.
2. **User knowledge:** approved context and indexed documents, projects, and policies.
3. **Live knowledge:** explicitly permitted retrieval from official or current sources.

The merged prompt is transient; live results are not silently promoted to durable
context.

## 2.13 AI Agent Framework

Academic, research, statistics, writing, immigration, career, resume, social, email,
scheduling, connector, security, policy, CEDA, BI-CASA, and MVME capabilities are
specialists registered with the Orchestrator. Each declares capabilities, tools,
policy requirements, data boundaries, confirmation rules, and validation contracts.
New agents do not require interface or architecture redesign.

## 2.14 Connector Framework

Connectors are plugins described by name, authentication method, permissions, scopes,
offline support, cloud requirements, allowed context, policy, status, and audit rules.
Google, Microsoft, Apple, university, storage, model, communication, and publishing
integrations all use the same contract. **CONN-001**

Email and document connectors use a governed workflow: authorized inbox content and
attachments may be read only through the connector service, summarized through the
orchestrator/CEDA layer, converted into editable documents, saved to approved cloud
or local destinations, and resent only after explicit confirmation. Gmail and Google
Docs are the first live implementation. Outlook, Apple Mail, OneDrive, SharePoint,
and Microsoft Word follow the same API contract when their provider OAuth flows are
activated.

## 2.15 Reminder Engine

Reminders are context-driven, not merely calendar events. Priority may incorporate
deadline, importance, effort, habits, dependencies, course weight, immigration timing,
and career goals. Complex work becomes staged preparation, research, drafting, review,
and submission suggestions. Creation or external calendar synchronization follows the
applicable confirmation policy.

## 2.16 Immigration Timeline Engine

This specialized CEDA module extracts only approved structured metadata and applies
versioned, configurable rule packs informed by official guidance. It tracks passport,
visa, I-20, SEVIS, CPT, OPT, STEM OPT, EAD, and USCIS milestones with source,
confidence, and verification status. Regulations and processing times are never
hard-coded as timeless facts. **IMM-001**

Every output states that it is informational, not legal advice, and must be verified
with the DSO, university, USCIS, or a qualified immigration attorney.

## 2.16.1 Decision Support Layer

The Decision Support Layer turns approved context, assumptions, and candidate actions
into explainable recommendations. It is not a replacement for CEDA or the Orchestrator:
it is a registered specialist capability invoked when the user asks for scenario
analysis, what-if comparisons, simulation, optimization, or ranked next steps.

The first implementation is local-first and deterministic:

- scenario records with unique IDs, owner, workspace, domain, assumptions, objective,
  constraints, policy decision reference, and audit events;
- what-if comparison of baseline assumptions against user-provided changes;
- Monte Carlo-style simulation for uncertainty/risk analysis;
- local greedy optimization for resource allocation under a budget;
- ranked recommendations with score, rationale, confirmation requirement, and no
  automatic side effects.

Enterprise-grade engines such as Apache Airflow, external LP/IP solvers, and
reinforcement-learning runtimes may be plugged in later behind the same API contract.
They must not bypass Policy Intelligence Engine evaluation, CEDA learning, tenant
isolation, user confirmation, or audit logging. **DSL-001**

## 2.17 Secure Vault

The vault protects passwords, API keys, OAuth credentials, certificates, and secrets.
Secrets are locally encrypted, masked, audited, excluded from model prompts, and never
sent to a cloud service without an explicit narrowly scoped authorization. OS keychain
integration is preferred for key wrapping and unlock operations. **SEC-001**

## 2.18 Security Engine

The Security Engine owns authentication, encryption, workspace permissions, policy
enforcement, redaction, audit, secure deletion, and zero-trust connector access.
Sensitive information is evaluated against policy before prompt construction or
external sharing.

## 2.19 Canonical data flow

```text
User
  -> Kamal
  -> Orchestrator
  -> Policy Engine
  -> CEDA
  -> Context Retrieval
  -> AI Agent
  -> Knowledge Retrieval
  -> Generation
  -> Validation
  -> User
  -> CEDA candidate update (policy and approval required)
```

## 2.20 System design principles

Every module must be reusable, modular, local-first, offline-capable, policy-aware,
explainable, user-controlled, connector-independent, lightweight, secure by default,
backward-compatible, and extensible.

## 2.21 Requirement traceability registry

| ID | Permanent requirement | Current status |
| --- | --- | --- |
| ARCH-001 | Kamal is the conversation layer only. | Implemented foundation |
| ARCH-010 | Every user request passes through the Orchestrator. | Partial; DorjeAI complete, Kamal migration in progress |
| CEDA-001 | All durable knowledge is represented as versioned Context Objects. | Implemented foundation |
| CEDA-002 | Every Context Object passes policy evaluation before persistence or use. | Implemented foundation |
| CEDA-003 | CEDA stores approved instructions and structured context, not raw conversation. | Implemented foundation |
| CEDA-004 | Temporary prompts and reasoning are discarded after bounded processing. | Partial; retention enforcement requires tests |
| CEDA-005 | Context relationships are maintained through the Context Graph. | Implemented foundation |
| CEDA-006 | Learning derives only from approval, corrections, and policy changes. | Approval foundation; learning engine planned |
| CEDA-007 | Adaptations are explainable, controlled, and reversible. | Planned |
| CEDA-008 | Modules use versioned CEDA events and stable APIs. | Persisted event/API foundation; distributed transport planned |
| CTX-005 | Chat history is temporary unless explicitly saved. | Implemented for Student-LAD |
| POL-001 | Every context update requires policy evaluation. | Implemented foundation |
| WS-001 | Original files remain in user-selected storage whenever possible. | Architecture contract; indexer planned |
| SEC-001 | Secrets never leave the device without explicit authorization. | Redaction/rejection implemented; OS keychain planned |
| IMM-001 | Immigration reminders use configurable official-guidance rule packs. | Reminder foundation implemented; rule-pack engine planned |
| CONN-001 | Integrations use the Connector Framework. | Existing Google connectors; common plugin contract evolving |
| AGENT-001 | Specialists register with the Orchestrator through one contract. | Agent registry implemented |
| KNOW-001 | Knowledge layers merge transiently under policy. | Local context implemented; governed live layer planned |
| REM-001 | Reminder creation is context-driven and confirmation-aware. | Suggestion foundation implemented |
| DSL-001 | Decision support uses governed scenarios, what-if analysis, simulation, optimization, recommendations, and audit before action. | Implemented foundation |

Status labels describe the current repository and must be updated with implementation
and tests. A requirement is not complete merely because it is documented.

## 2.22 Change governance

All future work must:

1. Cite affected requirement IDs in design notes, migration reports, and tests.
2. Extend shared packages before introducing edition-specific code.
3. Document new requirements with unique permanent IDs.
4. Preserve API/data migration paths for existing editions.
5. Record policy, privacy, and connector implications.
6. Never mark a requirement implemented without executable verification.
