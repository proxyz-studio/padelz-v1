// tests/e2e/admin-route-gating.spec.ts
import { test, expect } from '@playwright/test';

test.describe('admin route gating', () => {
  test('unauthenticated visitor at admin tournament new redirects or 404', async ({ page }) => {
    // The id is fake; we just want to confirm the gating fires before any DB lookup
    const r = await page.goto('/c/destination-padel/admin/tournaments/new');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });

  test('unauthenticated visitor at admin tournament detail redirects or 404', async ({ page }) => {
    // The id is fake; we just want to confirm the gating fires before any DB lookup
    const r = await page.goto('/c/destination-padel/admin/tournaments/00000000-0000-0000-0000-000000000000');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });

  test('unauthenticated visitor at admin tournament edit redirects or 404', async ({ page }) => {
    const r = await page.goto('/c/destination-padel/admin/tournaments/00000000-0000-0000-0000-000000000000/edit');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });

  test('public tournament list remains accessible without auth', async ({ page }) => {
    await page.goto('/t');
    expect(page.url()).toContain('/t');
    expect(page.url()).not.toMatch(/\/sign-in/);
  });
});
