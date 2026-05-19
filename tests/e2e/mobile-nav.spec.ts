import { test, expect } from '@playwright/test';

// Block Clerk FAPI calls so stub keys don't prevent React hydration.
async function blockClerkNetwork(page: import('@playwright/test').Page) {
  await page.route('**/*.clerk.accounts.dev/**', (route) => route.abort());
  await page.route('**/clerk.accounts.dev/**', (route) => route.abort());
}

test.describe('mobile nav', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hamburger toggles overlay with nav links', async ({ page }) => {
    await blockClerkNetwork(page);
    await page.goto('/', { waitUntil: 'load' });
    const toggle = page.getByRole('button', { name: /open menu/i });
    await expect(toggle).toBeVisible();

    // overlay hidden initially
    await expect(page.getByRole('navigation', { name: /mobile/i })).not.toBeVisible();

    // tap toggle → overlay shows
    await toggle.click();
    const overlay = page.getByRole('navigation', { name: /mobile/i });
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('link', { name: /tournaments/i })).toBeVisible();
    await expect(overlay.getByRole('link', { name: /leaderboard/i })).toBeVisible();

    // tap toggle again → hides (button now has label "Close menu")
    await page.getByRole('button', { name: /close menu/i }).click();
    await expect(overlay).not.toBeVisible();
  });

  test('hamburger is at least 44pt tap target', async ({ page }) => {
    await blockClerkNetwork(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const toggle = page.getByRole('button', { name: /open menu/i });
    const box = await toggle.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
