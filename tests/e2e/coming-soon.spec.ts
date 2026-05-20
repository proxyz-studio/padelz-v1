import { test, expect } from '@playwright/test';

test('anonymous visitor at / is redirected to /coming-soon (gate off)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/coming-soon/);
});

test('public routes remain reachable', async ({ page }) => {
  for (const path of ['/leaderboard', '/t', '/sign-in']) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/coming-soon/);
  }
});

test.describe('/coming-soon', () => {
  test('renders the holding screen with brand line and sign-in link', async ({ page }) => {
    await page.goto('/coming-soon');
    await expect(page.getByText(/Padel-Z/).first()).toBeVisible();
    await expect(page.getByText(/Phuket's padel community/)).toBeVisible();
    await expect(page.getByText(/Opening soon/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in/ })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  test('has no horizontal overflow at iPhone 15 Pro Max viewport', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto('/coming-soon');
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);
  });
});
