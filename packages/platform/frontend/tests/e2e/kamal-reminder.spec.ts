import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const API = 'http://127.0.0.1:8100';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'kamal-reminder-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 909, email: 'reminder@example.com', full_name: 'Reminder User' }));
  });
}

async function mockApis(page: Page, options: { duplicateElectricity?: boolean; dodOverdueFixtures?: boolean; failKamalExecute?: boolean } = {}) {
  const reminders: Array<Record<string, unknown>> = options.dodOverdueFixtures ? [
    {
      id: 'TASK-QUIZ-112',
      context_id: 'CTX-TASK-QUIZ-112',
      title: 'Weeks 11-12 Quiz 7/26/26 plan it at least a week before',
      due_at: '2026-07-17T23:59:00-04:00',
      reminder_date: '2026-07-17T23:59:00-04:00',
      priority: 'high',
      confidence: 0.92,
      status: 'active',
      version: 1,
    },
    {
      id: 'TASK-REFLECT-1',
      context_id: 'CTX-TASK-REFLECT-1',
      title: 'Put a for Applied Learning Practicum Reflection',
      due_at: '2026-07-17T23:59:00-04:00',
      reminder_date: '2026-07-17T23:59:00-04:00',
      priority: 'high',
      confidence: 0.92,
      status: 'active',
      version: 1,
    },
    {
      id: 'TASK-REFLECT-2',
      context_id: 'CTX-TASK-REFLECT-2',
      title: 'Applied Learning Practicum Reflection',
      due_at: '2026-07-20T23:59:00-04:00',
      reminder_date: '2026-07-20T23:59:00-04:00',
      priority: 'high',
      confidence: 0.92,
      status: 'active',
      version: 1,
    },
  ] : [
    {
      id: 'REM-ELECTRICITY-001',
      context_id: 'CTX-FIN-ELECTRICITY',
      title: 'Pay electricity bill',
      due_at: '2026-08-09T16:00:00.000Z',
      reminder_date: '2026-08-09T16:00:00.000Z',
      priority: 'high',
      confidence: 0.92,
      status: 'active',
      version: 1,
    },
    {
      id: 'REM-COMPLETED-001',
      title: 'Submit reading notes',
      due_at: '2026-07-20T13:00:00.000Z',
      reminder_date: '2026-07-20T13:00:00.000Z',
      priority: 'normal',
      confidence: 0.92,
      status: 'completed',
      updated_at: '2026-07-20T14:00:00.000Z',
      version: 1,
    },
    {
      id: 'REM-OVERDUE-001',
      title: 'Applied Learning Practicum Reflection',
      due_at: '2026-07-01T13:00:00.000Z',
      reminder_date: '2026-07-01T13:00:00.000Z',
      priority: 'high',
      confidence: 0.92,
      status: 'active',
      version: 1,
    },
  ];
  const undoStack: Array<{ token: string; entityId: string; before: Record<string, unknown>; after: Record<string, unknown>; consumed?: boolean }> = [];
  const score = (title: string, query: string) => query.toLowerCase().match(/[a-z0-9]+/g)
    ?.filter((word) => (word.length > 2 || /^\d+$/.test(word)) && !['the', 'task', 'reminder', 'that', 'this', 'it', 'to', 'as', 'and'].includes(word))
    .reduce((total, word) => total + (title.toLowerCase().includes(word) ? 1 : 0), 0) || 0;
  const cleanActionQuery = (message: string) => message
    .replace(/\bkamal\b/gi, '')
    .replace(/\b(please|can you|could you|my|the|this|that|it|current|existing|put|set|make|who|is)\b/gi, ' ')
    .replace(/\b(mark|complete|finish|finished|completed|done|is done|as completed|to completed|reopen|move|send|change|return|restore|incomplete|again|not done|not completed|not complete|active|as active|to active|back to active|active task|active reminder)\b/gi, ' ')
    .replace(/\b(as|to|and)\b/gi, ' ')
    .replace(/\b(task|tasks|reminder|reminders|todo|to-do|item|status)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const actionFor = (operation: 'COMPLETE' | 'REOPEN' | 'UNDO', item?: Record<string, unknown>, source: 'voice' | 'text' = 'text', token?: string) => ({
    actionId: `ACTION-${Date.now()}-${Math.random()}`,
    operation,
    entityType: 'task',
    entityId: item?.id,
    query: item ? undefined : '',
    changes: operation === 'UNDO' ? { undo_token: token, status: item?.status || 'active' } : { status: operation === 'COMPLETE' ? 'completed' : 'active' },
    source,
    requiresConfirmation: true,
    expectedVersion: item?.version || 1,
  });
  const candidateFor = (item: Record<string, unknown>, operation: 'COMPLETE' | 'REOPEN', source: 'voice' | 'text') => ({
    id: item.id,
    title: item.title,
    due_at: item.due_at,
    reminder_date: item.reminder_date,
    status: item.status,
    priority: item.priority,
    version: item.version || 1,
    action: actionFor(operation, item, source),
  });
  const contextRecords: Array<Record<string, unknown>> = [
    { context_id: 'CTX-ACA-COURSE', title: 'Course INTR799', type: 'Course', domain: 'academic', status: 'active', payload: { instruction: 'Course INTR799' }, confidence: 0.92, source: { type: 'kamal_voice_or_text' } },
    { context_id: 'CTX-ACA-DSRT734', title: 'Adios DSRT734 M2 to the courses description to as a statistic course', type: 'Structured Information', domain: 'academic', status: 'active', payload: { instruction: 'Adios DSRT734 M2 to the courses description to as a statistic course' }, confidence: 0.76, source: { type: 'kamal_voice_or_text' } },
  ];
  const approvedCedaItems: Array<Record<string, unknown>> = [
    { id: 'ITEM-COURSE-APPROVED', domain: 'academic', type: 'Structured Information', summary: 'Course: DSRT 850', related_item: 'Course: DSRT 850', status: 'approved', confidence: 0.76, source_type: 'academic_manual_entry', metadata: { extracted_fields: { title: 'Course: DSRT 850', record_type: 'Structured Information' } } },
  ];
  const pendingCedaItems: Array<Record<string, unknown>> = [
    { id: 'ITEM-PENDING-001', domain: 'academic', type: 'Academic Deadline', summary: 'Statistics Assignment 2 deadline is July 20.', related_item: 'Statistics Assignment 2', status: 'pending_review', confidence: 0.87, source_type: 'kamal_voice_or_text', metadata: { extracted_fields: { title: 'Statistics Assignment 2', record_type: 'Assignment' } } },
  ];
  if (options.duplicateElectricity) {
    reminders.unshift({
      id: 'REM-ELECTRICITY-002',
      context_id: 'CTX-FIN-ELECTRICITY-2',
      title: 'Review electricity bill statement',
      due_at: '2026-08-10T16:00:00.000Z',
      reminder_date: '2026-08-10T16:00:00.000Z',
      priority: 'normal',
      confidence: 0.91,
      status: 'active',
      version: 1,
    });
  }
  await page.route(`${API}/api/v1/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === 'POST' && path.endsWith('/ceda/extract')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'BATCH-COURSE-001', item_count: 1, items: [{ id: 'ITEM-COURSE-001', summary: 'Course INTR799' }] }) });
      return;
    }
    if (request.method() === 'POST' && path.includes('/ceda/items/') && path.endsWith('/approve')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'ITEM-COURSE-001', status: 'approved' }) });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/ceda/objects/CTX-ACA-COURSE/transition')) {
      const body = request.postDataJSON() as { target: string; reason: string };
      contextRecords[0].status = body.target;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ context_id: 'CTX-ACA-COURSE', status: body.target, reason: body.reason }) });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/ceda/reminders')) {
      const body = request.postDataJSON() as { title: string; due_at: string; reminder_date: string; priority: string };
      const reminder = {
        id: 'REM-VOICE-001',
        context_id: 'CTX-PER-VOICE',
        context_item_id: null,
        title: body.title,
        due_at: body.due_at,
        reminder_date: body.reminder_date,
        priority: body.priority,
        confidence: 0.92,
        status: 'active',
        official_verification_required: false,
        version: 1,
      };
      reminders.unshift(reminder);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reminder) });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/kamal/actions/preview')) {
      const body = request.postDataJSON() as { message: string; source?: 'voice' | 'text' };
      const message = body.message || '';
      const source = body.source || 'text';
      const lower = message.toLowerCase();
      if (/\b(tell|show|list|what|which|how many|count|total|do i have)\b/.test(lower)) {
        await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ detail: 'Unsupported intent' }) });
        return;
      }
      if (/\bundo\b|\brevert\b|\brestore\b/.test(lower)) {
        const latest = [...undoStack].reverse().find((entry) => !entry.consumed);
        if (!latest) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'not_found', message: 'There is no recent task change to undo.' }) });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'preview',
            action: actionFor('UNDO', latest.after, source, latest.token),
            item: latest.after,
            before: latest.after,
            after: latest.before,
          }),
        });
        return;
      }
      const operation: 'COMPLETE' | 'REOPEN' | null = /\b(reopen|incomplete|not done|not completed|not complete)\b/.test(lower) || /\b(move|put|set|send|change|return|restore)\b.{0,120}\b(back to active|to active|as active|active task|active reminder)\b/.test(lower)
        ? 'REOPEN'
        : (/\b(mark|complete|completed|finish)\b/.test(lower) || /\bas completed\b|\bto completed\b/.test(lower) || /\b(task|reminder|todo|bill).{0,60}\bis done\b/.test(lower) || /\bis done\b/.test(lower)) && /\b(task|reminder|todo|bill|is done|completed)\b/.test(lower)
          ? 'COMPLETE'
          : null;
      if (!operation) {
        await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ detail: 'Unsupported intent' }) });
        return;
      }
      const query = cleanActionQuery(message);
      const sourceMatches = reminders
        .filter((item) => item.status !== 'deleted')
        .filter((item) => operation === 'REOPEN' ? item.status === 'completed' : item.status !== 'completed');
      const matches = (operation === 'REOPEN' && !query
        ? sourceMatches.map((item) => ({ item, score: 1 }))
        : sourceMatches
          .map((item) => ({ item, score: score(String(item.title), query) }))
          .filter((entry) => entry.score > 0))
        .sort((a, b) => b.score - a.score);
      if (!matches.length) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'not_found', message: `I could not find an active task or reminder matching “${query || message}”. Nothing was changed.` }) });
        return;
      }
      const top = matches[0].score;
      const candidates = matches.filter((entry) => entry.score === top).map((entry) => candidateFor(entry.item, operation, source));
      if (candidates.length > 1) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'clarification_required', message: 'I found more than one matching task. Please choose one before I change anything.', candidates }) });
        return;
      }
      const item = candidates[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'preview', action: item.action, item, before: { status: item.status }, after: { status: operation === 'COMPLETE' ? 'completed' : 'active' } }),
      });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/kamal/actions/execute')) {
      const body = request.postDataJSON() as { action: { operation: string; entityId?: string; changes?: Record<string, unknown>; expectedVersion?: number } };
      const action = body.action;
      if (action.operation === 'UNDO') {
        const token = String(action.changes?.undo_token || '');
        const undo = undoStack.find((entry) => entry.token === token && !entry.consumed);
        const reminder = undo ? reminders.find((item) => item.id === undo.entityId) : undefined;
        if (!undo || !reminder) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Undo token was not found for this user.' }) });
          return;
        }
        reminder.status = undo.before.status;
        reminder.version = Number(reminder.version || 1) + 1;
        reminder.updated_at = new Date().toISOString();
        undo.consumed = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', message: 'Undo complete.', item: reminder, undo_token: null }) });
        return;
      }
      const reminder = reminders.find((item) => item.id === action.entityId);
      if (options.failKamalExecute) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Forced task mutation failure.' }) });
        return;
      }
      if (!reminder || reminder.status === 'deleted') {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Task or reminder was not found.' }) });
        return;
      }
      if (action.expectedVersion && Number(reminder.version || 1) !== action.expectedVersion) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'This task changed after the preview. Refresh and try again.' }) });
        return;
      }
      const before = { ...reminder };
      const nextStatus = String(action.changes?.status || (action.operation === 'COMPLETE' ? 'completed' : 'active'));
      if (reminder.status !== nextStatus) {
        reminder.status = nextStatus;
        reminder.version = Number(reminder.version || 1) + 1;
        reminder.updated_at = new Date().toISOString();
        undoStack.push({ token: `UNDO-${String(reminder.id).replace(/[^A-Z0-9]/gi, '').slice(-8)}`, entityId: String(reminder.id), before, after: { ...reminder } });
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', message: `Updated “${reminder.title}” to ${reminder.status}. Tasks, Calendar, My Day, and Upcoming will refresh from the same record.`, item: reminder, undo_token: undoStack.at(-1)?.token || null }) });
      return;
    }
    if (request.method() === 'PATCH' && path.includes('/ceda/reminders/')) {
      const id = path.split('/').pop();
      const body = request.postDataJSON() as { status?: string; priority?: string; title?: string };
      const reminder = reminders.find((item) => item.id === id);
      if (reminder) Object.assign(reminder, body, { updated_at: new Date().toISOString() });
      await route.fulfill({ status: reminder ? 200 : 404, contentType: 'application/json', body: JSON.stringify(reminder || { detail: 'Reminder was not found' }) });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/ceda/items/bulk-approve')) {
      const body = request.postDataJSON() as { item_ids: string[] };
      for (const item of pendingCedaItems) if (body.item_ids.includes(String(item.id))) item.status = 'approved';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.item_ids.map((id) => ({ id, status: 'approved' }))) });
      return;
    }
    if (request.method() === 'POST' && path.includes('/ceda/items/') && path.endsWith('/deny')) {
      const id = path.split('/').at(-2);
      const item = pendingCedaItems.find((candidate) => candidate.id === id);
      if (item) item.status = 'denied';
      await route.fulfill({ status: item ? 200 : 404, contentType: 'application/json', body: JSON.stringify(item || { detail: 'Item not found' }) });
      return;
    }
    if (path.endsWith('/connectors/google/google-calendar/connect')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ provider: 'google-calendar', authorization_url: 'http://127.0.0.1:3100/dorje-ai/connectors?provider=google-calendar' }) });
      return;
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (path.includes('/tasks')) {
      const now = new Date('2026-07-30T12:00:00.000Z');
      const tasks = reminders.map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        dueAt: reminder.due_at || reminder.reminder_date,
        priority: reminder.priority || 'normal',
        status: reminder.status || 'active',
        category: 'academic',
      }));
      const isOverdue = (task: Record<string, unknown>) => Boolean(task.dueAt && new Date(String(task.dueAt)) < now && !['completed', 'cancelled', 'archived', 'deleted'].includes(String(task.status)));
      const isUpcoming = (task: Record<string, unknown>) => Boolean(task.dueAt && new Date(String(task.dueAt)) > now && !['completed', 'cancelled', 'archived', 'deleted'].includes(String(task.status)));
      const byScope = (scope: string, task: Record<string, unknown>) => scope === 'completed' ? task.status === 'completed' : scope === 'overdue' ? isOverdue(task) : scope === 'upcoming' ? isUpcoming(task) : scope === 'active' ? ['active', 'in_progress'].includes(String(task.status)) : true;
      const counts = Object.fromEntries(['all', 'completed', 'overdue', 'upcoming', 'active'].map((scope) => [scope, tasks.filter((task) => byScope(scope, task)).length]));
      const taskId = path.match(/\/tasks\/([^/]+)$/)?.[1];
      if (taskId) {
        const task = tasks.find((item) => item.id === decodeURIComponent(taskId));
        await route.fulfill({ status: task ? 200 : 404, contentType: 'application/json', body: JSON.stringify(task || { detail: 'Task was not found' }) });
        return;
      }
      const scope = url.searchParams.get('scope') || 'all';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: tasks.filter((task) => byScope(scope, task)), counts }) });
      return;
    }
    const body = path.endsWith('/ceda/dashboard')
      ? { workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: reminders.length, context_health_score: 100, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
      : path.endsWith('/ceda/reminders') ? { items: reminders, immigration_disclaimer: '' }
        : path.endsWith('/context-os/health') ? { score: 100, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }
          : path.endsWith('/ceda/policies') ? { academic: { save: 'ask_first', cloud: false, retention_days: 365 } }
            : path.endsWith('/wkim/storage-locations') ? []
              : path.endsWith('/wkim/health') ? { score: 100, workspaces: 0, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }
                : path.endsWith('/settings/device-profile') ? { device_mode: 'desktop', resource_profile: '16gb', connectivity_mode: 'hybrid', resource_rules: {}, connectivity_rules: {} }
                  : path.endsWith('/settings/history-policy') ? { tier: 'free', history_policy: { raw_chat_history_days: 7, summary_history_days: 30, daily_summary_enabled: true, weekly_summary_enabled: false, cross_device_history: false, max_saved_conversations: 10 }, memory_policy: {}, ui_rules: {} }
                    : path.endsWith('/settings/orchestration-policy') ? { tier: 'free', memory_policy: { classes: [] }, upload_limits: {}, model_residency: {} }
                      : path.endsWith('/context-os/registry') ? contextRecords.filter((item) => item.status === 'active')
                        : path.endsWith('/ceda/items') ? (url.searchParams.get('status') === 'pending' ? pendingCedaItems.filter((item) => item.status === 'pending_review') : approvedCedaItems)
                        : path.endsWith('/pie/policies') || path.endsWith('/pie/decisions') || path.endsWith('/wkim/catalog') ? []
                          : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function sendKamalMessage(page: Page, message: string) {
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill(message);
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');
}

async function getTaskFromApi(page: Page, id: string) {
  return page.evaluate(async ([api, taskId]) => {
    const token = window.localStorage.getItem('lotus_token') || '';
    const response = await fetch(`${api}/api/v1/tasks/${taskId}`, { headers: { Authorization: `Bearer ${token}` } });
    return response.json();
  }, [API, id]);
}

async function getTasksFromApi(page: Page, scope = 'all') {
  return page.evaluate(async ([api, taskScope]) => {
    const token = window.localStorage.getItem('lotus_token') || '';
    const response = await fetch(`${api}/api/v1/tasks?scope=${encodeURIComponent(taskScope)}`, { headers: { Authorization: `Bearer ${token}` } });
    return response.json();
  }, [API, scope]);
}

const quizCompletionCommands = [
  'Mark Weeks 11-12 Quiz as completed.',
  'Put task 11-12 as completed.',
  'The Weeks 11-12 Quiz is done.',
  'Complete task 11 to 12.',
  'Mark the task 11 to 12 who is as completed.',
] as const;

for (const command of quizCompletionCommands) {
  test(`DOD: text command mutates exact persisted task and refreshes overdue: ${command}`, async ({ page }) => {
    await authenticate(page);
    await mockApis(page, { dodOverdueFixtures: true });
    await page.goto('/student-lad/tasks');

    let createRequests = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/reminders')) createRequests += 1;
    });

    await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
    await sendKamalMessage(page, 'What are my overdue tasks?');
    await expect(page.getByText(/You have 3 overdue tasks/i)).toBeVisible();
    const baseline = await getTasksFromApi(page, 'overdue') as { items: Array<{ id: string; status: string }> };
    expect(baseline.items.map((item) => item.id).sort()).toEqual(['TASK-QUIZ-112', 'TASK-REFLECT-1', 'TASK-REFLECT-2']);
    expect(baseline.items.find((item) => item.id === 'TASK-QUIZ-112')?.status).toBe('active');

    await sendKamalMessage(page, command);
    await expect(page.getByText(/I understood: change “Weeks 11-12 Quiz 7\/26\/26 plan it at least a week before”/)).toBeVisible();
    await expect(page.getByText(/from active to completed/).last()).toBeVisible();

    const executeRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/kamal/actions/execute'));
    await page.getByRole('button', { name: 'Yes, continue' }).click();
    const executePayload = (await executeRequest).postDataJSON() as { action?: { entityId?: string; operation?: string; changes?: { status?: string } } };
    expect(executePayload?.action?.entityId).toBe('TASK-QUIZ-112');
    expect(executePayload?.action?.operation).toBe('COMPLETE');
    expect(executePayload?.action?.changes?.status).toBe('completed');
    expect(createRequests).toBe(0);
    await expect(page.getByText(/Updated “Weeks 11-12 Quiz 7\/26\/26 plan it at least a week before” to completed/)).toBeVisible();

    const task = await getTaskFromApi(page, 'TASK-QUIZ-112') as { id: string; status: string };
    expect(task).toMatchObject({ id: 'TASK-QUIZ-112', status: 'completed' });
    const allTasks = await getTasksFromApi(page, 'all') as { items: Array<{ id: string }> };
    expect(allTasks.items.filter((item) => item.id === 'TASK-QUIZ-112')).toHaveLength(1);
    expect(allTasks.items).toHaveLength(3);

    await sendKamalMessage(page, 'Review my overdue tasks again');
    await expect(page.getByText(/You have 2 overdue tasks/i)).toBeVisible();
    const freshOverdue = await getTasksFromApi(page, 'overdue') as { items: Array<{ id: string }> };
    expect(freshOverdue.items.map((item) => item.id).sort()).toEqual(['TASK-REFLECT-1', 'TASK-REFLECT-2']);

    await page.reload();
    const persistedTask = await getTaskFromApi(page, 'TASK-QUIZ-112') as { id: string; status: string };
    expect(persistedTask).toMatchObject({ id: 'TASK-QUIZ-112', status: 'completed' });
    const overdueAfterReload = await getTasksFromApi(page, 'overdue') as { items: Array<{ id: string }> };
    expect(overdueAfterReload.items.map((item) => item.id).sort()).toEqual(['TASK-REFLECT-1', 'TASK-REFLECT-2']);
  });
}

test('DOD: mocked voice uses the same exact-ID persistence path for quiz completion', async ({ page }) => {
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null = null;
      onerror = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'Complete task 11 to 12' }, isFinal: true }] });
        }, 50);
      }
      stop() { this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: MockSpeechRecognition });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: MockSpeechRecognition });
  });
  await authenticate(page);
  await mockApis(page, { dodOverdueFixtures: true });
  await page.goto('/student-lad/tasks');
  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await expect(page.getByText(/I understood: change “Weeks 11-12 Quiz/)).toBeVisible();
  const executeRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/kamal/actions/execute'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const payload = (await executeRequest).postDataJSON() as { action: { entityId: string; source: string; changes: { status: string } } };
  expect(payload.action.entityId).toBe('TASK-QUIZ-112');
  expect(payload.action.source).toBe('voice');
  expect(payload.action.changes.status).toBe('completed');
  const task = await getTaskFromApi(page, 'TASK-QUIZ-112') as { status: string };
  expect(task.status).toBe('completed');
});

test('DOD: completed task can be moved back to active with logged REOPEN flow', async ({ page }) => {
  await authenticate(page);
  await mockApis(page, { dodOverdueFixtures: true });
  await page.goto('/student-lad/tasks');
  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();

  await sendKamalMessage(page, 'Mark Weeks 11-12 Quiz as completed.');
  await expect(page.getByText(/from active to completed/).last()).toBeVisible();
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  await expect(page.getByText(/Task updated|Updated/).last()).toBeVisible();
  let task = await getTaskFromApi(page, 'TASK-QUIZ-112') as { status: string };
  expect(task.status).toBe('completed');

  await sendKamalMessage(page, 'can you move that to active task as not completed');
  await expect(page.getByText(/change “Weeks 11-12 Quiz/).last()).toBeVisible();
  await expect(page.getByText(/from completed to active/).last()).toBeVisible();
  const executeRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/kamal/actions/execute'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const payload = (await executeRequest).postDataJSON() as { action: { operation: string; entityId: string; changes: { status: string } } };
  expect(payload.action.operation).toBe('REOPEN');
  expect(payload.action.entityId).toBe('TASK-QUIZ-112');
  expect(payload.action.changes.status).toBe('active');
  task = await getTaskFromApi(page, 'TASK-QUIZ-112') as { status: string };
  expect(task.status).toBe('active');
  const completed = await getTasksFromApi(page, 'completed') as { items: Array<{ id: string }> };
  expect(completed.items.find((item) => item.id === 'TASK-QUIZ-112')).toBeUndefined();
});

test('DOD: unsupported task mutation commands fail closed without LLM success wording', async ({ page }) => {
  await authenticate(page);
  await mockApis(page, { dodOverdueFixtures: true });
  await page.goto('/student-lad/tasks');
  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();

  for (const command of ['Can you fix task 11?', 'Change that task.', 'Complete the thing.', 'Put it as complete']) {
    await sendKamalMessage(page, command);
    await expect(page.getByText(/nothing was changed/i).last()).toBeVisible();
    await expect(page.getByText(/marked as completed/i)).toHaveCount(0);
  }
  const task = await getTaskFromApi(page, 'TASK-QUIZ-112') as { status: string };
  expect(task.status).toBe('active');
});

test('DOD: failed task mutation endpoint never produces completion wording', async ({ page }) => {
  await authenticate(page);
  await mockApis(page, { dodOverdueFixtures: true, failKamalExecute: true });
  await page.goto('/student-lad/tasks');
  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await sendKamalMessage(page, 'Put task 11-12 as completed');
  await expect(page.getByText(/I understood: change “Weeks 11-12 Quiz/).last()).toBeVisible();
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  await expect(page.getByText(/Forced task mutation failure|could not update/i)).toBeVisible();
  await expect(page.getByText(/Updated “Weeks 11-12 Quiz.*completed/i)).toHaveCount(0);
  const task = await getTaskFromApi(page, 'TASK-QUIZ-112') as { status: string };
  expect(task.status).toBe('active');
  const overdue = await getTasksFromApi(page, 'overdue') as { items: Array<{ id: string }> };
  expect(overdue.items).toHaveLength(3);
});

test('Kamal creates a local reminder from natural language and prompts calendar connectors', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Please set a remider for 7pm tommorw.');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText(/I understood: create a local reminder “Reminder from Kamal”/)).toBeVisible();
  await page.getByRole('button', { name: 'Yes, continue' }).click();

  await expect(page.getByText(/Reminder created: Reminder from Kamal/)).toBeVisible();
  await expect(page.getByText('Reminder saved locally')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gmail / Google Calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apple Calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Microsoft Calendar' })).toBeVisible();

  await page.getByRole('button', { name: 'Tasks' }).click();
  await expect(page.getByText('Reminder from Kamal').first()).toBeVisible();
});

test('Kamal marks an existing task as completed through the reminder data source', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Please set a reminder for call advisor tomorrow at 7pm');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  await expect(page.getByText(/Reminder created: Call advisor/)).toBeVisible();

  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('mark call advisor task as completed');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText(/I understood: change “Call advisor” · due .* · currently active from active to completed/)).toBeVisible();
  const updateRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/kamal/actions/execute'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const request = await updateRequest;
  const body = request.postDataJSON() as { action: { entityId: string; changes: { status: string } } };
  expect(body.action.entityId).toBe('REM-VOICE-001');
  expect(body.action.changes.status).toBe('completed');
  await expect(page.getByText(/Updated “Call advisor” to completed/)).toBeVisible();
});

test('Kamal does not fake success for indirect completion wording', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad/tasks');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Put the task 11 to 12 who is as completed');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText(/Nothing was changed|I could not find an active task or reminder matching/)).toBeVisible();
  await expect(page.getByText('Task 11-12 is marked as completed')).toHaveCount(0);
});

test('Kamal completes and undoes the exact persisted electricity bill task', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad/tasks');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Kamal, mark the electricity bill task as completed.');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText(/I understood: change “Pay electricity bill” · due .* · currently active from active to completed/)).toBeVisible();
  const createRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/reminders')) createRequests.push(request.url());
  });
  const executeRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/kamal/actions/execute'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const request = await executeRequest;
  const body = request.postDataJSON() as { action: { entityId: string; operation: string; changes: { status: string } } };
  expect(body.action.entityId).toBe('REM-ELECTRICITY-001');
  expect(body.action.operation).toBe('COMPLETE');
  expect(body.action.changes.status).toBe('completed');
  expect(createRequests).toEqual([]);
  await expect(page.getByText(/Updated “Pay electricity bill” to completed/)).toBeVisible();

  await page.getByRole('button', { name: 'Completed' }).click();
  await expect(page.getByText('Pay electricity bill').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Pay electricity bill').first()).toBeVisible();

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Undo the last change.');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');
  await expect(page.getByText(/I understood: undo the last change/)).toBeVisible();
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  await expect(page.getByText('Undo complete.')).toBeVisible();
  await page.getByRole('button', { name: 'Active' }).click();
  await expect(page.getByText('Pay electricity bill').first()).toBeVisible();
});

test('Kamal mocked voice uses the same Action Engine dispatcher for task completion', async ({ page }) => {
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = 'en-US';
      onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null = null;
      onerror = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ 0: { transcript: 'Mark the electricity bill task completed' }, isFinal: true }],
          });
        }, 50);
      }
      stop() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: MockSpeechRecognition });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: MockSpeechRecognition });
  });
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad/tasks');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByRole('button', { name: 'Voice', exact: true }).click();

  await expect(page.getByText(/I understood: change “Pay electricity bill”/)).toBeVisible();
  const executeRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/kamal/actions/execute'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const request = await executeRequest;
  const body = request.postDataJSON() as { action: { entityId: string; source: string; changes: { status: string } } };
  expect(body.action.entityId).toBe('REM-ELECTRICITY-001');
  expect(body.action.source).toBe('voice');
  expect(body.action.changes.status).toBe('completed');
  await expect(page.getByText(/Updated “Pay electricity bill” to completed/)).toBeVisible();
});

test('Kamal asks for selection before mutating ambiguous electricity bill tasks', async ({ page }) => {
  await authenticate(page);
  await mockApis(page, { duplicateElectricity: true });
  await page.goto('/student-lad/tasks');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Mark the electricity bill task completed');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('I found more than one matching task. Please choose one before I change anything.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay electricity bill/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Review electricity bill statement/ })).toBeVisible();
  const executeRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/kamal/actions/execute')) executeRequests.push(request.url());
  });
  await page.waitForTimeout(200);
  expect(executeRequests).toEqual([]);

  await page.getByRole('button', { name: /Review electricity bill statement/ }).click();
  await expect(page.getByText(/I understood: change “Review electricity bill statement”/)).toBeVisible();
  await page.getByRole('button', { name: 'No, cancel' }).click();
  expect(executeRequests).toEqual([]);
});

test('Kamal answers task list and task count questions from the same task queue', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  const kamal = page.getByRole('dialog', { name: 'Kamal assistant' });
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Tell me my completed task');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(kamal.getByText('You have 1 completed task.')).toBeVisible();
  await expect(kamal.getByText(/Submit reading notes/)).toBeVisible();

  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Yes tell me my overdue task');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(kamal.getByText('You have 1 overdue task.')).toBeVisible();
  await expect(kamal.getByText(/Applied Learning Practicum Reflection/)).toBeVisible();

  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('How many total overdue task do I have in my queue');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(kamal.getByText('You have 1 overdue task.')).toHaveCount(2);
  await expect(kamal.getByText('You currently have 0 overdue tasks in your queue.')).toHaveCount(0);
});

test('Kamal approves pending CEDA review items through the governed review queue', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Kamal approve all pending CEDA items');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('I understood: approve all pending CEDA items. Should I continue? Say yes or no.')).toBeVisible();
  const approveRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/items/bulk-approve'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const request = await approveRequest;
  expect((request.postDataJSON() as { item_ids: string[] }).item_ids).toEqual(['ITEM-PENDING-001']);
  await expect(page.getByText('1 CEDA item approved and saved. Review & Save will refresh now.')).toBeVisible();
  await expect(page).toHaveURL(/\/student-lad\/review/);
});

test('Kamal changes persisted app settings by voice or text command', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Kamal change voice to young woman');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('I understood: change Kamal voice to Asha. Should I continue? Say yes or no.')).toBeVisible();
  const settingRequest = page.waitForRequest((request) => request.method() === 'PUT' && request.url().endsWith('/api/v1/settings/app-preferences'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const request = await settingRequest;
  expect((request.postDataJSON() as { preferences: { voice: string } }).preferences.voice).toBe('Asha');
  await expect(page.getByRole('button', { name: 'Open Kamal assistant' })).toHaveAttribute('data-kamal-voice', 'Asha');
  await expect(page.getByText('Updated Kamal voice to Asha. The setting was saved for this user and logged.')).toBeVisible();
});

test('Kamal answers registered course questions from approved CEDA and Context OS records', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('What courses am I registered for?');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('You have 3 saved courses in Academic:')).toBeVisible();
  await expect(page.getByText('• Adios DSRT734 M2 to the courses description to as a statistic course')).toBeVisible();
  await expect(page.getByText('• Course: DSRT 850')).toBeVisible();
  await expect(page.getByText('• Course INTR799')).toBeVisible();
  await expect(page.getByText(/approved CEDA\/Context OS academic records/)).toBeVisible();
});

test('Academic KPI cards count saved courses from Context OS and approved CEDA rows', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad/academic');

  await expect(page.getByRole('button', { name: /^3 Courses$/ })).toBeVisible();
  await page.getByRole('button', { name: /^3 Courses$/ }).click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
  await expect(page.getByText('Course INTR799')).toBeVisible();
  await expect(page.getByText('Course: DSRT 850')).toBeVisible();
  await expect(page.getByText('Adios DSRT734 M2 to the courses description to as a statistic course')).toBeVisible();
});

test('Kamal navigates to the Student-LAD homepage before explaining the page', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad/academic');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Kamal take me to the homepage');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('I understood: open Home. Should I continue? Say yes or no.')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, continue' }).click();

  await expect(page).toHaveURL(/\/student-lad$/);
  const kamalDialog = page.getByRole('dialog', { name: 'Kamal assistant' });
  await expect(kamalDialog.getByText(/Opening Home\. Home is your Student-LAD starting point/)).toBeVisible({ timeout: 10_000 });
});

test('Kamal routes report creation to Workspace AI instead of nonexistent Reports dashboard', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Kamal create a report about my statistics assignment');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('I understood: open Workspace AI and prepare this report request. Should I continue? Say yes or no.')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, continue' }).click();

  await expect(page).toHaveURL(/\/dorje-ai/);
  await expect(page.getByText('Reports are created through Workspace AI chat.')).toBeVisible();
  await expect(page.getByText(/Reports section|Dashboard|Create New Report/)).toHaveCount(0);
});


test('Kamal resolves weekday reminder commands to the next matching weekday', async ({ page }) => {
  await page.addInitScript(() => {
    const fixedTime = new Date('2026-07-12T12:00:00-04:00').getTime();
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: [number | string | Date] | []) {
        if (args.length === 0) super(fixedTime);
        else super(...args);
      }
      static now() { return fixedTime; }
    }
    window.Date = MockDate as DateConstructor;
  });
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('monday reminder at 4pm');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText(/I understood: create a local reminder “Reminder from Kamal” for Mon, Jul 13/)).toBeVisible();
  const createRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/reminders'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const request = await createRequest;
  const body = request.postDataJSON() as { title: string; due_at: string };
  const due = new Date(body.due_at);
  expect(body.title).toBe('Reminder from Kamal');
  expect(due.getDay()).toBe(1);
  expect(due.getHours()).toBe(16);
});


test('Kamal adds a course record to Academic through CEDA instead of refusing', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Kamal add course INTR799 to the academic section');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('I understood: add course INTR799 to the academic section. Should I continue? Say yes or no.')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, continue' }).click();

  await expect(page.getByText('Added course INTR799 to the academic section. Opening it now.')).toBeVisible();
  await expect(page).toHaveURL(/\/student-lad\/academic/);
});

test('Kamal adds scheduled class time as an academic task record', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Kamal add scheduled class INTR799 Monday 4pm');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('I understood: add scheduled class INTR799 Monday 4pm to the academic section. Should I continue? Say yes or no.')).toBeVisible();
  const extractRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/extract'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const request = await extractRequest;
  const body = request.postDataJSON() as { text: string; source_type: string };
  expect(body.text).toContain('academic record: scheduled class INTR799 Monday 4pm');
  expect(body.source_type).toBe('kamal_voice_or_text');
  await expect(page.getByText('Added scheduled class INTR799 Monday 4pm to the academic section. Opening it now.')).toBeVisible();
  await expect(page).toHaveURL(/\/student-lad\/academic/);
});


test('Kamal removes an academic course through Context OS instead of saving a remove record', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad');

  await page.getByRole('button', { name: 'Open Kamal assistant' }).click();
  await page.getByPlaceholder('Ask Kamal or enter a command…').fill('Kamal remove course INTR799 from the academic section');
  await page.getByPlaceholder('Ask Kamal or enter a command…').press('Enter');

  await expect(page.getByText('I understood: remove course INTR799 from the academic section. Should I continue? Say yes or no.')).toBeVisible();
  const transition = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/objects/CTX-ACA-COURSE/transition'));
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  const request = await transition;
  const body = request.postDataJSON() as { target: string; reason: string };
  expect(body.target).toBe('deleted');
  expect(body.reason).toContain('Kamal remove command');
  await expect(page.getByText('Removed Course INTR799 from academic. The remove command was logged by CEDA.')).toBeVisible();
});
