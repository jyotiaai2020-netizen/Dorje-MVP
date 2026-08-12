import { expect, test } from '@playwright/test';

async function authenticate(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'playwright-chat-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 321, email: 'chat.smoke@example.com', name: 'Chat Smoke' }));
  });
}

async function mockStudentApis(page: import('@playwright/test').Page) {
  await page.route('http://127.0.0.1:8100/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/dorje-ai/chat')) {
      await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: 'Dorje chat is online.' });
      return;
    }
    if (path.endsWith('/chat/kamal')) {
      await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: 'Kamal chat is online.' });
      return;
    }
    if (path.endsWith('/context-os/registry')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (path.endsWith('/wkim/storage-locations') || path.endsWith('/wkim/catalog') || path.endsWith('/pie/policies') || path.endsWith('/pie/decisions')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (path.endsWith('/context-os/health')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ score: 100, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }) });
      return;
    }
    if (path.endsWith('/wkim/health')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ score: 100, workspaces: 0, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }) });
      return;
    }
    if (path.endsWith('/ceda/dashboard')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: 0, context_health_score: 100, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }) });
      return;
    }
    if (path.endsWith('/dorje-ai/orchestration/status')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, agents: [], tier: 'free', pipeline: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) });
  });
}

test('Dorje chat submission streams without Load failed', async ({ page }) => {
  await authenticate(page);
  await mockStudentApis(page);
  await page.goto('/dorje-ai');
  await page.getByPlaceholder(/Ask, analyze, create/i).fill('Say hello.');
  await page.locator('#dorje-send-message').click();
  await expect(page.getByText('Dorje chat is online.')).toBeVisible();
  await expect(page.getByText(/load failed/i)).not.toBeVisible();
});

test('Dorje summarize request does not trigger Gmail connector prompt', async ({ page }) => {
  await authenticate(page);
  await mockStudentApis(page);
  let connectorChecks = 0;
  await page.route('http://127.0.0.1:8100/api/v1/connectors', async route => {
    connectorChecks += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.goto('/dorje-ai');
  await page.getByPlaceholder(/Ask, analyze, create/i).fill('Summarize this email attachment into 5 bullet points.');
  await page.locator('#dorje-send-message').click();
  await expect(page.getByText('Dorje chat is online.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Connect Gmail/i })).toHaveCount(0);
  expect(connectorChecks).toBe(0);
});

test('Kamal chat submission streams without Load failed', async ({ page }) => {
  await authenticate(page);
  await mockStudentApis(page);
  await page.goto('/student-lad');
  await page.getByLabel('Open Kamal assistant').click();
  const kamalInput = page.getByPlaceholder(/Ask Kamal/i);
  await kamalInput.fill('Where are reminders?');
  await kamalInput.press('Enter');
  await expect(page.getByText('Kamal chat is online.', { exact: true })).toBeVisible();
  await expect(page.getByText(/load failed/i)).not.toBeVisible();
});
