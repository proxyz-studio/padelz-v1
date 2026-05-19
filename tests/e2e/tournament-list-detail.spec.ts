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

test('tournament list page renders without auth', async ({ page }) => {
  await page.goto('/t', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: /Tournaments/i }).first(),
  ).toBeVisible();
});

test('tournament detail page shows host club and roster section', async ({
  page,
}) => {
  await page.goto('/t/saturday-open-week-1', {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.getByRole('heading', { name: /Saturday Open/i }),
  ).toBeVisible();
  // Host club link visible
  await expect(page.getByText(/Destination Padel/i).first()).toBeVisible();
  // Roster header
  await expect(page.getByRole('heading', { name: /Roster/i })).toBeVisible();
});

test('unknown tournament slug returns 404', async ({ page }) => {
  const response = await page.goto('/t/does-not-exist-9999', {
    waitUntil: 'domcontentloaded',
  });
  expect(response?.status()).toBe(404);
});
