import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

const contextObject = {
  context_id: 'CTX-ACA-TEST0001', domain: 'academic', type: 'deadline',
  title: 'Statistics Assignment 2', payload: { instruction: 'Track Statistics Assignment 2 due July 20.' },
  source: { type: 'kamal_chat' }, retention_reason: 'Explicit user approval after policy evaluation',
  confidence: 0.98, policy_ids: ['academic_context_allowed'], status: 'active', version: 1,
  expires_at: '2027-07-20T00:00:00Z', last_used_at: null, layer: 'active', workspace: 'Academic', quality_score: 0.94
};

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'playwright-isolated-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 999, email: 'playwright@example.com' }));
  });
}

async function mockContextApis(page: Page, options: { pending?: boolean; objects?: boolean } = {}) {
  await page.route(`${API}/api/v1/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    const body = path.endsWith('/ceda/dashboard') ? { workspace: 'Isolated Test Workspace', pending_approvals: options.pending ? 1 : 0, upcoming_reminders: 1, context_health_score: 94, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
      : path.endsWith('/ceda/pending') ? (options.pending ? [{ id: 'candidate-1', category: 'academic', kind: 'deadline', summary: 'Statistics deadline', stored_instruction: 'Track Statistics Assignment 2.', confidence: 0.98, source: 'kamal_chat' }] : [])
      : path.endsWith('/context-os/registry') ? (options.objects ? [contextObject] : [])
      : path.endsWith('/ceda/policies') ? { academic: { save: 'ask_first', cloud: false, retention_days: 365 } }
      : path.endsWith('/ceda/reminders') ? { items: [], immigration_disclaimer: '' }
      : path.endsWith('/context-os/health') ? { score: 94, total_objects: options.objects ? 1 : 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: ['Context library is healthy.'] }
      : path.endsWith('/context-os/workspaces') ? (options.objects ? [{ workspace: 'Academic', objects: 1, domains: ['academic'], average_quality: 0.94, offline_available: true }] : [])
      : path.endsWith('/pie/policies') ? []
      : path.endsWith('/pie/decisions') ? []
      : path.endsWith('/ceda/items') ? ((options.pending || options.objects) ? [{ id: 'structured-1', batch_id: 'batch-1', version: 1, domain: 'academic', type: 'Academic Deadline', summary: 'Statistics Assignment 2 deadline is July 20.', key_date: 'July 20, 2026', related_area: 'Academic', related_item: 'Statistics Assignment 2', suggested_action: 'Create reminder 7 days before deadline.', reminder_recommended: true, reminder_status: 'needs_confirmation', priority: 'normal', source_type: 'file_upload', source_reference: 'Statistics Assignment.pdf', policy_applied: 'academic_context_allowed', confidence: 0.98, status: options.pending ? 'pending_review' : 'approved', created_at: '2026-07-04T12:00:00Z', updated_at: '2026-07-04T12:00:00Z', metadata: { why: 'Useful planning information.', raw_retained: false }, audit_events: [] }] : [])
      : path.endsWith('/ceda/batches') ? (options.pending ? [{ id: 'batch-1', source_reference: 'Statistics Assignment.pdf', item_count: 1, approved_count: 0, denied_count: 0, status: 'pending_review' }] : [])
      : path.endsWith('/ceda/item-history') ? []
      : path.endsWith('/wkim/storage-locations') ? [{ location_id: 'system-local', name: 'System / Local Device', location: 'Local device storage', storage_type: 'system', category: 'system', sync_mode: 'local_only', health_status: 'available', permission_level: 'user_approved_paths_only', watcher_enabled: false, source: 'system', status: 'available', disconnectable: false }, { location_id: 'WS-TEST', workspace_id: 'WS-TEST', name: 'Academic', location: '/Users/student/Academic', storage_type: 'local', category: 'academic', sync_mode: 'local_only', health_status: 'healthy', permission_level: 'read_only', watcher_enabled: true, source: 'wkim', status: 'connected', disconnectable: true }]
      : path.endsWith('/wkim/catalog') ? [{ document_id: 'DOC-TEST', workspace_id: 'WS-TEST', title: 'Statistics Assignment.pdf', domain: 'academic', classification: 'assignment', file_type: 'application/pdf', size_bytes: 2048, index_status: 'indexed', last_indexed_at: '2026-07-04T12:00:00Z' }]
      : path.endsWith('/wkim/health') ? { score: 100, workspaces: 1, indexed_documents: 1, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'encrypted metadata and references; originals remain user-owned', suggestions: ['Workspace knowledge infrastructure is healthy.'] }
      : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => authenticate(page));

test('renders curated Context OS panels from the stable APIs', async ({ page }) => {
  await mockContextApis(page, { objects: true });
  await page.goto('/student-lad');
  await expect(page.getByRole('heading', { name: 'Academic', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Immigration', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Career', exact: true })).toBeVisible();
  await expect(page.getByText('Info Quality')).toBeVisible();
  await expect(page.getByText('94%', { exact: true }).first()).toBeVisible();
});

test('approves a pending CEDA candidate through the UI', async ({ page }) => {
  await mockContextApis(page, { pending: true });
  await page.goto('/student-lad/review');
  await expect(page.getByLabel('CEDA lifecycle')).toBeVisible();
  await expect(page.getByText('Capture → decision → learning is inspectable here.')).toBeVisible();
  await expect(page.getByText('Raw noise discarded')).toBeVisible();
  await expect(page.getByText('Statistics Assignment 2 deadline is July 20.')).toBeVisible();
  const decision = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/items/structured-1/approve'));
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await decision;
});

test('updates the Academic save policy to Never', async ({ page }) => {
  await mockContextApis(page);
  await page.goto('/student-lad/policies');
  await expect(page.getByText('Save academic context')).toBeVisible();
  await page.getByTitle('Edit Save academic context').click();
  const update = page.waitForRequest(request => request.method() === 'PUT' && request.url().endsWith('/api/v1/ceda/policies/academic'));
  await page.getByLabel('Set Save academic context').selectOption('never_allow');
  expect((await update).postDataJSON()).toEqual({ rules: { save: 'never' } });
});

test('archives an active Context Object', async ({ page }) => {
  await mockContextApis(page, { objects: true });
  await page.goto('/student-lad');
  await page.getByRole('button', { name: 'Review & Save', exact: true }).click();
  await page.getByRole('button', { name: 'Saved Information', exact: true }).click();
  const transition = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/items/structured-1/archive'));
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await transition;
});

test('requires confirmation before secure deletion', async ({ page }) => {
  await mockContextApis(page, { pending: true });
  await page.goto('/student-lad');
  await page.getByRole('button', { name: 'Review & Save', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  const transition = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/api/v1/ceda/items/structured-1/delete'));
  await page.getByRole('button', { name: 'Delete' }).click();
  await transition;
});

test('renders the governed WKIM workspace and knowledge catalog', async ({ page }) => {
  await mockContextApis(page);
  await page.goto('/student-lad/workspaces');
  await expect(page.getByText('Knowledge Health')).toBeVisible();
  await expect(page.getByText(/originals remain user-owned/i)).toBeVisible();
  await page.getByRole('button', { name: 'Locations' }).click();
  await expect(page.getByText('System / Local Device')).toBeVisible();
  await page.getByRole('button', { name: 'Catalog' }).click();
  await expect(page.getByLabel('Workspaces').getByText('Academic', { exact: true })).toBeVisible();
  await expect(page.getByText('Statistics Assignment.pdf')).toBeVisible();
});

test('removes a catalog reference only after confirmation', async ({ page }) => {
  await mockContextApis(page);
  await page.goto('/student-lad/workspaces');
  await page.getByRole('button', { name: 'Catalog' }).click();
  page.once('dialog', dialog => dialog.accept());
  const removal = page.waitForRequest(request => request.method() === 'DELETE' && request.url().endsWith('/api/v1/wkim/catalog/DOC-TEST'));
  await page.getByRole('button', { name: 'Remove reference' }).click();
  await removal;
  await expect(page.getByText('Statistics Assignment.pdf')).toHaveCount(0);
});

test('clears the catalog without deleting original files', async ({ page }) => {
  await mockContextApis(page);
  await page.goto('/student-lad/workspaces');
  await page.getByRole('button', { name: 'Catalog' }).click();
  page.once('dialog', dialog => dialog.accept());
  const clearing = page.waitForRequest(request => request.method() === 'DELETE' && request.url().endsWith('/api/v1/wkim/catalog'));
  await page.getByRole('button', { name: 'Clear catalog' }).click();
  await clearing;
  await expect(page.getByText(/original files were not deleted/i)).toBeVisible();
});

test('disconnects a location and clears only its references', async ({ page }) => {
  await mockContextApis(page);
  await page.goto('/student-lad/workspaces');
  await page.getByRole('button', { name: 'Locations' }).click();
  page.once('dialog', dialog => dialog.accept());
  const disconnect = page.waitForRequest(request => request.method() === 'DELETE' && request.url().includes('/api/v1/wkim/workspaces/WS-TEST?clear_catalog=true'));
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await disconnect;
  await expect(page.getByText(/original files and folders were not deleted/i)).toBeVisible();
});
