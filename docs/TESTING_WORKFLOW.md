# Automated Testing Workflow

Tests are maintained with the feature they protect. Every application change must add or update a pytest or Playwright case and keep it visible in VS Code's Testing panel.

## VS Code Test Explorer

Install the recommended **Python** and **Playwright Test for VS Code** extensions, then open the repository root. The Testing panel discovers:

- all backend tests under `packages/platform/backend/tests/`;
- all browser tests under `packages/platform/frontend/tests/e2e/`;
- Chromium and WebKit projects defined by Playwright.

Python discovery refreshes whenever a test file is saved. Use **Testing: Refresh Tests** if a newly created Playwright file has not appeared yet.

If the Testing panel shows only frontend or shared folders, open `DORJE-Platform.code-workspace` instead of the parent `lotus-platform` folder, then run **Python: Select Interpreter** for **Student Backend Tests** and choose:

```text
packages/platform/backend/.venv/bin/python
```

Then run **Python: Discover Tests** or **Developer: Reload Window**. Backend discovery is configured in both the root workspace settings and `packages/platform/backend/.vscode/settings.json`.

## Required routine for each change

1. Add or update the regression test with the implementation.
2. Run the affected test from Test Explorer while developing.
   For UI changes, run `text-visibility.spec.ts` and add any new route or tab to its coverage list.
3. After the implementation is changed, run **Terminal → Run Task → Tests: Full validation**. This always runs all existing and newly added tests, not only the affected test.
4. Diagnose and resolve every regression caused by the change, then repeat full validation until all stages pass.
5. Record passing test counts and disclose anything that remains manual or untested.

## Commands

```bash
cd /Users/mayanshkadian/LotusAI/lotus-api/Student-LAD
npm run test:all

# Focused backend run when developing services:
cd packages/platform/backend
./.venv/bin/python -m pytest tests -q
```

The full validation task runs these checks in sequence so a later stage does not hide an earlier failure:

1. backend pytest suite;
2. frontend lint;
3. frontend production build;
4. live dev-port health check for backend `8100` and frontend `3100`;
5. Playwright Chromium and WebKit e2e suites.

The dev-port health check is part of regression coverage. A frontend process may
own port `3100` but still be stale or unresponsive; `npm run test:ports` verifies
that `/login` actually responds and that backend `/api/v1/health` is healthy.

## Student-LAD route and adapter coverage

Current Student-LAD shell changes are covered by:

- `tests/test_student_lad_architecture.py` for deterministic fast-path
  ActionDrafts, expanded command classification, and calendar conflict checks.
- `tests/e2e/student-route-architecture.spec.ts` for independent Student-LAD
  module routes and authenticated root redirection into `/student-lad`.

When adding a new sidebar module, add both its route file under
`app/student-lad/<module>/page.tsx` and a Playwright assertion that the module
opens from its direct URL.

## Orchestration routing test coverage

Tier/device orchestration changes are covered by:

- `tests/test_tier_policy.py`
- `tests/test_device_profile.py`
- `tests/test_orchestration_routing_services.py`
- `tests/test_memory_policy.py`
- `tests/test_upload_policy.py`
- `tests/test_model_residency.py`
- `tests/test_decision_support.py`
- `tests/e2e/kamal-reminder.spec.ts`
- `tests/e2e/calendar-timeline.spec.ts`
- `tests/e2e/workspace-ai-file-workflow.spec.ts`

These tests protect capability gating, device residency rules, connectivity
rules, task complexity classification, fast-path bypass behavior, safe
calculation handling, context budgeting, memory-class rules, tier-aware upload
limits, resident/lazy/disabled model decisions, and Kamal reminder commands that
must update Calendar & Timeline before optional external calendar sync. The
calendar tests also verify that Calendar, Timeline, Agenda, and Milestones are
functional views over the same CEDA reminder source, that direct add/edit/delete
operations call the reminder API, that compact holiday/reminder/priority symbols
remain visible and accessible, and that the 1999–2100 year
range is enforced, and that United States holidays render in the calendar.

`tests/e2e/workspace-ai-file-workflow.spec.ts` also protects Workspace AI composer
data-entry behavior, including JASP/LaTeX statistical table paste normalization
into clean table-formatted composer content.

`tests/test_decision_support.py` protects the Decision Support Layer: scenario
creation, what-if assumption comparison, Monte Carlo-style simulation metrics,
local optimization, ranked recommendations, and tenant isolation.
