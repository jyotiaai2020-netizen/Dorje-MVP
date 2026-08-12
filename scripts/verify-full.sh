#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Student-LAD full verification =="

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

echo "-- Frontend production build"
npm run build

echo "-- Full Playwright Chromium suite"
npx playwright test --project=chromium

echo "-- Full Playwright WebKit suite"
npx playwright test --project=webkit

echo "-- Accessibility and text visibility gates"
npx playwright test tests/e2e/text-visibility.spec.ts --project=chromium --project=webkit

echo "-- Offline/synchronization workflow gates"
npx playwright test \
  tests/e2e/staged-attachment.spec.ts \
  tests/e2e/connector-document-email.spec.ts \
  tests/e2e/workspace-ai-file-workflow.spec.ts \
  tests/e2e/workspace-tools-architecture.spec.ts \
  --project=chromium --project=webkit

echo "-- Frontend dependency security audit"
npm audit --audit-level=high

echo "-- Backend unittest suite"
cd "$ROOT_DIR/packages/platform/backend"
./.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v

echo "-- Database migration validation"
./.venv/bin/alembic current
./.venv/bin/alembic heads

echo "-- Backend dependency consistency"
./.venv/bin/python -m pip check

echo "-- Git diff check"
cd "$ROOT_DIR"
git diff --check

echo "Full verification complete."
