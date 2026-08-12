import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('lotus_token', 'workspace-file-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 505, email: 'workspace.file@example.com', full_name: 'Workspace File User' }));
  });
}

async function mockWorkspaceApis(page: Page) {
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/connectors')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ provider: 'gmail', name: 'Gmail', status: 'connected', account_email: 'student@example.com' }]) });
      return;
    }
    if (path.endsWith('/suggestions/generate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          greeting: 'Evidence-backed next steps.',
          suggestions: [{
            id: 'SUG-PLAYWRIGHT',
            label: 'Review deadlines',
            editable_instruction: 'Review my upcoming academic deadlines and suggest the safest next action.',
            action_type: 'review_open_actions',
            reason: 'Approved CEDA context can surface upcoming work without exposing private details.',
            evidence_refs: ['CEDA:approved-context'],
            confidence: 0.86,
            requires_confirmation: false,
            required_connector: null,
            status: 'displayed',
          }],
        }),
      });
      return;
    }
    if (path.endsWith('/suggestions/SUG-PLAYWRIGHT/select')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ action_id: 'ACT-PLAYWRIGHT', status: 'copied_to_composer', preview: { instruction: 'Review my upcoming academic deadlines and suggest the safest next action.' }, requires_confirmation: false }) });
      return;
    }
    if (path.endsWith('/dorje-ai/chat')) {
      await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: 'Photosynthesis converts light into chemical energy.\n\n## Method\nPlants use chlorophyll, water, and carbon dioxide.' });
      return;
    }
    if (path.endsWith('/dorje-ai/documents/word')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          document_id: 'doc-playwright',
          filename: 'photosynthesis-assignment.docx',
          content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          data_base64: Buffer.from('docx bytes').toString('base64'),
          size: 1024,
          text_preview: 'Photosynthesis assignment preview',
        }),
      });
      return;
    }
    if (path.endsWith('/dorje-ai/email/draft')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'Final assignment', body: 'Please find the final assignment attached.' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await mockWorkspaceApis(page);
});

test('general chat stays conversational and does not open a file workspace drawer', async ({ page }) => {
  await page.goto('/dorje-ai');
  await page.getByPlaceholder(/Ask, analyze, create/i).fill('Explain photosynthesis.');
  await page.locator('#dorje-send-message').click();

  await expect(page.getByText('Photosynthesis converts light into chemical energy.')).toBeVisible();
  await expect(page.getByLabel(/workspace drawer/i)).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Email Composer' })).toHaveCount(0);
});

test('explicit document command opens file drawer and email remains in place', async ({ page }) => {
  await page.goto('/dorje-ai');
  await page.getByPlaceholder(/Ask, analyze, create/i).fill('Create a Word document for my photosynthesis assignment.');
  await page.locator('#dorje-send-message').click();

  await expect(page.getByLabel('document workspace drawer')).toBeVisible();
  await expect(page.getByText('photosynthesis-assignment.docx')).toBeVisible();
  await page.getByRole('button', { name: /Email here/ }).click();

  await expect(page.getByRole('dialog', { name: 'Email Composer' })).toBeVisible();
  await expect(page.getByText('Email Composer')).toBeVisible();
  await expect(page.getByText('📎 photosynthesis-assignment.docx')).toBeVisible();
});

test('CEDA suggestions copy to composer and keep observability behind Why', async ({ page }) => {
  await page.goto('/dorje-ai');

  await expect(page.getByText('Review deadlines')).toBeVisible();
  await expect(page.getByText(/Confidence 86%/)).toBeHidden();

  await page.getByText('Why').click();
  await expect(page.getByText(/Confidence 86%/)).toBeVisible();

  await page.getByRole('button', { name: /Copy suggestion Review deadlines to composer/i }).click();
  await expect(page.getByPlaceholder(/Ask, analyze, create/i)).toHaveValue('Review my upcoming academic deadlines and suggest the safest next action.');
  await expect(page.getByText(/Suggestion copied to the composer/)).toBeVisible();
});

test('JASP LaTeX table paste is accepted as composer table format only', async ({ page }) => {
  await page.goto('/dorje-ai');
  const composer = page.getByPlaceholder(/Ask, analyze, create/i);
  await composer.click();

  const jaspTable = String.raw`\begin{table}[h]
	\centering
	\caption{Spearman's Correlations}
	\begin{tabular}{lrrr}
		\toprule
		Variable &  & Var1 & Var2  \\
		\cmidrule[0.4pt]{1-4}
1. Var1 & Spearman's rho & -- & $ $  \\
		$$ & p-value & -- & $ $  \\
2. Var2 & Spearman's rho & $0.964$ & --  \\
		$$ & p-value & $<$ .001 & --  \\
		\bottomrule
	\end{tabular}
\end{table}`;

  await page.evaluate((text) => {
    const textarea = document.querySelector('textarea[placeholder^="Ask, analyze"]') as HTMLTextAreaElement;
    const data = new DataTransfer();
    data.setData('text/plain', text);
    textarea.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, jaspTable);

  await expect(composer).toHaveValue(/Table: Spearman's Correlations/);
  await expect(composer).toHaveValue(/\| Variable \| Column 2 \| Var1 \| Var2 \|/);
  await expect(composer).toHaveValue(/\| 2\. Var2 \| Spearman's rho \| 0\.964 \| -- \|/);
  await expect(composer).not.toHaveValue(/\\begin\{tabular\}|\\toprule|\\cmidrule/);
});
