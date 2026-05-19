import { test, expect, type Route } from '@playwright/test';

// Clerk's dev-mode JS hits accounts.dev with the stub key and never completes;
// block those network calls so the SSR HTML can render and assertions pass.
async function blockClerk(route: Route) {
  if (
    /\.clerk\.accounts\.dev|\.clerk\.com|clerk-telemetry/.test(
      route.request().url(),
    )
  ) {
    return route.abort();
  }
  return route.continue();
}

test.beforeEach(async ({ context }) => {
  await context.route('**/*', blockClerk);
});

test('public player profile renders without auth', async ({ page }) => {
  await page.goto('/p/seed-player-2', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Seed Player 2/i })).toBeVisible();
  await expect(page.getByText('@seed-player-2').first()).toBeVisible();
  // tier badge — case-insensitive substring
  await expect(page.getByText(/gold/i).first()).toBeVisible();
});

test('unknown handle returns 404', async ({ page }) => {
  const response = await page.goto('/p/this-handle-does-not-exist-9999', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBe(404);
});
