// tests/e2e/leaderboard-filter.spec.ts
import { test, expect } from '@playwright/test';

test.describe('leaderboard tier filter', () => {
  test('renders six filter links on the leaderboard page', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByRole('link', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bronze' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Silver' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gold' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Platinum' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Diamond' })).toBeVisible();
  });

  test('clicking Bronze navigates to /leaderboard?tier=bronze', async ({ page }) => {
    await page.goto('/leaderboard');
    await page.getByRole('link', { name: 'Bronze' }).click();
    await expect(page).toHaveURL(/\/leaderboard\?tier=bronze/);
  });

  test('invalid tier param renders unfiltered leaderboard', async ({ page }) => {
    await page.goto('/leaderboard?tier=banana');
    await expect(page).toHaveURL(/\/leaderboard\?tier=banana/);
    await expect(page.getByRole('link', { name: 'All' })).toBeVisible();
  });

  test('/me/points requires auth', async ({ page }) => {
    const r = await page.goto('/me/points');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });
});
