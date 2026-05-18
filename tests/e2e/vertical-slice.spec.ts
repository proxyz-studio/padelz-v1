import { test, expect } from '@playwright/test';

// Block Clerk FAPI calls so the stub publishable key doesn't cause client-side
// redirects to accounts.dev in tests. Our pages are public (no ClerkProvider in
// layout) so blocking these is safe — the h1 content comes from SSR.
async function blockClerkNetwork(page: import('@playwright/test').Page) {
  await page.route('**/*.clerk.accounts.dev/**', (route) => route.abort());
  await page.route('**/clerk.accounts.dev/**', (route) => route.abort());
}

test('home page renders Padelz heading', async ({ page }) => {
  await blockClerkNetwork(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /padelz/i })).toBeVisible();
});

test('leaderboard page shows seeded players from db', async ({ page }) => {
  await blockClerkNetwork(page);
  await page.goto('/leaderboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /leaderboard/i })).toBeVisible();
  await expect(page.getByText(/Seed Player/i).first()).toBeVisible();
});

test.skip('signed-in user sees their name on the leaderboard (unskip in M1)', async ({ page }) => {
  // Requires real Clerk creds + a Clerk test user. Wired in M1.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /padelz/i })).toBeVisible();

  await page.goto('/sign-in');
  await page.fill('[name="identifier"]', 'test@padelz.example');
  await page.fill('[name="password"]', process.env.E2E_TEST_PASSWORD ?? 'changeme');
  await page.click('button:has-text("Continue")');

  await page.waitForURL('/');
  await page.goto('/leaderboard');
  await expect(page.getByText('Leaderboard')).toBeVisible();
  await expect(page.getByText(/Seed Player/i)).toBeVisible();
});
