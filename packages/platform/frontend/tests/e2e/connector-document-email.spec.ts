import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'connector-document-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 515, email: 'docs@example.com', full_name: 'Docs User' }));
  });
}

async function mockApis(page: Page) {
  let googleDocsFilesRequested = false;
  await page.route(`${API}/api/v1/**`, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/dorje-ai/chat') && request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: 'Professional Summary\nData analyst with Python, SQL, and dashboard experience.\n\nExperience\nBuilt reliable analytics reports for academic and business projects.',
      });
      return;
    }
    if (path.endsWith('/connectors/google-docs/files') && request.method() === 'GET') {
      googleDocsFilesRequested = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        provider: 'google-docs',
        folder_id: 'root',
        query: '',
        files: [
          { id: 'doc-001', name: 'Student CV Draft', mime_type: 'application/vnd.google-apps.document', is_folder: false, modified_time: '2026-07-16T12:00:00Z' },
        ],
      }) });
      return;
    }
    if (path.endsWith('/connectors/google-docs/documents') && request.method() === 'POST') {
      const body = request.postDataJSON() as { title: string; body?: string };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        provider: 'google-docs',
        document_id: 'google-doc-created-001',
        title: body.title || 'DorjeAI Document',
        web_view_link: 'https://docs.google.com/document/d/google-doc-created-001/edit',
        account_email: 'docs@example.com',
      }) });
      return;
    }
    if (path.endsWith('/connectors') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { provider: 'gmail', name: 'Gmail', status: 'connected', account_email: 'docs@example.com', scopes: ['https://www.googleapis.com/auth/gmail.send'] },
        { provider: 'google-drive', name: 'Google Drive', status: 'connected', account_email: 'docs@example.com', scopes: ['https://www.googleapis.com/auth/drive.file'] },
        { provider: 'google-docs', name: 'Google Docs', status: 'connected', account_email: 'docs@example.com', scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive.readonly'] },
        { provider: 'google-sheets', name: 'Google Sheets', status: 'connected', account_email: 'docs@example.com', scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'] },
        { provider: 'google-calendar', name: 'Google Calendar', status: 'connected', account_email: 'docs@example.com', scopes: ['https://www.googleapis.com/auth/calendar.events'] },
        { provider: 'microsoft-login', name: 'Microsoft Login', status: 'not_connected' },
        { provider: 'microsoft-word', name: 'Microsoft Word', status: 'not_connected' },
        { provider: 'microsoft-excel', name: 'Microsoft Excel', status: 'not_connected' },
        { provider: 'onedrive', name: 'OneDrive', status: 'not_connected' },
        { provider: 'microsoft-email', name: 'Microsoft Email', status: 'not_connected' },
        { provider: 'apple-login', name: 'Apple Login', status: 'not_connected' },
        { provider: 'apple-mail', name: 'Apple Mail / iCloud Mail', status: 'not_connected' },
      ]) });
      return;
    }
    if (path.endsWith('/ceda/items') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { summary: 'User prefers concise professional emails.', type: 'Preference', domain: 'preferences', status: 'approved' },
        { summary: 'Statistics Assignment 2 is due July 20.', type: 'Academic Deadline', domain: 'academic', status: 'approved', key_date: '2026-07-20' },
      ]) });
      return;
    }
    if (path.endsWith('/dorje-ai/documents/word') && request.method() === 'POST') {
      const body = request.postDataJSON() as { document_id?: string; mode: string; filename: string };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        document_id: body.document_id || 'doc-test-001',
        filename: body.filename || 'student-update.docx',
        content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data_base64: 'V29yZCBmaWxl',
        size: 9,
        text_preview: `${body.mode} preview`,
      }) });
      return;
    }
    if (path.endsWith('/connectors/gmail/send') && request.method() === 'POST') {
      const body = request.postDataJSON() as { attachments?: Array<{ filename: string }> };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message_id: 'gmail-msg-001', account_email: 'docs@example.com', attachments: body.attachments || [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return {
    googleDocsFilesRequested: () => googleDocsFilesRequested,
  };
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  page.on('dialog', dialog => dialog.accept());
});

test('Email studio fills from CEDA, creates a reusable Word file, and sends it as an attachment', async ({ page }) => {
  await page.goto('/student-lad');
  await expect(page.getByRole('button', { name: 'Open DorjeAI orchestrator top view' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('workspace-tool:open', { detail: { tool: 'email', context: '' } })));

  await expect(page.getByRole('heading', { name: 'Email Composer' })).toBeVisible();
  await page.getByRole('button', { name: 'Fill from CEDA' }).click();
  await expect(page.getByPlaceholder('What should this email accomplish?')).toHaveValue(/Statistics Assignment 2 is due July 20/);

  await page.getByPlaceholder('To').fill('student@example.com');
  await page.getByPlaceholder('Subject').fill('Student update');
  await page.getByPlaceholder('Draft preview').fill('Hello, this is the current draft.');

  await page.getByRole('button', { name: 'Create Word' }).click();
  await expect(page.getByText('📎 Student update.docx')).toBeVisible();
  await page.getByRole('button', { name: 'Rewrite same' }).click();
  await expect(page.getByText('📎 Student update.docx')).toBeVisible();
  await page.getByRole('button', { name: 'Append same' }).click();
  await expect(page.getByText('📎 Student update.docx')).toBeVisible();

  const sendRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/connectors/gmail/send'));
  await page.getByRole('button', { name: 'Send with Gmail' }).click();
  const request = await sendRequest;
  const body = request.postDataJSON() as { attachments: Array<{ filename: string }> };
  expect(body.attachments.map((item) => item.filename)).toEqual(['Student update.docx']);
});

test('Email studio offers fresh Gmail reconnect when send authorization expired', async ({ page }) => {
  await page.route(`${API}/api/v1/connectors/gmail/send`, async route => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Gmail authorization expired; reconnect Gmail' }) });
  });
  await page.route(`${API}/api/v1/connectors/google/gmail/connect`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test-state' }) });
  });

  await page.goto('/student-lad');
  await expect(page.getByRole('button', { name: 'Open DorjeAI orchestrator top view' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('workspace-tool:open', { detail: { tool: 'email', context: '' } })));
  await expect(page.getByRole('heading', { name: 'Email Composer' })).toBeVisible();
  await page.getByPlaceholder('To').fill('student@example.com');
  await page.getByPlaceholder('Subject').fill('Student update');
  await page.getByPlaceholder('Draft preview').fill('Hello, this is the current draft.');

  await page.getByRole('button', { name: 'Send with Gmail' }).click();
  await expect(page.getByText('Gmail authorization expired; reconnect Gmail')).toBeVisible();
  const reconnect = page.waitForRequest((request) => request.method() === 'GET' && request.url().endsWith('/api/v1/connectors/google/gmail/connect'));
  await page.getByRole('button', { name: 'Reconnect Gmail' }).click();
  await reconnect;
});

test('Workspace AI plus menu creates a Word document and hands it to Email with attachment', async ({ page }) => {
  const apiState = await mockApis(page);
  await page.goto('/dorje-ai');

  await page.getByTitle('Attach from device or connector').click();
  await expect(page.getByRole('dialog', { name: 'Add source or plugin' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Google Docs/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Word \/ Office/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Excel/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Email plugin/ })).toBeVisible();
  await page.getByRole('button', { name: /Google Docs/ }).click();
  await expect(page.locator('.dorje-composer').getByText('DorjeAI Document.gdoc')).toBeVisible();
  expect(apiState.googleDocsFilesRequested()).toBe(false);

  await page.getByPlaceholder(/Ask, analyze, create/i).fill('Create a CV for a data analyst role.');
  const wordRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/dorje-ai/documents/word'));
  await page.locator('#dorje-send-message').click();
  const request = await wordRequest;
  const requestBody = request.postDataJSON() as { filename: string; mode: string; body: string };
  expect(requestBody.filename).toContain('cv-for-data-analyst-role');
  expect(requestBody.mode).toBe('create');
  expect(requestBody.body).toContain('Professional Summary');

  await expect(page.getByRole('complementary', { name: 'document workspace drawer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /cv-for-data-analyst-role\.docx/ })).toBeVisible();

  await page.getByRole('button', { name: /Email here/ }).click();
  await expect(page.getByRole('dialog', { name: 'Email Composer' })).toBeVisible();
  await expect(page.getByText('📎 cv-for-data-analyst-role.docx')).toBeVisible();
});
