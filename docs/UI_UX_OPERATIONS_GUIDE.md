# Lotus & Dorje Operations and UI/UX Guide

This guide explains how users operate Lotus & Dorje and how Kamal should guide them. External actions such as email, calendar publishing, and social publishing always require the relevant connector and explicit confirmation.

## Current Student-LAD operations model

Student-LAD is operated through the main application shell, Workspace AI, Kamal,
and Review & Save. The old `/operations-guide` page is legacy/internal reference
content and should not be presented as the user-facing help experience.

User-facing help is now a **Kamal guided tour**:

- The profile menu exposes **Help / Guided tour**.
- Kamal opens as the voice/text guide, asks the user to say or select
  **Start Tour**, then explains each live application area in sequence.
- The guided tour starts with the top-right profile menu, then moves through
  Home, My Day, Workspace AI, Academic, Immigration, Career, Family, Health,
  Bills & Subscriptions, Holidays, Review & Save, Memory Center, Connectors,
  Policies, and Settings.
- The guided tour continues step by step until the user says **stop tour** or
  selects **Stop** in Kamal.
- Kamal may navigate to Home, My Day, Workspace AI, Academic, Immigration,
  Career, Family, Health, Bills & Subscriptions, Holidays, Review & Save,
  Memory Center, Connectors, Policies, and Settings.
- Kamal should explain the current screen first, then offer the next screen or
  action.
- Kamal must not route users to nonexistent Dashboard, Reports, or Create New
  Report pages. Reports are created through Workspace AI chat.

The top-right profile menu is the primary account/help menu:

- Help / Guided tour
- Settings
- Logout

## Application map

| Area | Purpose | Typical operation |
| --- | --- | --- |
| Dashboard | Executive operating overview | Review organizations, reports, automations, and open DorjeAI |
| Organizations | Tenant-safe client portfolio | Create, view, update, and organize client records |
| Reports | Reusable deliverables | Generate and retrieve reports owned by the active organization |
| DorjeAI | AI productivity workspace | Chat, analyze files, build tables/charts, generate images, and reuse output |
| Templates | Export preferences | Select PDF/TXT chat formats and XLSX/CSV table formats |
| Connectors | Secure external integrations | Connect Gmail and prepare confirmed email/social workflows |
| Operations Guide | Product help | Learn controls, workflows, security boundaries, and troubleshooting |

## Authentication and tenancy

1. Register or sign in.
2. The frontend stores the current session and protects authenticated routes.
3. The API validates the current user for protected requests.
4. Organization, project, and report operations are ownership scoped.
5. Logout clears the local session and returns to Login.

Never advise users to paste access tokens or OAuth secrets into chat. OAuth credentials belong on the server and must be encrypted.

## Dashboard

- Use the cards for a quick operating summary.
- Select Organizations to manage clients.
- Select Reports to work with deliverables.
- Select Open DorjeAI to continue analysis or content work.
- Kamal can navigate here after confirming: “Open the dashboard.”

## DorjeAI workspace

### Left navigation

- New Chat starts an independent conversation folder.
- Chat History restores recent conversations.
- Saved Reports opens the report library.
- Templates controls downloadable formats.
- Connectors manages external accounts.
- Settings manages appearance, models, storage, privacy, downloads, voice, and advanced preferences.
- Drag the right edge to resize the navigation panel.

### Global bar

- Search filters the current workspace (`Cmd/Ctrl+K`).
- Model selects automatic routing or an installed local model.
- Mode changes the response workflow.
- Image model selects Tiny-SD or SSD-1B.
- Theme selects System, Dark, or Light.
- Storage, notifications, and profile controls explain their current status.

### Model modes

- Fast Chat: concise direct answers. Simple requests skip the planner, thinking is off, and validators do not rewrite the answer.
- Deep Analysis: direct Qwen-style long-form reasoning using the current request
  and only relevant policy-safe context. Standalone software tutorials, such as
  “Give me JASP steps to perform correlation,” stay in Deep Analysis and are not
  converted into Statistics Mode. It uses a substantially larger output budget
  than Fast Chat, skips the planner unless task planning is necessary, and is not shortened unless the user asks for brevity. Validators may flag issues but do not rewrite the answer.
- Statistics Mode: formulas, calculations, source tables, charts, interpretation,
  and recommendations when the user requests calculation, visualization, or data
  analysis. Topic words such as “correlation” do not force this mode by themselves.
- Report Mode: structured consulting deliverables.
- Social Creator: platform-ready social variants.
- Email Assistant: professional email drafting.

### Conversation workspace

- User messages appear on the right; DorjeAI output appears on the left.
- Output supports Markdown, code, LaTeX, tables, charts, and generated images.
- Message actions include Copy, Table, Use in Chat, PDF, Email, Social, Regenerate, and More.
- “What’s next?” suggestions reuse the current result without retyping context.
- After a meaningful exchange, CEDA receives the final user request and
  assistant response, distills useful conclusions, and proposes or saves memory
  according to policy. The raw exchange is not durable memory unless explicitly
  saved.

### Files

- Attach or drag PDF, DOCX, TXT, Markdown, CSV, XLSX, JSON, source code, images, MP4, or audio.
- Clipboard image/file paste is supported.
- Clipboard text that contains a JASP/LaTeX `tabular` table is normalized into a
  clean Markdown table in the composer. Raw LaTeX table wrappers, RTF-style
  formatting, and rule commands are not kept in the composer.
- Uploaded text is extracted and sent as model context.
- Image and MP4 analysis uses the configured vision workflow.
- Attachments remain linked to the current chat and are visible in the right context panel.

### Workspace AI file drawer

- Workspace AI stays chat-only for general questions such as “Explain photosynthesis.”
- A file drawer slides in only after an explicit file action: create, open, edit,
  preview, upload, or convert a document, spreadsheet, presentation, PDF, form, or
  attachment.
- DOCX creation writes a concrete local document artifact and shows a review drawer.
- Spreadsheet, presentation, PDF, form, and attachment commands create an editable
  preview drawer first; provider-specific saves require a connector confirmation.
- Closing the drawer does not delete the file or end the conversation.
- “Email this/final version” opens an in-place email drawer inside Workspace AI.
  It does not navigate to a separate connector page. Gmail authorization is requested
  only when the user sends or reconnects.
- External actions still require confirmation: sending email, cloud save, sharing,
  overwrite, delete, publishing, or making a file public.

### Tables and charts

- Convert generated or supplied text into a structured table.
- Paste JASP statistical tables directly; DorjeAI accepts them as table-formatted
  rows and columns, not raw LaTeX.
- Copy rich HTML or tab-separated cells into Excel while preserving rows and columns.
- Download CSV or XLSX.
- Charts use user-supplied table values rather than invented defaults.
- Export charts as PNG, SVG, PDF, or Excel source data.

### Images

- Image-language requests start an asynchronous local generation job.
- The interface polls status, downloads the PNG, and renders it inside the conversation.
- Image actions include Copy, Download, Edit Prompt, Upscale, Variations, Metadata, Email, and Social.

### Right context panel

- The collapsed icon rail expands on hover or keyboard focus.
- Pin keeps the panel open; Unpin restores auto-hide.
- Drag the left edge to resize it.
- Current Chat shows identity and token estimates.
- Files lists linked attachments.
- Generated Assets counts images, tables, and charts.
- Quick Actions provides export, share, print, duplicate, and archive status.
- Model Information records routing and modes.
- Metadata and History preserve project context and versions.

### Composer

- Enter sends; Shift+Enter inserts a line.
- Tools provide Attach, Context, Voice, Image, Table, Chart, Statistics, Code, Drawing, Camera, and Screen Capture.
- The composer clears text after sending while chat-linked attachments remain available.
- Generation can be stopped while streaming.

## Kamal assistant

Kamal supports Text and Voice modes. Voice mode listens for simple English intents and aliases such as “Dorje,” “DorjeAI,” “multi-agent,” or “workspace.” Kamal repeats its interpretation and waits for Yes/No confirmation before navigation, typing, sending, support, callback, or scheduling actions.

Examples:

- “Open the dashboard.”
- “Go to Dorje and type create a quarterly plan.”
- “Send it.”
- “Create a support ticket.”
- “Arrange a callback tomorrow at 2 PM.”
- “Schedule a call and prepare the agenda.”

Kamal can create local support/callback records and prepare a secure Gmail handoff. Calendar, directory, and publishing actions remain unavailable until their OAuth connectors and server token storage are implemented.

## Gmail connector

1. Open DorjeAI → Connectors.
2. Select Connect Gmail.
3. Complete Google consent.
4. The backend exchanges the authorization code and encrypts tokens per user.
5. Use the Email tab to draft new email, read approved Gmail messages, summarize
   message bodies and readable attachments, and create editable documents.
6. Save email-derived documents as local DOCX or Google Docs. OneDrive,
   SharePoint, Microsoft Word, Apple Mail, and iCloud remain connector-ready
   placeholders until their provider OAuth/API implementations are activated.
7. Review recipients, subject, body, generated documents, and attachments.
8. Confirm before sending or replying.
9. Disconnect to revoke access.

Tokens must never be stored in browser storage or exposed in frontend state.

Email-reading workflows follow the same confirmation model as sending. DorjeAI may
list, read, and summarize Gmail content only after the user connects Gmail with read
permission. Attachment text extraction is limited to supported text, PDF, DOCX, and
XLSX-style files; binary attachments remain visible as references unless readable
content can be extracted.

## Troubleshooting

- Connection refused: ensure frontend and backend development servers are running.
- Could not validate credentials: sign in again; do not use placeholder bearer tokens.
- Ollama offline: start Ollama and verify the configured model is installed.
- Image job not found: keep job creation/status/content requests on the same backend instance.
- File unreadable: use a text-based PDF/DOCX or enable OCR for scanned documents.
- Voice aborted: this is normally a browser stop/restart event and is ignored by Kamal.
- Gmail not configured: set Google client ID, client secret, redirect URI, and token encryption key.

## Security and confirmation rules

- Require authentication for protected application and connector routes.
- Scope data to the current tenant.
- Encrypt OAuth tokens server-side.
- Use least-privilege connector scopes.
- Confirm every external send, schedule, publish, or destructive action.
- Clearly label placeholders where backend capability is not yet implemented.
- Preserve audit metadata for connector actions.
