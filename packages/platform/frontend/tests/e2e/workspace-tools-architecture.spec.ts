import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'workspace-tools-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 909, email: 'tools@example.com', full_name: 'Tool User' }));
  });
}

async function mockApis(page: Page) {
  await page.route(`${API}/api/v1/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/connectors')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { provider: 'gmail', name: 'Gmail', status: 'not_connected' },
          { provider: 'google-drive', name: 'Google Drive', status: 'connected', account_email: 'tools@example.com' },
          { provider: 'microsoft-email', name: 'Outlook Email', status: 'not_connected' },
          { provider: 'apple-mail', name: 'Apple Mail / iCloud Mail', status: 'not_connected' },
          { provider: 'linkedin', name: 'LinkedIn', status: 'not_connected' },
        ]),
      });
      return;
    }
    if (path.endsWith('/ceda/dashboard')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: 0, context_health_score: 100, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }) });
      return;
    }
    if (path.endsWith('/context-os/health')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ score: 100, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }) });
      return;
    }
    if (path.endsWith('/ceda/reminders')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], immigration_disclaimer: '' }) });
      return;
    }
    if (path.endsWith('/ceda/policies')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ academic: { save: 'ask_first', cloud: false, retention_days: 365 } }) });
      return;
    }
    if (path.endsWith('/wkim/storage-locations')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (path.endsWith('/wkim/health')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ score: 100, workspaces: 0, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }) });
      return;
    }
    if (path.endsWith('/pie/policies') || path.endsWith('/pie/decisions') || path.endsWith('/context-os/registry') || path.endsWith('/wkim/catalog')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
});

test('canonical connector center manages connectors only, not creative tool tabs', async ({ page }) => {
  await page.goto('/student-lad/connectors');

  await expect(page.getByRole('heading', { name: 'Connectors & Content Studio' })).toBeVisible();
  const connectorPanel = page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: 'Connectors' }) });
  await expect(page.getByRole('heading', { name: 'Gmail' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Google Drive' })).toBeVisible();
  await expect(connectorPanel.getByRole('button', { name: 'Email', exact: true })).toHaveCount(0);
  await expect(connectorPanel.getByRole('button', { name: 'Social', exact: true })).toHaveCount(0);
  await expect(connectorPanel.getByRole('button', { name: 'Reports', exact: true })).toHaveCount(0);
  await expect(connectorPanel.getByRole('button', { name: 'Media', exact: true })).toHaveCount(0);
});

test('old connector route redirects to the canonical connector center', async ({ page }) => {
  await page.goto('/dorje-ai/connectors?tab=Email');
  await page.waitForURL(/\/student-lad\/connectors/);
  await expect(page.getByRole('heading', { name: 'Connectors & Content Studio' })).toBeVisible();
});

test('old report route redirects to Workspace AI', async ({ page }) => {
  await page.goto('/reports');
  await page.waitForURL(/\/dorje-ai/);
  await expect(page.getByRole('heading', { name: 'Workspace AI' })).toBeVisible();
});

test('shared Workspace tool host opens email, social, report, and media as slide-in tools', async ({ page }) => {
  await page.goto('/student-lad');
  await expect(page.getByRole('button', { name: 'Open DorjeAI orchestrator top view' })).toBeVisible();

  for (const [tool, label] of [['email', 'Email Composer'], ['social', 'Social Publisher'], ['report', 'Report Builder'], ['media', 'Media Studio']] as const) {
    await page.evaluate(({ toolName }) => {
      window.dispatchEvent(new CustomEvent('workspace-tool:open', { detail: { tool: toolName, context: 'Use this test context.' } }));
    }, { toolName: tool });
    await expect(page.getByRole('dialog', { name: label })).toBeVisible();
    await page.getByRole('button', { name: `Close ${label}` }).click();
    await expect(page.getByRole('dialog', { name: label })).toHaveCount(0);
  }
});
