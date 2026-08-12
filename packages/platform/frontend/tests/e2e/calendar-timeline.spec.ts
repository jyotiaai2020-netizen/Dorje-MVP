import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'calendar-timeline-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 808, email: 'calendar@example.com', full_name: 'Calendar User' }));
  });
}

async function mockApis(page: Page) {
  const reminders = [
    {
      id: 'REM-JULY-001',
      context_id: null,
      context_item_id: null,
      title: 'Reminder from Kamal',
      due_at: '2026-07-11T23:00:00.000Z',
      reminder_date: '2026-07-11T23:00:00.000Z',
      priority: 'normal',
      confidence: 0.92,
      status: 'active',
      official_verification_required: false,
    },
    {
      id: 'REM-SEPT-001',
      context_id: 'CTX-IMM-001',
      context_item_id: null,
      title: 'Visa renewal planning window',
      due_at: '2026-09-05T13:00:00.000Z',
      reminder_date: '2026-09-05T13:00:00.000Z',
      priority: 'high',
      confidence: 0.96,
      status: 'active',
      official_verification_required: true,
    },
    {
      id: 'REM-CONFLICT-001',
      context_id: null,
      context_item_id: null,
      title: 'Conflicting study block',
      due_at: '2026-07-11T23:00:00.000Z',
      reminder_date: '2026-07-11T23:00:00.000Z',
      priority: 'high',
      confidence: 0.88,
      status: 'active',
      official_verification_required: false,
    },
  ];

  await page.route(`${API}/api/v1/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/ceda/reminders')) {
      const body = request.postDataJSON() as { title: string; due_at: string; reminder_date: string; priority: string };
      const reminder = {
        id: `REM-CALENDAR-${reminders.length + 1}`,
        context_id: `CTX-PER-CALENDAR-${reminders.length + 1}`,
        context_item_id: null,
        title: body.title,
        due_at: body.due_at,
        reminder_date: body.reminder_date,
        priority: body.priority,
        confidence: 0.92,
        status: 'active',
        official_verification_required: false,
      };
      reminders.unshift(reminder);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reminder) });
      return;
    }
    if (request.method() === 'PATCH' && path.includes('/ceda/reminders/')) {
      const id = path.split('/').pop();
      const body = request.postDataJSON() as Record<string, string>;
      const index = reminders.findIndex((item) => item.id === id);
      if (index >= 0) reminders[index] = { ...reminders[index], ...body };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reminders[index] || {}) });
      return;
    }
    if (request.method() === 'DELETE' && path.includes('/ceda/reminders/')) {
      const id = path.split('/').pop();
      const index = reminders.findIndex((item) => item.id === id);
      const deleted = index >= 0 ? { ...reminders[index], status: 'deleted' } : {};
      if (index >= 0) reminders.splice(index, 1);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deleted) });
      return;
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
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
                      : path.endsWith('/pie/policies') || path.endsWith('/pie/decisions') || path.endsWith('/context-os/registry') || path.endsWith('/wkim/catalog') ? []
                        : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('Tasks renders merged calendar, tasks, holidays, and reminder actions', async ({ page }) => {
  test.setTimeout(60_000);
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad/calendar');
  const main = page.locator('#student-lad-main');
  await expect(page.getByRole('heading', { name: 'All events, tasks, and reminders in one place.' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(page.getByText('Reminder from Kamal').first()).toBeVisible();

  await main.getByRole('button', { name: 'Tasks', exact: true }).click();
  const hierarchy = page.getByLabel('Task hierarchy');
  await expect(hierarchy.getByRole('button', { name: /All Tasks\s+3/ })).toBeVisible();
  await expect(hierarchy.getByText('Time')).toBeVisible();
  await expect(hierarchy.getByRole('button', { name: /Overdue\s+2/ })).toBeVisible();
  await expect(hierarchy.getByText('Categories')).toBeVisible();
  await expect(hierarchy.getByRole('button', { name: /Academic\s+2/ })).toBeVisible();
  await expect(hierarchy.getByRole('button', { name: /Immigration\s+1/ })).toBeVisible();
  await hierarchy.getByRole('button', { name: /Immigration\s+1/ }).click();
  await expect(page.getByText('Visa renewal planning window').first()).toBeVisible();
  await expect(page.getByText('Reminder from Kamal').first()).toHaveCount(0);

  await main.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByLabel('Calendar conflict resolution')).toBeVisible();
  await expect(page.getByText(/Reminder from Kamal ↔ Conflicting study block|Conflicting study block ↔ Reminder from Kamal/)).toBeVisible();
  await page.getByRole('button', { name: 'Keep both' }).click();
  await expect(page.getByText('Saved: Keep both')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Saved: Keep both')).toBeVisible();

  await page.getByRole('button', { name: 'Agenda' }).click();
  await expect(page.getByText('Reminder from Kamal').first()).toBeVisible();
  await expect(page.getByText('Visa renewal planning window').first()).toBeVisible();

  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByText(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next month' })).toBeEnabled();

  const dialogResponses = ['July 20 academic deadline', '2026-07-20 19:00', 'Updated July 20 deadline', '2026-07-20 20:00', 'high', '__accept__'];
  page.on('dialog', async dialog => {
    const response = dialogResponses.shift();
    if (response === '__accept__' || response === undefined) await dialog.accept();
    else await dialog.accept(response);
  });

  const createRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/reminders'));
  await page.getByTitle('Add Event').click();
  const created = await createRequest;
  expect(created.postDataJSON()).toMatchObject({ title: 'July 20 academic deadline', priority: 'normal' });
  await expect(page.getByText('July 20 academic deadline').first()).toBeVisible();

  await page.getByRole('button', { name: 'Agenda' }).click();
  const editRequest = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().includes('/api/v1/ceda/reminders/'));
  await page.getByTitle('Edit').first().click();
  const edited = await editRequest;
  expect(edited.postDataJSON()).toMatchObject({ title: 'Updated July 20 deadline', priority: 'high' });
  await expect(page.getByText('Updated July 20 deadline').first()).toBeVisible();

  const deleteRequest = page.waitForRequest((request) => request.method() === 'DELETE' && request.url().includes('/api/v1/ceda/reminders/'));
  await page.getByTitle('Delete').first().click();
  await deleteRequest;

  await main.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByPlaceholder(/Add task naturally/)).toBeVisible();
  await page.getByPlaceholder(/Add task naturally/).fill('Finish essay by Friday');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Finish essay by Friday')).toBeVisible();
});
