# Kamal Acceptance Tests

Kamal is accepted only when it behaves as Student-LAD's governed application-control assistant.

## Identity

- A greeting returns a concise Student-LAD assistant response.
- Kamal does not advertise Organizations, Reports dashboards, tenant administration, or enterprise menus unless explicitly requested.
- Kamal hands deep analysis, files, reports, charts, long writing, and document work to Workspace AI.

## Voice/text parity

Each command must work by typing and by speech transcript:

- Navigate: "open Academic", "take me home", "open Workspace AI".
- Records: add/remove academic, immigration, career, family, health, finance, holiday records.
- Reminders: create, update, complete, archive, delete.
- Tasks: list completed/overdue/upcoming/today/active tasks and update status.
- CEDA: approve, deny, archive, delete pending review items.
- Settings: change voice, avatar, accent, background, theme, execution mode, performance profile.

## Confirmation

- Mutating commands require confirmation.
- External connector actions require confirmation and connector authorization.
- Kamal must not claim success until the API/action handler returns success.

## Data consistency

- Task questions use `/api/v1/tasks`.
- Task status changes use the same reminder/task source used by Calendar, Tasks, My Day, and Upcoming.
- Course questions use approved CEDA and Context OS academic records.
- CEDA review commands use CEDA item APIs.
- Settings commands use the app store and `/api/v1/settings/app-preferences`.

## Regression tests

The primary e2e suite is:

```bash
cd packages/platform/frontend
npx playwright test tests/e2e/kamal-reminder.spec.ts --project=chromium
```

The suite must cover:

- reminder creation
- task completion mutation
- completed/overdue task query consistency
- CEDA review approval
- settings mutation
- academic course query
- course add/remove
- report handoff to Workspace AI
