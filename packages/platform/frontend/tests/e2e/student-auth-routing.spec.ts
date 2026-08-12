import { expect, test } from '@playwright/test';

test('Google OAuth callback forwards Student-LAD to backend port 8100', async ({ request }) => {
  const response = await request.get('/api/oauth/google/callback?state=auth.test-state&code=test-code', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const location = response.headers().location;
  expect(location).toBeTruthy();
  const redirect = new URL(location!);
  expect(redirect.port).toBe('8100');
  expect(redirect.pathname).toBe('/api/v1/auth/google/callback');
  expect(redirect.searchParams.get('state')).toBe('auth.test-state');
  expect(redirect.searchParams.get('code')).toBe('test-code');
  expect(location).not.toContain(':8000');
  expect(location).not.toContain(':3000');
});

test('login API requests target the Student backend and not the legacy port', async ({ page }) => {
  let requestedUrl = '';
  await page.route('http://127.0.0.1:8100/api/v1/auth/google/start', async route => {
    requestedUrl = route.request().url();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authorization_url: 'https://accounts.google.com/o/oauth2/auth?test=1' }) });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: /^google$/i }).click();
  await expect.poll(() => requestedUrl).toContain('127.0.0.1:8100');
  expect(requestedUrl).not.toContain(':8000');
});


test('Google missing configuration is shown as a friendly local setup message', async ({ page }) => {
  await page.route('http://127.0.0.1:8100/api/v1/auth/google/start', async route => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Google registration is not configured: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET' }),
    });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: /^google$/i }).click();
  await expect(page.getByText(/Google sign-in is not configured for this local Student-LAD run/i)).toBeVisible();
  await expect(page.getByText(/GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/)).toHaveCount(0);
});


test('Google completion ticket stores the frontend session and opens Student-LAD', async ({ page }) => {
  let completionPayload: Record<string, unknown> | undefined;
  await page.addInitScript(() => {
    if (localStorage.getItem('student_lad_old_user_seeded') === 'true') return;
    localStorage.setItem('student_lad_old_user_seeded', 'true');
    localStorage.setItem('lotus_token', 'old-user-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 111, email: 'old.user@example.com', full_name: 'Old User' }));
    localStorage.setItem('dorje_chat_history:user:111', JSON.stringify([
      { id: 'old-chat', title: 'Old User Private Chat', updatedAt: '2026-07-20T10:00:00.000Z', messages: [{ role: 'user', content: 'Old private content' }] },
    ]));
    localStorage.setItem('student_lad_app_store:user:111', JSON.stringify({ theme: 'Dark', mode: 'Cloud', uiTheme: 'Studio' }));
    sessionStorage.setItem('dorje_handoff_payload', JSON.stringify({ content: 'old handoff' }));
  });
  await page.route('http://127.0.0.1:8100/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/google/complete')) {
      completionPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Set-Cookie': 'lotus_access_token=google-cookie; Path=/; SameSite=Lax' },
        body: JSON.stringify({
          access_token: 'google-complete-token',
          token_type: 'bearer',
          user: { id: 456, email: 'google.student@example.com', full_name: 'Google Student', organization_id: 88, role: 'org_admin' },
        }),
      });
      return;
    }
    const body = path.endsWith('/ceda/dashboard')
      ? { workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: 0, context_health_score: 100, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
      : path.endsWith('/context-os/health') ? { score: 100, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }
        : path.endsWith('/wkim/storage-locations') ? [{ location_id: 'system-local', name: 'System / Local Device', location: 'Local device storage', storage_type: 'system', category: 'system', sync_mode: 'local_only', health_status: 'available', permission_level: 'user_approved_paths_only', watcher_enabled: false, source: 'system', status: 'available', disconnectable: false }]
          : path.endsWith('/wkim/health') ? { score: 100, workspaces: 1, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }
            : path.endsWith('/ceda/reminders') ? { items: [], immigration_disclaimer: '' }
              : path.endsWith('/ceda/policies') ? { academic: { save: 'ask_first', cloud: false, retention_days: 365 } }
                : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/auth/google/complete?ticket=test-ticket');
  await page.waitForURL(/\/student-lad/);
  expect(completionPayload).toEqual({ ticket: 'test-ticket' });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lotus_token'))).toBe('google-complete-token');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lotus_user') || '{}').id)).toBe(456);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('dorje_handoff_payload'))).toBeNull();
  await page.goto('/student-lad/memory');
  await expect(page.getByText('Old User Private Chat')).toHaveCount(0);
  await expect(page.getByText('No chat history yet')).toBeVisible();
});

test('normal email form login stores the session and opens Student-LAD', async ({ page }) => {
  let loginPayload: Record<string, unknown> | undefined;
  await page.route('http://127.0.0.1:8100/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/login')) {
      loginPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Set-Cookie': 'lotus_access_token=test-cookie; Path=/; SameSite=Lax' },
        body: JSON.stringify({
          access_token: 'student-form-token',
          token_type: 'bearer',
          user: {
            id: 123,
            email: 'student.form@example.com',
            full_name: 'Student Form User',
            organization_id: 77,
            role: 'org_admin',
          },
        }),
      });
      return;
    }
    const body = path.endsWith('/ceda/dashboard')
      ? { workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: 0, context_health_score: 100, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
      : path.endsWith('/context-os/health') ? { score: 100, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }
        : path.endsWith('/wkim/storage-locations') ? [{ location_id: 'system-local', name: 'System / Local Device', location: 'Local device storage', storage_type: 'system', category: 'system', sync_mode: 'local_only', health_status: 'available', permission_level: 'user_approved_paths_only', watcher_enabled: false, source: 'system', status: 'available', disconnectable: false }]
          : path.endsWith('/wkim/health') ? { score: 100, workspaces: 1, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }
            : path.endsWith('/ceda/reminders') ? { items: [], immigration_disclaimer: '' }
              : path.endsWith('/ceda/policies') ? { academic: { save: 'ask_first', cloud: false, retention_days: 365 } }
                : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/login');
  await expect(page.getByLabel('Email')).toHaveValue('');
  await expect(page.getByLabel('Password')).toHaveValue('');
  await page.getByLabel('Email').fill('student.form@example.com');
  await page.getByLabel('Password').fill('StudentTest123!');
  await page.getByRole('button', { name: /^sign in with email$/i }).click();

  await page.waitForURL(/\/student-lad/);
  expect(loginPayload).toEqual({ email: 'student.form@example.com', password: 'StudentTest123!' });
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /good morning, student form user/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lotus_token'))).toBe('student-form-token');
});

test('forgot password flow requests a reset token and updates password locally', async ({ page }) => {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.route('http://127.0.0.1:8100/api/v1/auth/**', async route => {
    const request = route.request();
    const path = new URL(route.request().url()).pathname;
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : undefined;
    if (body) calls.push({ path, body });
    if (path.endsWith('/auth/forgot-password')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Local recovery token created. Use it to set a new password.', reset_token: 'reset-token-for-local-student-1234567890' }) });
      return;
    }
    if (path.endsWith('/auth/reset-password')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Password updated. Sign in with your new password.' }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('recover@example.com');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Get reset link' }).click();
  await expect(page.getByText('Local recovery token created. Use it to set a new password.')).toBeVisible();
  await expect(page.getByPlaceholder('Reset token')).toHaveValue('reset-token-for-local-student-1234567890');

  await page.getByPlaceholder('New password, at least 8 characters').fill('Recovered123!');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible();

  expect(calls).toEqual([
    { path: '/api/v1/auth/forgot-password', body: { email: 'recover@example.com' } },
    { path: '/api/v1/auth/reset-password', body: { token: 'reset-token-for-local-student-1234567890', new_password: 'Recovered123!' } },
  ]);
});
