#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Student-LAD fast verification =="

if [[ ! -x "$ROOT_DIR/packages/platform/backend/.venv/bin/python" ]]; then
  echo "Backend virtual environment is missing: packages/platform/backend/.venv" >&2
  echo "Create it and install requirements before running verification." >&2
  exit 1
fi

echo "-- Frontend lint"
cd "$ROOT_DIR/packages/platform/frontend"
npm run lint

echo "-- Frontend TypeScript checking"
npm run typecheck

echo "-- Kamal command regression"
npx playwright test tests/e2e/kamal-reminder.spec.ts --project=chromium

echo "-- Frontend changed-action workflow tests"
npx playwright test \
  tests/e2e/chat-load-smoke.spec.ts \
  tests/e2e/calendar-timeline.spec.ts \
  tests/e2e/context-os-management.spec.ts \
  tests/e2e/student-settings.spec.ts \
  --project=chromium

echo "-- Backend focused action-engine tests"
cd "$ROOT_DIR/packages/platform/backend"
./.venv/bin/python -m unittest \
  tests.test_ceda_service \
  tests.test_ceda_structured \
  tests.test_context_graph_service \
  tests.test_kamal_action_engine \
  tests.test_memory_architecture \
  tests.test_policy_intelligence \
  tests.test_suggestions \
  tests.test_tenant_rbac -v

echo "-- Backend dependency consistency"
./.venv/bin/python -m pip check

echo "Fast verification complete."
