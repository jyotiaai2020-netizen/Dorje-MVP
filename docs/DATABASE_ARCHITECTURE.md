# Student-LAD Database Architecture

Student-LAD uses the FastAPI backend as the trusted application boundary. The
frontend must not connect directly to Supabase tables. Authentication, tenant
authorization, CEDA governance, validation, audit logging, and persistence all
flow through FastAPI and SQLAlchemy.

## Modes

```text
Local/offline: FastAPI → SQLAlchemy → SQLite
Cloud/SaaS:    FastAPI → SQLAlchemy/psycopg → Supabase PostgreSQL
Test:          FastAPI → isolated test database
```

Set the mode with `DATABASE_MODE`:

- `local` — desktop, offline, development, and single-user runtime.
- `cloud` — Supabase-managed PostgreSQL for SaaS, concurrency, and tenancy.
- `test` — isolated test databases.

`DATABASE_URL` is the application runtime connection. `DATABASE_MIGRATION_URL` is
the administrative connection used for Alembic, backups, and restoration. Never
commit or log full URLs with credentials.

## Supabase connection choices

For a persistent FastAPI server or long-running container, prefer a direct
PostgreSQL connection if the deployment supports IPv6. If the host is IPv4-only,
use Supavisor session mode. Use conservative SQLAlchemy pooling.

For serverless or rapidly scaling backends, use Supavisor transaction mode and a
very small app-side pool or `NullPool`; do not rely on session-scoped database
state.

Examples must use placeholders only:

```text
postgresql+psycopg://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require
postgresql+psycopg://postgres.[PROJECT-REF]:[PASSWORD]@aws-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
postgresql+psycopg://postgres.[PROJECT-REF]:[PASSWORD]@aws-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
```

## Current repository audit

1. SQLAlchemy-managed tables currently include `organizations`, `users`,
   `projects`, `reports`, `refresh_tokens`, `user_connectors`, `oauth_states`,
   `audit_events`, `user_settings`, and the memory architecture tables.
2. Direct SQLite persistence remains in CEDA-related services:
   `ceda_service.py`, `ceda_structured_service.py`, and
   `context_graph_service.py`.
3. SQLite-specific statements currently include `PRAGMA`, `sqlite_master`,
   `INSERT OR IGNORE`, `INSERT OR REPLACE`, positional `?` parameters, runtime
   `ALTER TABLE`, and `_ensure_column` schema mutation.
4. Most SQLAlchemy SaaS tables have user or organization ownership. CEDA's
   separate local SQLite tables are user-scoped but not yet organization/workspace
   scoped consistently.
5. Alembic has migrations through `20260712_0005_memory_architecture`. Alembic
   now reads `DATABASE_MIGRATION_URL` when present.
6. Local/test SQLite startup may bootstrap SQLAlchemy tables with
   `Base.metadata.create_all()`. Cloud mode relies on migrations.
7. PostgreSQL incompatibilities still to remove are concentrated in direct CEDA
   sqlite3 persistence and runtime schema mutation.
8. There is a duplicate persistence surface today: SQLAlchemy models for core
   SaaS data and direct sqlite3 tables for CEDA/Context OS/Graph. The target is a
   canonical SQLAlchemy model set for both SQLite and PostgreSQL.

## Implementation rules for future data storage

- Business services must not branch on `DATABASE_MODE`.
- Database-specific behavior belongs in database configuration, engine/session
  creation, migrations, or narrow persistence adapters.
- No tenant-owned record may be loaded by record ID alone; queries must include
  user/organization/workspace authorization context.
- Every durable record must have a stable unique ID if it can be referenced.
- Every record mutation must be auditable.
- Every relationship must use a controlled relationship type.
- Production startup must not use default secrets.
- Cloud startup must use migrations, not runtime table creation.

## Health check

`GET /api/v1/health/database` reports only safe operational fields: mode,
database type, connection status, latency, pool status where available, and
migration status. It never exposes credentials.

## Next migration stage

The next storage milestone is to move CEDA, structured review items, reminders,
context objects, context graph relationships, and audit entries from direct
`sqlite3` into canonical SQLAlchemy models/repositories while preserving the
existing CEDA behavior and tests.
