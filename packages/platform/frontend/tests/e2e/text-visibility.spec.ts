import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8100';

type VisibilityIssue = {
  text: string;
  reason: string;
  foreground?: string;
  background?: string;
  contrast?: number;
};

async function authenticate(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(selectedTheme => {
    localStorage.setItem('lotus_token', 'playwright-visibility-token');
    localStorage.setItem('lotus_user', JSON.stringify({ id: 999, email: 'visibility@example.com' }));
    localStorage.setItem('dorje_theme_preference', selectedTheme);
  }, theme);
}

async function mockApis(page: Page) {
  await page.route(`${API}/api/v1/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    const body = path.endsWith('/ceda/dashboard')
      ? { workspace: 'Student Workspace', pending_approvals: 1, upcoming_reminders: 1, context_health_score: 94, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'encrypted metadata' }
      : path.endsWith('/ceda/items')
        ? [{ id: 'item-1', batch_id: 'batch-1', version: 1, domain: 'academic', type: 'Academic Deadline', summary: 'Statistics Assignment deadline is July 20.', key_date: 'July 20, 2026', related_area: 'Academic', related_item: 'Statistics Assignment', suggested_action: 'Create reminder 7 days before deadline.', reminder_recommended: true, reminder_status: 'needs_confirmation', priority: 'normal', source_type: 'file_upload', source_reference: 'Assignment.pdf', policy_applied: 'academic_context_allowed', confidence: 0.98, status: 'pending_review', created_at: '2026-07-04T12:00:00Z', updated_at: '2026-07-04T12:00:00Z', metadata: {}, audit_events: [] }]
        : path.endsWith('/ceda/batches') ? [{ id: 'batch-1', source_reference: 'Assignment.pdf', item_count: 1, approved_count: 0, denied_count: 0, status: 'pending_review' }]
          : path.endsWith('/ceda/reminders') ? { items: [], immigration_disclaimer: '' }
            : path.endsWith('/context-os/health') ? { score: 94, total_objects: 1, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] }
              : path.endsWith('/wkim/storage-locations') ? [{ location_id: 'system-local', name: 'System / Local Device', location: 'Local device storage', storage_type: 'system', category: 'system', sync_mode: 'local_only', health_status: 'available', permission_level: 'user_approved_paths_only', watcher_enabled: false, source: 'system', status: 'available', disconnectable: false }]
                : path.endsWith('/wkim/health') ? { score: 100, workspaces: 1, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] }
                  : path.endsWith('/pie/policies') || path.endsWith('/pie/decisions') || path.endsWith('/ceda/item-history') || path.endsWith('/wkim/catalog') || path.endsWith('/context-os/registry') || path.endsWith('/context-os/workspaces') ? []
                    : path.endsWith('/ceda/policies') ? { academic: { save: 'ask_first', cloud: false, retention_days: 365 } }
                      : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function auditVisibleText(page: Page, label: string) {
  const issues = await page.evaluate(() => {
    type RGB = { r: number; g: number; b: number; a: number };
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const parse = (value: string): RGB | null => {
      if (!context || !value) return null;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: alpha / 255 };
    };
    const luminance = ({ r, g, b }: RGB) => {
      const channel = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (a: RGB, b: RGB) => { const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (lighter + 0.05) / (darker + 0.05); };
    const result: VisibilityIssue[] = [];
    const seen = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      const element = node.parentElement;
      if (!text || !/[\p{L}\p{N}]/u.test(text) || !element || element.closest('[aria-hidden="true"], script, style, noscript')) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0 || rect.width <= 0 || rect.height <= 0) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const textRect = range.getBoundingClientRect();
      if (textRect.width <= 0 || textRect.height <= 0) continue;
      const key = `${text}|${Math.round(textRect.x)}|${Math.round(textRect.y)}`;
      if (seen.has(key)) continue; seen.add(key);
      const horizontallyScrollable = Boolean(element.closest('.overflow-x-auto, .overflow-x-scroll'));
      if ((textRect.right < -1 || textRect.left > innerWidth + 1) && !horizontallyScrollable) {
        result.push({ text: text.slice(0, 100), reason: 'text is horizontally outside the page viewport' });
        continue;
      }
      const foreground = parse(style.color);
      if (!foreground || foreground.a < 0.7) {
        result.push({ text: text.slice(0, 100), reason: 'text is transparent or has no readable foreground', foreground: style.color });
        continue;
      }
      let cursor: HTMLElement | null = element;
      let background: RGB | null = null;
      let gradient = false;
      while (cursor) {
        const current = getComputedStyle(cursor);
        if (current.backgroundImage !== 'none') gradient = true;
        const parsed = parse(current.backgroundColor);
        if (parsed && parsed.a >= 0.95) { background = parsed; break; }
        cursor = cursor.parentElement;
      }
      if (!background || gradient) continue;
      const ratio = contrast(foreground, background);
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseInt(style.fontWeight, 10) || 400;
      const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minimum = large ? 3 : 4.5;
      if (ratio + 0.05 < minimum) result.push({ text: text.slice(0, 100), reason: `contrast is below ${minimum}:1`, foreground: style.color, background: `rgb(${background.r}, ${background.g}, ${background.b})`, contrast: +ratio.toFixed(2) });
    }
    return result.slice(0, 30);
  });
  expect(issues, `${label} has unreadable text:\n${JSON.stringify(issues, null, 2)}`).toEqual([]);
}

const publicRoutes = ['/login', '/register', '/operations-guide'];
const authenticatedRoutes = ['/', '/organizations', '/reports', '/dorje-ai'];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme text visibility`, () => {
    for (const route of publicRoutes) {
      test(`${route} keeps all rendered text readable`, async ({ page }) => {
        await authenticate(page, theme); await mockApis(page); await page.goto(route);
        await expect(page.locator('body')).toBeVisible(); await auditVisibleText(page, `${route} (${theme})`);
      });
    }
    for (const route of authenticatedRoutes) {
      test(`${route} keeps all rendered text readable`, async ({ page }) => {
        await authenticate(page, theme); await mockApis(page); await page.goto(route);
        await expect(page.locator('body')).toBeVisible(); await auditVisibleText(page, `${route} (${theme})`);
      });
    }
    test('every Student-LAD tab keeps all rendered text readable', async ({ page }) => {
      await authenticate(page, theme); await mockApis(page); await page.goto('/student-lad');
      for (const tab of ['Home', 'Review & Save', 'Workspaces', 'Settings', 'Tasks']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await auditVisibleText(page, `Student-LAD ${tab} (${theme})`);
      }
    });
  });
}
