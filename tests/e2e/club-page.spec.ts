import { test, expect, type Route } from '@playwright/test';

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

test('public club page renders without auth', async ({ page }) => {
  await page.goto('/c/destination-padel', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: /Destination Padel/i }),
  ).toBeVisible();
  await expect(page.getByText('/c/destination-padel').first()).toBeVisible();
  await expect(page.getByText(/phuket/i).first()).toBeVisible();
});

test('unknown club slug returns 404', async ({ page }) => {
  const response = await page.goto('/c/this-club-does-not-exist-9999', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBe(404);
});
