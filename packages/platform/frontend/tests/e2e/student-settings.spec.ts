import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'student-settings-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 505, email: 'settings@example.com', full_name: 'Settings User' }));
  });
}

async function mockApis(page: Page) {
  await page.route(`${API}/api/v1/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      if (path.endsWith('/settings/device-profile')) {
        const posted = request.postDataJSON() as { device_mode?: string; resource_profile?: string; connectivity_mode?: string };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ device_mode: posted.device_mode || 'desktop', resource_profile: posted.resource_profile || '16gb', connectivity_mode: posted.connectivity_mode || 'hybrid', resource_rules: {}, connectivity_rules: {} }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const body = path.endsWith('/student-lad/settings/summary')
      ? {
        profile: { display_name: 'Settings User', email: 'settings@example.com', timezone: 'America/New_York', institution: 'Northeastern University', workspace: 'Fall 2026' },
        appearance: { theme: 'system', density: 'comfortable', text_size: 'standard' },
        ai_connectivity: { mode: 'hybrid', cloud_approval: 'ask_every_time', live_information: true, connector_access: true },
        notifications: { in_app: true, desktop: true, email: false, quiet_hours: { start: '22:00', end: '07:00' } },
        privacy: { storage_mode: 'local_first', chat_retention_days: 7, summary_retention_days: 30, sensitive_auto_save: false },
        connections: { connected_count: 2, attention_count: 0 },
        backup: { last_backup: 'local', status: 'available' },
        plan: { name: 'Free' },
        advanced: { performance_mode: 'standard', developer_mode: false, system_health: 'ready' },
      }
      : path.endsWith('/ceda/dashboard') ? { workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: 0, context_health_score: 100, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
        : path.endsWith('/context-os/health') ? { score: 100, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }
          : path.endsWith('/ceda/reminders') ? { items: [], immigration_disclaimer: '' }
            : path.endsWith('/ceda/policies') ? { academic: { save: 'ask_first', cloud: false, retention_days: 365 } }
              : path.endsWith('/settings/device-profile') ? { device_mode: 'desktop', resource_profile: '16gb', connectivity_mode: 'hybrid', resource_rules: {}, connectivity_rules: {} }
                : path.endsWith('/settings/history-policy') ? { tier: 'free', history_policy: { raw_chat_history_days: 7, summary_history_days: 30, daily_summary_enabled: true, weekly_summary_enabled: false, cross_device_history: false, max_saved_conversations: 10 }, memory_policy: {}, ui_rules: {} }
                  : path.endsWith('/settings/orchestration-policy') ? { tier: 'free', memory_policy: { classes: [] }, upload_limits: {}, model_residency: {} }
                    : path.endsWith('/pie/policies') || path.endsWith('/pie/decisions') || path.endsWith('/context-os/registry') || path.endsWith('/wkim/storage-locations') || path.endsWith('/wkim/catalog') ? []
                      : path.endsWith('/wkim/health') ? { score: 100, workspaces: 0, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }
                        : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
});

test('Settings landing page shows the compact SectionCard settings stack', async ({ page }) => {
  await page.goto('/student-lad/settings', { waitUntil: 'domcontentloaded' });

  const main = page.locator('#student-lad-main');
  await expect(main.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText('Configure your account, personalization, security, notifications, and local runtime profile.')).toBeVisible();

  for (const section of ['Account', 'Personalization', 'AI & Execution', 'Desktop Capture', 'Notifications', 'Security', 'Advanced']) {
    await expect(page.getByRole('heading', { name: section })).toBeVisible();
  }

  await expect(page.getByText('Billing Mode')).toHaveCount(0);
  await expect(page.getByText('Model residency')).toHaveCount(0);
  await expect(page.getByText('Memory policy')).toHaveCount(0);
  await expect(page.getByText('Recent permission decisions')).toHaveCount(0);
  await expect(page.getByText('Academic Policy')).toHaveCount(0);
  await expect(page.getByText('Free/Paid/Enterprise')).toHaveCount(0);

  await expect(page.getByText('Name')).toBeVisible();
  await expect(main.getByText('Settings User')).toBeVisible();
  await expect(page.getByText('Institution')).toBeVisible();
  await expect(page.getByText('Northeastern University')).toBeVisible();
  await expect(page.getByText('Execution Mode', { exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Hybrid' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Change password' })).toBeVisible();
});

test('Settings personalization and notification controls persist for the signed-in user', async ({ page }) => {
  await page.goto('/student-lad/settings', { waitUntil: 'domcontentloaded' });

  await expect(page.getByLabel('Open Kamal assistant')).toHaveText('🪷');
  await page.getByRole('button', { name: /🧭/ }).click();
  await expect(page.getByLabel('Open Kamal assistant')).toHaveText('🧭');
  await page.getByLabel('Open Kamal assistant').click();
  await expect(page.getByRole('dialog', { name: 'Kamal assistant' }).locator('header')).toContainText('🧭');
  await page.getByLabel('Open Kamal assistant').click();

  const shell = page.locator('.student-lad');
  await expect(shell).toHaveAttribute('data-accent-color', 'Emerald');
  await expect(shell).toHaveAttribute('data-ui-theme', 'Prism');
  await expect(shell).toHaveAttribute('data-app-background', 'Warm White');
  await page.getByRole('button', { name: 'Rose' }).click();
  await page.getByRole('button', { name: 'Studio Creative focus and contrast.' }).click();
  await page.getByRole('button', { name: 'Mint' }).click();
  await expect(shell).toHaveAttribute('data-accent-color', 'Rose');
  await expect(shell).toHaveAttribute('data-ui-theme', 'Studio');
  await expect(shell).toHaveAttribute('data-app-background', 'Mint');

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveClass(/bg-slate-950/);

  await expect(page.getByLabel('Open Kamal assistant')).toHaveAttribute('data-kamal-voice', 'Maya');
  await page.getByRole('button', { name: 'Preview Asha voice' }).click();
  await expect(page.getByText(/Playing Asha preview|Voice preview is not available/)).toBeVisible();
  await expect(page.getByLabel('Open Kamal assistant')).toHaveAttribute('data-kamal-voice', 'Maya');
  await page.getByRole('button', { name: 'Apply Kamal Voice' }).click();
  await expect(page.getByLabel('Open Kamal assistant')).toHaveAttribute('data-kamal-voice', 'Asha');
  await page.getByLabel('Open Kamal assistant').click();
  await expect(page.getByRole('dialog', { name: 'Kamal assistant' })).toHaveAttribute('data-kamal-voice', 'Asha');
  await page.getByLabel('Open Kamal assistant').click();

  const emailReminderToggle = page.getByRole('switch').nth(2);
  await expect(emailReminderToggle).toHaveAttribute('aria-checked', 'false');
  await emailReminderToggle.click();
  await expect(emailReminderToggle).toHaveAttribute('aria-checked', 'true');

  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('student_lad_app_store:user:505') || '{}');
    return `${stored.theme}|${stored.kamalAvatar}|${stored.voice}|${stored.accentColor}|${stored.uiTheme}|${stored.background}|${stored.notifications?.email}`;
  })).toBe('Dark|🧭|Asha|Rose|Studio|Mint|true');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Open Kamal assistant')).toHaveText('🧭');
  await expect(page.getByLabel('Open Kamal assistant')).toHaveAttribute('data-kamal-voice', 'Asha');
  await expect(shell).toHaveAttribute('data-accent-color', 'Rose');
  await expect(shell).toHaveAttribute('data-ui-theme', 'Studio');
  await expect(shell).toHaveAttribute('data-app-background', 'Mint');
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveClass(/bg-slate-950/);
  await expect(page.getByText('Current: Asha')).toBeVisible();
  await expect(page.getByRole('switch').nth(2)).toHaveAttribute('aria-checked', 'true');
});

test('Settings Security can change the account password', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route(`${API}/api/v1/auth/change-password`, async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Password changed. Other sessions were signed out.' }) });
  });
  await page.goto('/student-lad/settings', { waitUntil: 'domcontentloaded' });

  await page.getByRole('textbox', { name: 'Current password' }).fill('OldPassword123!');
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill('NewPassword123!');
  await page.getByRole('textbox', { name: 'Confirm new password' }).fill('NewPassword123!');
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page.getByText('Password changed. Other sessions were signed out.')).toBeVisible();
  expect(payload).toEqual({ current_password: 'OldPassword123!', new_password: 'NewPassword123!' });
});

test('AI execution and RAM profile settings are available before download', async ({ page }) => {
  await page.goto('/student-lad/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'AI & Execution' })).toBeVisible();

  await page.getByRole('button', { name: /^Offline/ }).click();
  await expect(page.getByRole('button', { name: /^Offline/ })).toHaveClass(/bg-slate-950/);

  await page.getByRole('button', { name: 'Lightweight' }).click();
  await expect(page.getByRole('button', { name: 'Lightweight' })).toHaveClass(/bg-slate-950/);
  await expect(page.getByText('8GB RAM', { exact: true })).toBeVisible();
  await expect(page.getByText('16GB RAM', { exact: true })).toBeVisible();
  await expect(page.getByText('32GB RAM', { exact: true })).toBeVisible();
});

test('Desktop capture and Advanced stay compact with diagnostics behind disclosure', async ({ page }) => {
  await page.goto('/student-lad/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Desktop Capture' })).toBeVisible();
  await expect(page.getByText('Capture selected text, screen content, or webinar audio into temporary summaries.')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Advanced' })).toBeVisible();
  await expect(page.getByText('deepseek-r1')).toHaveCount(0);
  await expect(page.getByText('qwen3:8b')).toHaveCount(0);

  await page.getByText('Show local model diagnostics').click();
  await expect(page.getByText('Model ready')).toBeVisible();
  await expect(page.getByText('Server port')).toBeVisible();
});
