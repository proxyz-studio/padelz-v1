import { test, expect } from '@playwright/test';

test.describe('service worker cache versioning', () => {
  test('cache name contains current build ID', async ({ page, request }) => {
    await page.goto('/');
    // Wait for SW to register
    await page.waitForFunction(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    });

    // Read sw.js and confirm BUILD_ID was injected (not the placeholder)
    const swResp = await request.get('/sw.js');
    const swText = await swResp.text();
    // The postbuild script replaces __BUILD_ID__ with a real Next.js build hash.
    // The sw uses: const BUILD_ID = '<hash>'; const CACHE = `padelz-v${BUILD_ID}`;
    // Verify the placeholder is gone and a real hash is present.
    expect(swText).not.toContain('__BUILD_ID__');
    expect(swText).toMatch(/const BUILD_ID = '[a-zA-Z0-9_-]+'/);
  });
});
