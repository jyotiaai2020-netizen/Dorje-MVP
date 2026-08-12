# DorjeAI / Student-LAD Agent Instructions

## Objective

Develop Student-LAD as a local-first, accessible, secure, governed, voice/text-to-action application built on the Dorje AI platform.

Student-LAD must feel simple on the surface and intelligent underneath:

- Kamal helps the user operate the application.
- Workspace AI / Dorje Chat handles deeper AI work.
- CEDA extracts, governs, and evolves approved context.
- Context OS stores structured meaning and relationships.
- PIE enforces user-owned policy decisions.
- WKIM manages knowledge references without becoming a file manager.

## Repository structure

Important paths:

- `packages/platform/frontend/` — Next.js Student-LAD and Workspace AI frontend.
- `packages/platform/frontend/app/student-lad/` — Student-LAD app routes and pages.
- `packages/platform/frontend/components/` — shared UI, Kamal, DorjeAI, Student-LAD shell, connector panels.
- `packages/platform/frontend/components/KamalChat.tsx` — global Kamal voice/text assistant.
- `packages/platform/frontend/tests/e2e/` — Playwright tests discoverable by VS Code Test Explorer.
- `packages/platform/backend/` — FastAPI backend.
- `packages/platform/backend/app/api/v1/` — API routes.
- `packages/platform/backend/app/services/` — CEDA, memory, policy, device, orchestration, WKIM, connectors, and supporting services.
- `packages/platform/backend/tests/` — backend unit/integration tests discoverable by pytest/unittest.
- `docs/` — durable architecture, testing, memory, CEDA, database, and operations documentation.
- `scripts/verify-fast.sh` — fast local verification.
- `scripts/verify-full.sh` — full local verification.
- `.github/workflows/` — GitHub CI/review workflows.

## Frontend commands

Run from `packages/platform/frontend/`:

```bash
npm install
npm run dev
npm run lint
npm run build
npx playwright test --project=chromium
npx playwright test tests/e2e/kamal-reminder.spec.ts --project=chromium
```

Default frontend development port:

```text
http://127.0.0.1:3100
```

## Backend commands

Run from `packages/platform/backend/`:

```bash
./.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
./.venv/bin/python -m unittest tests.test_ceda_service tests.test_ceda_structured tests.test_tenant_rbac -v
```

Default backend development port:

```text
http://127.0.0.1:8100
```

If the virtual environment does not exist, create it deliberately and install backend requirements before running tests.

## Repository verification commands

Run from the repository root:

```bash
scripts/verify-fast.sh
scripts/verify-full.sh
```

Use `verify-fast.sh` for every repair cycle. It is the authoritative focused gate and must return exit code `0` only when frontend lint, TypeScript checking, affected Playwright workflows, focused backend action-engine tests, and dependency consistency pass.

Use `verify-full.sh` before opening or marking a PR ready. It is the authoritative completion gate and must return exit code `0` only when the full backend suite, frontend production build, Chromium and WebKit Playwright suites, accessibility/text-visibility gates, database migration validation, offline/synchronization workflow tests, security/dependency checks, and diff validation pass.

GitHub Actions is the independent judge for merge readiness. The `main` branch must require these checks before merge:

- `backend-tests`
- `frontend-quality`
- `action-engine`
- `e2e-chromium`
- `e2e-webkit`
- `accessibility`
- `offline-sync`
- `security`

See `docs/BRANCH_PROTECTION.md`.



## GitHub issues as executable specifications

Use GitHub issues as executable specifications. Create one issue per vertical capability, not one issue for a broad area such as "finish Kamal."

Each capability issue must include:

- User story.
- Included scope.
- Excluded scope.
- Exact acceptance criteria.
- Test commands.
- Security and approval requirements.
- UI evidence required.
- Definition of done.

Preferred capability sequence:

1. Canonical Action Engine contract.
2. Safe record resolution and preview.
3. Health appointment update workflow.
4. Local persistent Kamal conversations.
5. Undo and append-only lineage.
6. Offline event queue.
7. Cloud synchronization and conflict resolution.
8. Voice registry with four profiles.
9. Emotional interaction state.
10. Senior Simple Mode.
11. Cross-department CRUD.
12. Production observability and security.

Use three nested loops:

- VS Code loop: implement and run `scripts/verify-fast.sh` until the selected capability passes.
- GitHub loop: run complete CI, Codex review, and bounded repair through GitHub Actions.
- Human gate: review consequential behavior, accessibility, privacy, physical-device voice quality, migrations, and deployment.

The first implementation vertical should be the doctor-appointment workflow. After it passes the full loop, reuse the same Action Engine contract across Academic, Immigration, Career, Family, Finance, Travel, and Enterprise departments.

See `docs/GITHUB_EXECUTABLE_SPECIFICATIONS.md`.

## Agent responsibilities and worktree isolation

Use separate Git worktrees when concurrent agents or automation might otherwise edit the same checkout. Do not run multiple write-capable roles in the same working tree at the same time.

| Agent role | Responsibility | Write access |
| --- | --- | --- |
| Planner | Requirements, architecture, acceptance criteria, risk framing, and task decomposition. | Documentation only. |
| Implementer | The smallest scoped code change needed to satisfy the accepted plan. | Feature worktree only. |
| Test agent | Test creation, failure reproduction, and verification notes. | Same feature branch, sequentially after implementation changes. |
| Reviewer | Diff review, regression review, security review, accessibility review, and architecture-boundary review. | Read-only. |
| CI repair agent | Fix one specific failing check from CI logs. | Dedicated repair branch/worktree only. |
| Release gate | Confirm checks, summarize release risk, and prepare release notes. | No automatic merge. |

Required operating rules:

- Planner and Reviewer roles must not edit app code.
- Implementer and Test agent may share a branch, but should work sequentially unless their touched files are explicitly disjoint.
- CI repair work must stay on a `codex-autofix/*` repair branch and must target one failure signature at a time.
- Release gate must never merge, deploy, or bypass required checks.
- If two agents need to write at once, create separate worktrees before work begins.
- Before committing, compare touched files against the assigned role. If the role exceeded its boundary, revert or split the change.

Example worktree pattern:

```bash
git worktree add ../Student-LAD-feature feature/kamal-action-engine
git worktree add ../Student-LAD-review feature/kamal-action-engine
git worktree add ../Student-LAD-repair codex-autofix/kamal-action-engine
```

## Architecture boundaries

Maintain these boundaries unless the user explicitly requests an architecture change and documentation/tests are updated with it.

### Kamal

Kamal is Student-LAD's personal application-operation assistant.

Kamal may:

- Navigate the app.
- Explain the current screen.
- Run voice/text commands.
- Create, update, remove, and query user records through governed handlers.
- Create, update, complete, archive, and delete reminders/tasks after confirmation.
- Approve, deny, archive, or delete CEDA review items after confirmation.
- Change user settings after confirmation.
- Prepare handoffs to Workspace AI or connectors.

Kamal must not:

- Pretend to complete an action before the API/action handler succeeds.
- Bypass confirmation for destructive or external actions.
- Replace Workspace AI for deep document analysis, reports, long writing, charts, or research.
- Invent user data when approved CEDA/Context OS data is unavailable.

### Workspace AI / Dorje Chat

Workspace AI handles:

- Document analysis.
- Research and extended reasoning.
- Reports and long-form writing.
- Tables, charts, statistics, analytics, and generated files.
- Connector-backed document/email workflows.
- Multi-agent and model-routed workflows.

Do not move Workspace AI responsibilities into Kamal unless the change is explicitly requested.

### CEDA

CEDA is not chat history. CEDA is the governed context extraction and adaptation loop.

Durable memory/context must follow:

```text
Capture → Understand → Link → Evaluate → Decide → Act → Learn → Update Context
```

Rules:

- Store distilled conclusions, structured metadata, relationships, references, user choices, and approved context.
- Do not store raw chat as durable memory by default.
- Pending context cannot be used for generation.
- Denied, archived, deleted, superseded, expired, or out-of-policy context cannot be retrieved as active context.
- Sensitive information requires explicit confirmation and masking.

### Context OS

Context OS stores structured meaning, not files and not raw conversations.

Every context object must have:

- Stable unique ID.
- Owner/user/tenant boundary.
- Domain.
- Status/lifecycle.
- Policy binding.
- Source reference.
- Confidence.
- Version/audit trail when changed.

### PIE

The Policy Intelligence Engine governs:

- Context creation and retrieval.
- Retention and deletion.
- Connector access.
- AI model routing.
- Cloud use.
- Sharing, sending, publishing, payment, and destructive actions.

Do not implement independent authorization logic when the decision belongs in PIE.

### WKIM

WKIM manages knowledge locations, references, metadata, indexing, and source catalog entries.

WKIM must not become a replacement file manager. Prefer references over duplication.

## Testing requirements

Every behavior change, bug fix, API change, migration, or UI interaction must include or update automated regression tests in the same change.

Required test placement:

- Backend behavior: `packages/platform/backend/tests/test_*.py`
- Frontend workflows: `packages/platform/frontend/tests/e2e/*.spec.ts`
- Text visibility/layout coverage: `packages/platform/frontend/tests/e2e/text-visibility.spec.ts`

Required verification for every material change:

1. Run frontend lint.
2. Run TypeScript checking.
3. Run backend tests relevant to the change.
4. Run affected unit/integration tests.
5. Run Playwright tests for affected user workflows.
6. Run `scripts/verify-fast.sh` on every repair cycle.
7. Run `scripts/verify-full.sh` before PR readiness or merge handoff.
8. Review the final diff for unrelated changes.

Never:

- Commit `test.only`, `describe.only`, accidental `test.skip`, or pytest skips unless explicitly documented.
- Weaken a failing test merely to make CI pass.
- Delete obsolete tests without replacing the coverage.
- Declare completion while known required tests are failing.

## Security and approval rules

Never bypass confirmation for:

- Delete.
- Archive when user data is affected.
- Send.
- Submit.
- Share.
- Publish.
- Payment.
- External calendar/email/connector actions.
- Secure Vault access.
- Cloud model use with sensitive context.

Never:

- Push directly to `main`.
- Auto-approve extracted CEDA records.
- Expose credentials, OAuth tokens, secrets, personal data, immigration identifiers, medical details, or payment details in logs.
- Send secrets or sensitive memory to cloud models without explicit user permission.
- Change database migrations without reviewing backward compatibility.
- Merge or deploy automatically.
- Reset, discard, or overwrite user work without explicit approval.

All user data mutations must be:

- User-scoped.
- Policy-aware.
- Confirmed when sensitive/destructive/external.
- Logged or auditable.
- Reflected in UI data refresh paths.

## Files and areas to avoid changing unless explicitly required

Do not change these casually:

- `.env`, `.env.*`, secrets, OAuth credentials, or token files.
- Production deployment settings.
- Database migrations and schema bootstrapping.
- Authentication/session/security code.
- Connector OAuth scopes and redirect URI logic.
- Existing tests unrelated to the current task.
- Generated artifacts, caches, Playwright reports, screenshots, videos, or trace zips.
- User data stores, local databases, and workspace folders.

If a requested change requires touching one of these, state why and keep the diff minimal.

## Definition of resolved

A task is resolved only when:

- The user-facing issue is corrected in the real app path.
- Acceptance criteria are demonstrated.
- Relevant tests pass.
- No new lint, type, or syntax errors exist.
- The diff contains no unrelated changes.
- Documentation is updated when architecture, workflow, command behavior, or verification expectations change.
- Remaining risks, manual tests, and unverified items are documented.
- Git status is reported accurately, including uncommitted files and ahead/behind state when relevant.

For the detailed checklist, see:

- `docs/DEFINITION_OF_DONE.md`
- `docs/ARCHITECTURE_GUARDRAILS.md`
- `docs/KAMAL_ACCEPTANCE_TESTS.md`
- `docs/TESTING_WORKFLOW.md`

## How to report blockers

When blocked, report:

- What you tried.
- Exact command or workflow that failed.
- Error output or observed behavior.
- Whether the blocker is local setup, missing dependency, missing credential, failing test, unclear requirement, permission boundary, or external service issue.
- Safe next options.
- What remains unverified.

Do not hide blockers behind vague language. Be concrete and concise.

## Completion response format

Final handoff should include:

- Outcome.
- Key files changed.
- Tests run with counts/results.
- Any limitations or follow-up needed.
- Git status if the user asked about commit/push/merge state.
