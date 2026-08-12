# DORJE Platform Migration Report

Generated: 2026-07-04 (America/New_York)

## Paths

- Original project: `/Users/mayanshkadian/LotusAI/lotus-api/lotus-platform`
- Exact backup: `/Users/mayanshkadian/LotusAI/lotus-api/DORJE-Platform/Version1.0-Backup`
- New monorepo: `/Users/mayanshkadian/LotusAI/lotus-api/DORJE-Platform`
- Student app: `apps/student`
- Professional app: `apps/professional`
- Enterprise app: `apps/enterprise`
- Shared application code: `packages/platform`
- Shared model references: `shared-models`

## Baseline preservation

- Source project was read but not changed by the migration operation.
- Backup was created with APFS copy-on-write cloning.
- Source count: **152,431 files**, **16,363 directories**.
- Backup count: **152,431 files**, **16,363 directories**.
- `rsync --checksum --delete --dry-run` produced no differences.
- The backup includes the source Git metadata, current tracked modifications, untracked
  Version1.0 tree, assets, configuration, databases, dependency directories, and runtime data.

## Monorepo architecture

The new product uses one shared frontend/backend implementation instead of three code copies.
Edition folders contain identity, ports, environment configuration, and isolated runtime data.

| Edition | Display name | Frontend | Backend | Runtime |
|---|---|---:|---:|---|
| Student | DorjeAI Student Edition | 3100 | 8100 | `apps/student/runtime` |
| Professional | DorjeAI Professional Edition | 3200 | 8200 | `apps/professional/runtime` |
| Enterprise | DorjeAI Enterprise Edition | 3300 | 8300 | `apps/enterprise/runtime` |

Shared package boundaries are documented for UI, orchestration, RAG, connectors, analytics,
authentication, and exports. Existing business logic remains in `packages/platform` to avoid a
risky refactor during migration.

## Runtime isolation

Each edition owns independent directories for:

- SQLite database
- storage and workspace
- chat data
- reports and attachments/uploads
- generated images and charts
- exports and logs
- settings and cache
- embeddings and vector store

All three databases were initialized independently through Alembic and have distinct filesystem
inodes. Browser-side state is isolated by the distinct frontend ports/origins.

## Shared models

Model binaries were not copied. The monorepo references:

- Ollama: `/Users/mayanshkadian/.ollama` (6.9 GB at migration time)
- Hugging Face: `/Users/mayanshkadian/.cache/huggingface` (9.4 GB)
- Whisper: `/Users/mayanshkadian/.cache/whisper` (72 MB)

Deployments can override model/cache environment variables without changing application code.

## Configuration changes in the new monorepo only

- Added edition ID and workspace title settings.
- Added configurable runtime, upload, generated asset, export, log, cache, and vector-store roots.
- Updated document, analytics, and image-job storage to honor the edition runtime root.
- Added edition-aware frontend titles.
- Added independent local ports and Docker services/volumes.
- Added `scripts/run-edition.sh` for selecting an edition.
- OAuth secrets were not copied into edition configurations; use ignored `.env.local` files or a
  production secret manager.

## Verification

- Exact backup file/folder counts: **passed**.
- Byte-level backup checksum comparison: **passed**.
- Required source, assets, schemas, routes, prompts, templates, connectors, exports, and tests are
  present in the exact backup: **passed**.
- Shared backend Python compilation: **passed**.
- Alembic initialization for all three SQLite databases: **passed**.
- Backend application import: **passed**.
- Health endpoint: **200**, `{"status":"healthy"}`.
- OpenAPI generation: **passed**, 53 routes.
- Frontend ESLint: **passed**.
- Frontend production build and TypeScript validation: **passed**.
- Static/dynamic route generation: **passed**, including dashboard, authentication, Dorje AI,
  connectors, templates, organizations, reports, and operations guide.
- Shell launcher syntax: **passed**.
- Docker Compose YAML structure: **passed** (6 services, 3 isolated runtime volumes).

## Warnings

- Docker CLI is not installed on this workstation, so containers were not built or launched.
  Compose configuration was parsed and structurally validated with YAML tooling.
- The baseline working tree already contained tracked modifications and an untracked `Version1.0`
  directory. The backup intentionally preserves that exact state.
- Google OAuth redirect URIs must be registered separately for ports 3100, 3200, and 3300 before
  connector testing in each edition.
- NotebookLM Enterprise, Gemini/AI Studio, Photos, and YouTube may require additional Google Cloud
  APIs, verification, licensing, scopes, or quota configuration.
