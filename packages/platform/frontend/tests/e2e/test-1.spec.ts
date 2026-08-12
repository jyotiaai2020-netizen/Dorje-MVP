import { test, expect } from '@playwright/test';

test('public landing page renders without a client error', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await expect(page).toHaveURL(/127\.0\.0\.1:3100/);
});
