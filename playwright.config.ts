import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // SSR pages include headings in the initial HTML; domcontentloaded is
    // sufficient and avoids waiting for Clerk's FAPI network calls (which
    // will fail against stub keys in local dev).
    navigationTimeout: 15000,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 5'], channel: 'chrome' } },
  ],
  webServer: process.env.CI
    ? undefined
    : { command: 'npm run dev:next', url: 'http://127.0.0.1:3000', reuseExistingServer: true },
});
