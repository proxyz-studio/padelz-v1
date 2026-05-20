import { test, expect } from '@playwright/test';

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
