import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'my-day-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 707, email: 'myday@example.com', full_name: 'Mayank' }));
  });
}

async function mockApis(page: Page) {
  await page.route(`${API}/api/v1/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const body = path.endsWith('/ceda/dashboard')
      ? { workspace: 'Student Workspace', pending_approvals: 1, upcoming_reminders: 2, context_health_score: 88, privacy_risk_score: 4, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
      : path.endsWith('/ceda/reminders') ? { items: [{ id: 'rem-1', title: 'Statistics assignment due', priority: 'critical', due_at: '2026-07-13T23:59:00', reminder_date: '2026-07-13T22:59:00', status: 'active' }], immigration_disclaimer: '' }
        : path.endsWith('/context-os/health') ? { score: 88, total_objects: 3, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }
          : path.endsWith('/ceda/policies') ? { academic: { save: 'ask_first', cloud: false, retention_days: 365 } }
            : path.endsWith('/settings/device-profile') ? { device_mode: 'desktop', resource_profile: '16gb', connectivity_mode: 'hybrid', resource_rules: {}, connectivity_rules: {} }
              : path.endsWith('/settings/history-policy') ? { tier: 'free', history_policy: { raw_chat_history_days: 7, summary_history_days: 30, daily_summary_enabled: true, weekly_summary_enabled: false, cross_device_history: false, max_saved_conversations: 10 }, memory_policy: {}, ui_rules: {} }
                : path.endsWith('/settings/orchestration-policy') ? { tier: 'free', memory_policy: { classes: [] }, upload_limits: {}, model_residency: {} }
                  : path.endsWith('/wkim/health') ? { score: 100, workspaces: 0, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }
                    : path.endsWith('/pie/policies') || path.endsWith('/pie/decisions') || path.endsWith('/context-os/registry') || path.endsWith('/wkim/storage-locations') || path.endsWith('/wkim/catalog') ? []
                      : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
});

test('My Day presents the daily operating dashboard and five well-being areas', async ({ page }) => {
  await page.goto('/student-lad/my-day');

  await expect(page.getByRole('heading', { name: 'My Day' }).first()).toBeVisible();
  await expect(page.getByText('Monday, July 13, 2026').first()).toBeVisible();
  await expect(page.getByText('Good morning, Mayank.')).toBeVisible();
  await expect(page.getByText(/You have 3 priorities/)).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Daily Timeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top Priorities' })).toBeVisible();
  await expect(page.getByLabel('Top priorities and conflicts')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Day Assistant' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conflict detected' })).toBeVisible();
});

test('My Day top card remains visible on phone view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student-lad/my-day');

  await expect(page.getByLabel('My Day daily activity dashboard').getByRole('heading', { name: 'My Day' })).toBeVisible();
  await expect(page.getByText('Monday, July 13, 2026').first()).toBeVisible();
  await expect(page.getByText('Good morning, Mayank.')).toBeVisible();
  await expect(page.getByText('You have 3 priorities, 11 scheduled events, and 5 items needing attention.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Timeline' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible();
});

test('My Day switches between Timeline and Activity Log', async ({ page }) => {
  await page.goto('/student-lad/my-day');

  await page.getByRole('tab', { name: 'Activity Log' }).click();
  await expect(page.getByRole('heading', { name: 'Activity Log' })).toBeVisible();
  await expect(page.getByText('Recorded lunch expense')).toBeVisible();

  await expect(page.getByRole('tab', { name: 'Five Areas' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More options' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByRole('heading', { name: 'Daily Timeline' })).toBeVisible();
});

test('My Day toggles Day, Week, Month, and Year summaries', async ({ page }) => {
  await page.goto('/student-lad/my-day');

  await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Daily Timeline' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Day Task Summary', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /High priority:/ }).click();
  await expect(page.getByRole('heading', { name: 'High Priority Tasks' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await page.getByRole('button', { name: /Done:/ }).click();
  await expect(page.getByRole('heading', { name: 'Completed Tasks' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await page.getByRole('button', { name: 'See individual areas' }).click();
  await expect(page.getByRole('cell', { name: 'Academic' })).toBeVisible();
  await page.getByRole('button', { name: 'Hide individual areas' }).click();

  await page.getByRole('tab', { name: 'Week' }).click();
  await expect(page.getByRole('heading', { name: 'My Week Summary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Week Task Summary', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'See individual areas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Timeline' })).toHaveCount(0);
  await page.getByRole('button', { name: 'See individual areas' }).click();
  await expect(page.getByRole('cell', { name: 'Academic' })).toBeVisible();

  await page.getByRole('tab', { name: 'Month' }).click();
  await expect(page.getByRole('heading', { name: 'My Month Summary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Month Task Summary', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Year' }).click();
  await expect(page.getByRole('heading', { name: 'My Year Summary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Year Task Summary', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Today' }).click();
  await expect(page.getByLabel('My Day daily activity dashboard').getByRole('heading', { name: 'My Day' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily Timeline' })).toBeVisible();
});

test('My Day keeps capture work in Kamal instead of showing the old add/update card', async ({ page }) => {
  await page.goto('/student-lad/my-day');

  await expect(page.getByText('What would you like to add or update?')).toHaveCount(0);
  await expect(page.getByPlaceholder(/Tell Kamal about a class/)).toHaveCount(0);
  await expect(page.getByText('Voice: Ready')).toHaveCount(0);

  await expect(page.getByRole('tab', { name: 'Five Areas' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More options' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ask Kamal' }).first().click();
  await expect(page.getByRole('heading', { name: 'Kamal', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Ask Kamal or enter a command…')).toBeVisible();
});

test('My Day completion actions update the Activity Log', async ({ page }) => {
  await page.goto('/student-lad/my-day');

  const gym = page.getByRole('listitem').filter({ hasText: 'Gym' }).first();
  await gym.getByRole('button', { name: 'Complete' }).click();

  await page.getByRole('tab', { name: 'Activity Log' }).click();
  await expect(page.getByText('Completed Gym')).toBeVisible();
});


test('My Day resets summary filters and shows an empty pipeline for dates without tasks', async ({ page }) => {
  await page.goto('/student-lad/my-day');

  await page.getByRole('button', { name: /High priority:/ }).click();
  await expect(page.getByRole('heading', { name: 'High Priority Tasks' })).toBeVisible();

  await page.getByRole('tab', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { name: 'High Priority Tasks' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Daily Timeline' })).toBeVisible();

  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByText('Nothing in pipeline yet.').first()).toBeVisible();
});
