# Dorje MVP integration state

## Implemented in this branch

- Imported the Student-LAD core without changing its source repository.
- Exported the DorjeFlow Base44 application into `experience/dorjeflow`.
- Made Student-LAD the default DorjeFlow runtime and retained Base44 as an explicit adapter mode.
- Added local registration/sign-in, an explicitly non-authoritative offline demo, task hydration, task creation, completion writes, and read-after-write refresh.
- Exposed Kamal preview, execute, and undo through the same Student-LAD API adapter.
- Made unmapped Base44 document/email/cloud functions fail closed in Student-LAD mode.
- Added Docker and VS Code entry points plus a focused runtime/build gate.

## Verification boundary

A remote task is marked `authoritative`. Completing it performs a PATCH against the Student-LAD reminder record and then refreshes `/tasks`. If either step fails, the optimistic UI change is rolled back and the status becomes `verification failed`.

Offline demo tasks remain browser-local and do not receive the authoritative marker. Their UI status says `saved locally`; it must not be interpreted as completion in an external or cloud system.

## Remaining migration work

1. Map DorjeFlow Workspace AI, documents, email, Drive, and calendar operations to Student-LAD connector and action-engine endpoints.
2. Replace remaining Base44 entity calls with repository interfaces.
3. Add Capacitor local-notification and mobile packaging adapters.
4. Add Tauri desktop packaging and a FastAPI sidecar.
5. Split the current 2.4 MB DorjeFlow JavaScript bundle by route.
6. Repair the inherited Base44 export's broad `checkJs` type errors, then restore it to the blocking MVP gate.
7. Run physical-device, full backend, Playwright, offline-sync, accessibility, and security verification before marking the PR ready.

## Deliberate exclusions

The previous `imports/` prototype and three demo media files plus the legacy favicon were not copied from Student-LAD. They are not required to run either active application and would duplicate or inflate the MVP.
