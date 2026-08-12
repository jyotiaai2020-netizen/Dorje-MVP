
# Student-LAD Product Architecture

This Base44 project is an exportable presentation and workflow layer for the Student-LAD backend architecture. The UI is not coupled to a provider-specific database or model.

## Stable contracts

- Canonical entities: Task, Area, ScheduleEvent, DocumentRecord, ActionRequest, UserPreference, and AuditEvent.
- Every consequential action moves through proposed, approved, executing, verified, or failed states.
- A conversational response is never evidence of completion.
- The selected deployment mode is a preserved policy input.
- Local, hybrid, and cloud editions share UI routes and domain contracts.

## Runtime profiles

| Profile | Data | AI | External actions |
| --- | --- | --- | --- |
| Local | Encrypted device database and file vault | Local capability gateway | Local drafts; connectors unavailable or queued |
| Hybrid | Local source of truth with selective encrypted sync | Local-first, approved cloud escalation | Authorized connectors with idempotency and verification |
| Cloud SaaS | Tenant-isolated managed database and object storage | Scalable gateway and workers | Tenant-scoped connectors, queues, audit, and verified completion |

## Adapter boundary

The current prototype keeps demo data in browser storage so every screen is immediately testable. Production integration replaces this implementation behind repository contracts:

- TaskRepository
- AreaRepository
- EventRepository
- DocumentRepository
- ActionRepository
- AuditRepository
- ContextRepository
- SyncRepository
- ModelGateway
- ConnectorGateway

Base44 entities provide a hosted implementation during product prototyping. The same frontend can be exported to Git, opened in VS Code, and wired to Student-LAD local SQLite/FastAPI adapters or cloud PostgreSQL services without redesigning the screens.

## Verified action contract

1. Interpret the request.
2. Resolve the exact target and authoritative system.
3. Generate a reversible proposal.
4. Show data, recipient, scope, schedule, warnings, and policy decision.
5. Obtain confirmation when required.
6. Execute using an idempotency key.
7. Read the authoritative state.
8. Record verification and an immutable audit event.
9. Report verified, failed, queued, or conflicted status.
10. Offer undo when safe.

## Git and VS Code handoff

Export or connect the Base44 app repository, clone it, install dependencies, and run the existing Vite scripts. Do not commit local tokens or secrets. Use environment configuration and adapters to select local, hybrid, or cloud services.