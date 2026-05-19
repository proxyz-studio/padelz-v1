import { test, expect } from '@playwright/test';

// Block Clerk FAPI calls so stub keys don't prevent page rendering.
async function blockClerkNetwork(page: import('@playwright/test').Page) {
  await page.route('**/*.clerk.accounts.dev/**', (route) => route.abort());
  await page.route('**/clerk.accounts.dev/**', (route) => route.abort());
}

const routes = [
  { name: 'landing', url: '/' },
  { name: 'tournaments', url: '/t' },
  { name: 'leaderboard', url: '/leaderboard' },
] as const;

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet-edge', width: 720, height: 1024 },
  { name: 'desktop', width: 1024, height: 800 },
] as const;

for (const route of routes) {
  for (const v of viewports) {
    test(`${route.name} renders without horizontal scroll at ${v.name}`, async ({ page }) => {
      await blockClerkNetwork(page);
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto(route.url, { waitUntil: 'domcontentloaded' });
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasOverflow).toBe(false);
    });
  }
}
