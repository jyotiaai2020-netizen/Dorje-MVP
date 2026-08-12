# Architecture Guardrails

These guardrails keep Student-LAD aligned with the Dorje AI platform architecture.


## Agent and worktree governance

Student-LAD development must separate planning, implementation, testing, review, CI repair, and release-gate responsibilities. Use separate Git worktrees for concurrent write-capable work so agents do not overwrite each other or mix unrelated changes.

Role boundaries:

- Planner: documentation, architecture, acceptance criteria, and risk notes only.
- Implementer: smallest scoped application or backend change on a feature worktree.
- Test agent: tests and reproducibility updates, sequentially on the same feature branch.
- Reviewer: read-only diff, regression, security, accessibility, and architecture review.
- CI repair agent: one failing CI signature on a dedicated repair branch.
- Release gate: check confirmation and release notes; never automatic merge.

Every automated repair must preserve these boundaries and obey the bounded Codex autofix workflow controls.

## Assistant boundaries

- Kamal controls the application: navigation, voice/text commands, quick actions, reminders, confirmations, guided tour, and handoffs.
- Workspace AI performs deep analysis: documents, research, reports, charts, tables, emails, social drafts, generated files, and multi-agent workflows.
- CEDA transforms interactions into structured, policy-approved context. It does not store raw chat by default.

## CEDA and memory

- Follow: Capture → Understand → Link → Evaluate → Decide → Act → Learn → Update Context.
- Store distilled conclusions, not raw transcripts.
- Pending context cannot be used until approved.
- Denied, archived, deleted, superseded, expired, or out-of-policy context cannot be retrieved for generation.
- User feedback should create or update memory candidates, not silently retrain behavior.

## Data storage

- Use structured tables for records, audit events, versioning, and relationships.
- Every table entry must have a unique ID suitable for later reference.
- Every relationship must be explicit: source ID, target ID, relationship type, metadata, created timestamp.
- Context Graph APIs should expose graph behavior without forcing a graph database where relationship tables are sufficient.

## Policy

- PIE evaluates create/read/update/delete/archive/share/publish/send-to-AI connector and model access.
- Sensitive actions require confirmation.
- Cloud model use, connector access, external sending, publishing, deletion, and secure vault access must never happen silently.

## Workspace and files

- WKIM manages knowledge locations, not files.
- Original documents stay in user-selected storage whenever possible.
- Uploaded or connected files should create source references and extraction batches before approved context.
- Raw RTF/OCR/parser noise must not become user-facing context.

## UI consistency

- Reuse canonical routes and components.
- Use the same icon, text, row/table, action-symbol, and hover behavior patterns across modules.
- Avoid duplicate cards or repeated explanatory text.
- Keep action buttons functional and backed by data.

## Voice operation

- Voice and text commands must share parsers and action handlers.
- A successful spoken confirmation must cause the same data mutation as clicking the equivalent UI button.
- Kamal may explain, but it must not claim completion until the app returns success.
