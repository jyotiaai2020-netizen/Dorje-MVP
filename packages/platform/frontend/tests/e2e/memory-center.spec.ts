import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'memory-center-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 909, email: 'memory@example.com', full_name: 'Memory User' }));
  });
}

async function mockApis(page: Page) {
  let pending = [{ candidate_id: 'MC-1', category: 'preference', content: 'User prefers evening reminders for non-urgent tasks.', memory_type: 'semantic', memory_class: 'durable', sensitivity: 'low', status: 'pending', confidence: 0.95, retention_policy: '1_year', requires_confirmation: true }];
  let memories = [{ memory_id: 'MEM-1', category: 'correction', content: 'Use evening reminders unless urgency requires earlier notice.', memory_type: 'semantic', memory_class: 'durable', sensitivity: 'low', status: 'active', confidence: 0.9, retention_policy: '1_year' }];
  await page.route(`${API}/api/v1/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/dorje-ai/memory/approve')) {
      const body = request.postDataJSON() as { candidate_id: string };
      const found = pending.find(item => item.candidate_id === body.candidate_id)!;
      pending = pending.filter(item => item.candidate_id !== body.candidate_id);
      const memory = { ...found, memory_id: 'MEM-APPROVED', status: 'active' };
      memories.unshift(memory);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(memory) });
      return;
    }
    if (request.method() === 'POST' && path.endsWith('/dorje-ai/memory/reject')) {
      pending = [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'rejected' }) });
      return;
    }
    if (request.method() === 'PATCH' && path.includes('/dorje-ai/memory/')) {
      const body = request.postDataJSON() as { content: string };
      memories[0] = { ...memories[0], content: body.content };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(memories[0]) });
      return;
    }
    if (request.method() === 'DELETE' && path.includes('/dorje-ai/memory/')) {
      memories = memories.map(item => ({ ...item, status: 'deleted' }));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
      return;
    }
    if (path.endsWith('/dorje-ai/memory/pending')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: pending }) }); return; }
    if (path.endsWith('/dorje-ai/memory/export')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memories, pending }) }); return; }
    if (path.endsWith('/dorje-ai/memory')) { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: memories }) }); return; }
    const body = path.endsWith('/ceda/dashboard') ? { workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: 0, context_health_score: 100, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
      : path.endsWith('/ceda/reminders') ? { items: [] }
        : path.endsWith('/context-os/health') ? { score: 100, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }
          : path.endsWith('/settings/device-profile') ? { device_mode: 'desktop', resource_profile: '16gb', connectivity_mode: 'hybrid' }
            : path.endsWith('/settings/history-policy') ? { tier: 'free', history_policy: { raw_chat_history_days: 7, summary_history_days: 30, daily_summary_enabled: true, weekly_summary_enabled: false, cross_device_history: false, max_saved_conversations: 10 } }
              : path.endsWith('/settings/orchestration-policy') ? { tier: 'free', memory_policy: { classes: [] }, upload_limits: {}, model_residency: {} }
                : path.endsWith('/ceda/policies') ? {}
                  : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('Memory Center shows current memory state, saved information, preferences, and export controls', async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto('/student-lad/memory', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'What Dorje remembers and why.', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Memory usage summary' }).getByText('Approved memories')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Memory usage summary' }).getByText('1')).toBeVisible();
  await expect(page.getByText('No chat history yet')).toBeVisible();
  await page.getByRole('button', { name: 'Saved Information' }).click();
  await expect(page.getByText('Reviewed and approved by you')).toBeVisible();
  await expect(page.getByText('Use evening reminders unless urgency requires earlier notice.')).toBeVisible();
  await page.getByRole('button', { name: 'Preferences' }).click();
  await expect(page.getByText('Use evening reminders unless urgency requires earlier notice.')).toBeVisible();
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('button', { name: 'Export Memory Data' })).toBeVisible();
});
