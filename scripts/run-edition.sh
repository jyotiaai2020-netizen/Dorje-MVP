#!/usr/bin/env bash
set -euo pipefail

EDITION="${1:-}"
case "$EDITION" in
  student) APP_TITLE="DorjeAI Student Edition"; FRONTEND_PORT=3100; BACKEND_PORT=8100 ;;
  *) echo "Usage: $0 student" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME="$ROOT/apps/$EDITION/runtime"
BACKEND="$ROOT/packages/platform/backend"
FRONTEND="$ROOT/packages/platform/frontend"
mkdir -p "$RUNTIME"/{database,storage,workspace,chats,reports,attachments,generated,exports,logs,settings,cache,embeddings,vectorstore}

export EDITION_ID="$EDITION"
export APP_NAME="$APP_TITLE API"
export WORKSPACE_NAME="$APP_TITLE"
export RUNTIME_ROOT="$RUNTIME"
export DATABASE_MODE="${DATABASE_MODE:-local}"
export DATABASE_URL="sqlite:///$RUNTIME/database/lotus.db"
export DATABASE_MIGRATION_URL="${DATABASE_MIGRATION_URL:-}"
export DATABASE_REQUIRE_MIGRATIONS="${DATABASE_REQUIRE_MIGRATIONS:-true}"
export UPLOADS_DIR="$RUNTIME/attachments"
export GENERATED_DIR="$RUNTIME/generated"
export EXPORTS_DIR="$RUNTIME/exports"
export LOGS_DIR="$RUNTIME/logs"
export CACHE_DIR="$RUNTIME/cache"
export VECTORSTORE_DIR="$RUNTIME/vectorstore"
export FRONTEND_URL="http://127.0.0.1:$FRONTEND_PORT"
export APP_URL="$FRONTEND_URL"
export GOOGLE_REDIRECT_URI="$FRONTEND_URL/api/oauth/google/callback"
export NEXT_PUBLIC_API_URL="http://127.0.0.1:$BACKEND_PORT"
export NEXT_PUBLIC_APP_TITLE="$APP_TITLE"

PYTHON_BIN="${PYTHON_BIN:-python3}"
(cd "$BACKEND" && "$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT") &
BACKEND_PID=$!
(cd "$FRONTEND" && npm run dev -- --hostname 127.0.0.1 --port "$FRONTEND_PORT") &
FRONTEND_PID=$!
trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true' EXIT INT TERM
wait
