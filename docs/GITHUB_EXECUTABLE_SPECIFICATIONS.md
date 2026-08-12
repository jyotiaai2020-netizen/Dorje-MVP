# GitHub Issues as Executable Specifications

Student-LAD uses GitHub issues as executable specifications. Each issue must represent one vertical capability with a clear user story, scope boundary, acceptance criteria, test commands, security requirements, UI evidence, and definition of done.

Do not create broad issues such as "finish Kamal". Create small vertical issues that can be implemented, tested, reviewed, and closed independently.

## Required issue structure

Every vertical capability issue must contain:

- User story.
- Included scope.
- Excluded scope.
- Exact acceptance criteria.
- Test commands.
- Security and approval requirements.
- UI evidence required.
- Definition of done.

Use `.github/ISSUE_TEMPLATE/vertical-capability.yml` for new capability issues.

## Recommended vertical sequence

The initial executable-spec issues have been created in GitHub:

1. #11 — Canonical Action Engine contract.
2. #12 — Safe record resolution and preview.
3. #13 — Health appointment update workflow.
4. #14 — Local persistent Kamal conversations.
5. #15 — Undo and append-only lineage.
6. #16 — Offline event queue.
7. #17 — Cloud synchronization and conflict resolution.
8. #18 — Voice registry with four profiles.
9. #19 — Emotional interaction state.
10. #20 — Senior Simple Mode.
11. #21 — Cross-department CRUD.
12. #22 — Production observability and security.

Existing architecture, security, decision-support, and observability issues may remain broader roadmap issues, but implementation work should be split into vertical executable-spec issues before coding begins.

## Three nested operating loops

### 1. VS Code loop

Use this loop while implementing locally:

1. Select one executable-spec issue.
2. Create or switch to a feature branch/worktree.
3. Implement the smallest scoped change.
4. Add or update tests with the change.
5. Run `scripts/verify-fast.sh` until the feature passes.
6. Stop after repeated identical failures and report the blocker.

### 2. GitHub loop

Use this loop after pushing work:

1. Open or update the PR linked to the executable-spec issue.
2. GitHub Actions runs the complete suite.
3. Codex review checks architecture, safety, accessibility, and regression risk.
4. If CI fails, the bounded Codex autofix workflow may create/update a draft repair PR.
5. Repair attempts stop at the configured limit and never merge automatically.

### 3. Human gate

A human must review consequential behavior before merge/release:

- Accessibility and Senior Simple Mode.
- Physical-device voice quality.
- Privacy and sensitive-data handling.
- Confirmation flows for delete, send, submit, share, publish, payment, or sync.
- Migrations and data compatibility.
- Deployment or release notes.

## First vertical slice

The first implementation vertical is the health appointment update workflow:

> "Kamal, change my doctor's appointment from Tuesday at 2 PM to Thursday at 4 PM."

This must exercise the canonical Action Engine contract, safe record resolution, preview, confirmation, local update, undo, append-only lineage, offline persistence, and cloud-sync queue handoff.

Once this vertical passes the full loop, reuse the same Action Engine contract across Academic, Immigration, Career, Family, Finance, Travel, and Enterprise departments.
