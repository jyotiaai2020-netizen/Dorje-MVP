# Dorje MVP

Dorje MVP combines the **Student-LAD Core** with the **DorjeFlow Experience** in one testable repository.

- `packages/platform/backend` is the authoritative FastAPI, SQLite/PostgreSQL, CEDA, Context OS, memory, policy, connector, and verified-action core.
- `experience/dorjeflow` is the responsive phone/laptop experience exported from DorjeFlow.
- `packages/platform/frontend` is the existing Student-LAD Next.js interface, retained as a legacy/reference client during migration.

The LLM is never treated as the source of truth. A task mutation is shown as verified only after the Student-LAD API accepts the write and the client refreshes authoritative state.

## Quick start in VS Code

Prerequisites: Node.js 22+, Python 3.11+, and Git.

```bash
git clone https://github.com/jyotiaai2020-netizen/Dorje-MVP.git
cd Dorje-MVP
git switch agent/student-lad-core-dorjeflow-experience

python -m venv packages/platform/backend/.venv
packages/platform/backend/.venv/bin/pip install -r packages/platform/backend/requirements.txt
npm --prefix experience/dorjeflow install
```

Terminal 1:

```bash
cd packages/platform/backend
./.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

Terminal 2:

```bash
npm run experience:dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). Create a local account, or choose the clearly labeled offline demo. Offline demo data stays in browser storage and is never presented as authoritative completion.

## Docker MVP

Create a `.env` file containing secure `SECRET_KEY` and `TOKEN_ENCRYPTION_KEY` values, then run `docker compose up --build`.

- DorjeFlow MVP: `http://localhost:3100`
- Student-LAD API: `http://localhost:8100`
- Legacy Next.js client: `http://localhost:3101`

## Runtime choices

`experience/dorjeflow/.env.example` documents the adapter switch:

- `VITE_RUNTIME_PROVIDER=student-lad` (default): local/hybrid Student-LAD core.
- `VITE_RUNTIME_PROVIDER=base44`: original Base44-hosted DorjeFlow backend.

The active Student-LAD adapter currently covers authentication, authoritative task reads/writes, and Kamal preview/execute/undo contracts. DorjeFlow document, email, and cloud-drive functions remain Base44-only and fail closed in Student-LAD mode until each connector is mapped and verified.

## Validation

Run `npm run mvp:check`. For the full inherited Student-LAD verification suite, see `AGENTS.md` and `docs/TESTING_WORKFLOW.md`.

## Imported sources

- Student-LAD core snapshot: source repository `jyotiaai2020-netizen/Student-LAD`, imported from `main`.
- DorjeFlow experience snapshot: Base44 app `6a7b7d9a84dfb3f3151acf4d`.

The older `imports/` prototype and nonessential demo videos/favicon were intentionally not copied. This keeps the MVP source-focused and avoids carrying a second obsolete experience implementation.
