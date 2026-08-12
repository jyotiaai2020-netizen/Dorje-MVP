# Definition of Done

Student-LAD work is complete only when implementation, data flow, tests, and documentation agree.

## Required for every change

- The requested behavior is implemented in the real app path, not only mocked copy.
- Voice and text commands follow the same action handler when the feature is voice-operable.
- Durable data passes through the correct CEDA, Context OS, PIE, WKIM, memory, or connector service.
- User-scoped data remains isolated across accounts.
- Sensitive information remains masked and policy-governed.
- Every new persistent record has a stable unique ID.
- Every create, update, delete, approval, denial, archive, connector, and settings mutation has an audit/log path.
- Existing UI routes remain readable in light and dark themes.
- No duplicate screen is introduced for an existing canonical function.

## Testing requirement

Add or update tests in the same change:

- Backend behavior: `packages/platform/backend/tests/test_*.py`
- Frontend workflows: `packages/platform/frontend/tests/e2e/*.spec.ts`
- Text visibility or layout-sensitive UI: update `text-visibility.spec.ts` coverage if a new route/tab is added.

Run:

```bash
scripts/verify-fast.sh
scripts/verify-full.sh
```

`verify-fast.sh` is the authoritative repair-cycle command. It must exit `0` only when focused backend tests, frontend lint, TypeScript checking, action-engine/Kamal workflows, changed-package workflows, and dependency consistency pass.

`verify-full.sh` is the authoritative PR-readiness command. It must exit `0` only when the full backend suite, frontend production build, Chromium and WebKit Playwright tests, accessibility/text-visibility gates, database migration validation, offline/synchronization workflows, security/dependency checks, and diff validation pass.

GitHub Actions is the independent merge judge. A PR is not ready to merge until these required checks pass:

- `backend-tests`
- `frontend-quality`
- `action-engine`
- `e2e-chromium`
- `e2e-webkit`
- `accessibility`
- `offline-sync`
- `security`

See `docs/BRANCH_PROTECTION.md` for branch protection setup.

If full verification cannot run, document why, what was run, and what remains unverified.


## Agent-role completion controls

A task involving multiple Codex agents or automation is not complete until role boundaries are preserved:

- Planner changes are limited to requirements, architecture, acceptance criteria, or documentation.
- Implementer changes are limited to the accepted feature scope.
- Test-agent changes add or repair tests and may update test fixtures, but must not silently change product behavior.
- Reviewer produces review findings only and does not mutate code.
- CI repair agent fixes one failing check on a repair branch and documents the failure signature.
- Release gate confirms checks and release notes only; it does not merge automatically.

If concurrent write work was needed, the final handoff must identify the worktrees/branches used and confirm that no two write-capable agents edited the same checkout simultaneously.


## Executable-spec issue requirement

Material feature work must reference one vertical GitHub issue that acts as the executable specification. The issue must define user story, included/excluded scope, acceptance criteria, test commands, security requirements, UI evidence, and definition of done.

Do not close an issue until:

- The linked PR passes required checks.
- UI evidence is attached or documented.
- Security and approval requirements are verified.
- Any bounded Codex repair PRs are merged into the feature branch or closed as not needed.
- Human-gate items are complete or explicitly documented as deferred.

## Handoff requirement

Final handoff must include:

- Files changed.
- Tests run and pass/fail counts.
- Known limitations.
- Whether the branch is clean, pushed, and merged.
