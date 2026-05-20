// tests/e2e/bracket-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('bracket flow', () => {
  test('unauthenticated visitor at admin bracket preview redirects or 404', async ({ page }) => {
    const r = await page.goto('/c/destination-padel/admin/tournaments/00000000-0000-0000-0000-000000000000/bracket/preview');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });

  test('public tournament page renders bracket-not-generated message when no bracket exists', async ({ page }) => {
    await page.goto('/t/saturday-open-week-1');
    await expect(page.getByText(/Bracket not yet generated/)).toBeVisible();
  });
});
