import { expect, test } from '@playwright/test';

test('attachment stays staged until Send and is cleared after submission', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'playwright-attachment-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 999, email: 'attachment@example.com' }));
  });
  let submittedBody: Record<string, unknown> | undefined;
  let uploadHandled = false;
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/dorje-ai/upload')) {
      uploadHandled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        filename: 'Statistics Assignment 2.txt', stored_name: 'Statistics Assignment 2.txt',
        content_type: 'text/plain', content: 'Due: July 20', characters_extracted: 12,
        source_label: 'Uploaded from this device', staged: true
      }) });
      return;
    }
    if (path.endsWith('/dorje-ai/chat')) {
      submittedBody = request.postDataJSON();
      await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: 'Assignment received.' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, agents: [] }) });
  });
  await page.goto('/dorje-ai');
  const attach = page.getByTitle('Attach from device or connector');
  await expect(attach).toBeVisible();
  await attach.click();
  await expect(page.getByRole('dialog', { name: 'Add source or plugin' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Google Drive/ })).toBeVisible();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Device files/ }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'Statistics Assignment 2.txt', mimeType: 'text/plain', buffer: Buffer.from('Due: July 20')
  });
  await expect.poll(() => uploadHandled).toBe(true);
  const stagedChip = page.locator('.dorje-composer').getByText('Statistics Assignment 2.txt', { exact: false });
  await expect(stagedChip).toBeVisible();
  expect(submittedBody).toBeUndefined();
  await page.getByPlaceholder(/Ask, analyze, create/i).fill('Remember the assignment deadline.');
  await page.locator('#dorje-send-message').click();
  await expect.poll(() => submittedBody).toBeTruthy();
  expect(submittedBody).toMatchObject({ conversation_id: expect.any(String), files: [expect.objectContaining({ stored_name: 'Statistics Assignment 2.txt', source_label: 'Uploaded from this device' })] });
  await expect(stagedChip).not.toBeVisible();
});
