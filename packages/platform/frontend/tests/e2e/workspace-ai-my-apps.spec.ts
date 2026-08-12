import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'workspace-ai-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 404, email: 'workspace.ai@example.com', full_name: 'Workspace AI User' }));
  });
}

async function mockStudentApis(page: Page) {
  await page.route(`${API}/api/v1/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const body = path.endsWith('/ceda/dashboard')
      ? { workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: 0, context_health_score: 100, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
      : path.endsWith('/context-os/health') ? { score: 100, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }
        : path.endsWith('/ceda/reminders') ? { items: [], immigration_disclaimer: '' }
          : path.endsWith('/ceda/policies') ? { academic: { save: 'ask_first', cloud: false, retention_days: 365 } }
            : path.endsWith('/wkim/storage-locations') ? [{ location_id: 'system-local', name: 'System / Local Device', location: 'Local device storage', storage_type: 'system', category: 'system', sync_mode: 'local_only', health_status: 'available', permission_level: 'user_approved_paths_only', watcher_enabled: false, source: 'system', status: 'available', disconnectable: false }]
              : path.endsWith('/wkim/health') ? { score: 100, workspaces: 1, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }
                : path.endsWith('/pie/policies') || path.endsWith('/pie/decisions') || path.endsWith('/context-os/registry') || path.endsWith('/wkim/catalog') ? []
                  : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockStudentApis(page);
});

test('Student-LAD Ask Kamal opens the global Kamal assistant', async ({ page }) => {
  await page.goto('/student-lad');

  await expect(page.getByRole('navigation').getByRole('link', { name: 'Workspace AI' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Policies', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connectors', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vault', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ask Kamal' }).first().click();
  await expect(page.getByRole('heading', { name: 'Kamal' })).toBeVisible();
  await expect(page.getByPlaceholder(/ask kamal/i)).toBeVisible();
});

test('Workspace AI exposes only Home, Chat History, My Apps and Settings in its left panel', async ({ page }) => {
  await page.goto('/dorje-ai');

  await expect(page.getByRole('heading', { name: 'Workspace AI' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chat History' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'My Apps' })).toBeVisible();
  const workspaceNav = page.locator('aside[aria-label="Workspace AI navigation"]');
  await expect(workspaceNav.locator('a[title="Student-LAD Settings"]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Templates' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Connectors' })).toHaveCount(0);

  await workspaceNav.locator('a[title="Student-LAD Settings"]').click();
  await page.waitForURL(/\/student-lad\/settings/);
  await expect(page.locator('#student-lad-main').getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('Workspace AI left panel can unpin, slide in on hover, and pin again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dorje-ai');

  const sidebar = page.locator('aside[aria-label="Workspace AI navigation"]');
  await expect(sidebar.getByRole('heading', { name: 'Workspace AI' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Unpin Workspace AI panel' }).click();
  await page.mouse.move(900, 450);
  await expect(sidebar.getByRole('heading', { name: 'Workspace AI' })).toBeHidden();
  await expect(sidebar.getByRole('button', { name: 'Pin Workspace AI panel' })).toBeVisible();

  await sidebar.hover();
  await expect(sidebar.getByRole('heading', { name: 'Workspace AI' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Pin Workspace AI panel' }).click();
  await expect(sidebar.getByRole('button', { name: 'Unpin Workspace AI panel' })).toBeVisible();
});

test('Workspace AI maps only the 3 latest conversations under Recent conversations', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date('2026-07-10T12:00:00.000Z').getTime();
    const conversations = ['Newest planning chat', 'Second coursework chat', 'Third report chat', 'Oldest hidden chat'].map((title, index) => ({
      id: `chat-${index}`,
      title,
      createdAt: new Date(now - index * 60_000).toISOString(),
      updatedAt: new Date(now - index * 60_000).toISOString(),
      messages: [{ role: 'user', content: title }],
    }));
    localStorage.setItem('dorje_chat_history:user:404', JSON.stringify(conversations));
    localStorage.setItem('student_lad_history_policy:user:404', JSON.stringify({ raw_chat_history_days: 7, summary_history_days: 30, max_saved_conversations: 10, daily_summary_enabled: true, weekly_summary_enabled: false, cross_device_history: false }));
  });
  await page.goto('/dorje-ai');

  await expect(page.getByText('Recent conversations')).toBeVisible();
  await expect(page.getByText('Newest planning chat')).toBeVisible();
  await expect(page.getByText('Second coursework chat')).toBeVisible();
  await expect(page.getByText('Third report chat')).toBeVisible();
  await expect(page.getByText('Oldest hidden chat')).toHaveCount(0);

  await page.getByRole('button', { name: 'Chat History' }).click();
  await expect(page.getByRole('heading', { name: 'Chat history' })).toBeVisible();
  await expect(page.getByText('Oldest hidden chat')).toBeVisible();
});

test('Workspace AI Home returns from My Apps to the Student-LAD Home page', async ({ page }) => {
  await page.goto('/dorje-ai');
  await page.getByRole('button', { name: 'My Apps' }).click();
  await expect(page.getByRole('heading', { name: 'My Apps' })).toBeVisible();

  await page.getByRole('link', { name: 'Home' }).click();
  await page.waitForURL(/\/student-lad/);
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
});

test('My Apps creates alphabetized app buttons from saved links and folders', async ({ page }) => {
  await page.goto('/dorje-ai');
  await page.getByRole('button', { name: 'My Apps' }).click();

  await page.getByRole('button', { name: 'Open folder form' }).click();
  await page.getByPlaceholder('Research, Coding, University…').fill('Coding');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Website URL').fill('https://codex.com/user');
  await page.locator('#my-apps-add-link-form select').selectOption('Coding');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await page.getByRole('button', { name: 'Add link' }).click();
  await page.getByLabel('Website URL').fill('https://www.github.com/openai');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  const coding = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Coding' }) });
  await expect(coding.getByRole('link', { name: /Codex/ })).toHaveAttribute('href', 'https://codex.com/user');
  await expect(coding.getByRole('link', { name: /Github/ })).toHaveAttribute('href', 'https://www.github.com/openai');

  const labels = await coding.getByRole('link').allTextContents();
  expect(labels.map((label) => label.replace(/\s+/g, ' ').trim())).toEqual(['✦ Codex codex.com', '✦ Github github.com']);
});
