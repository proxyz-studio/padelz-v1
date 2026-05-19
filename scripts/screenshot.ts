import { chromium, devices, type Route } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:3000';
const OUT_DIR = join(process.cwd(), '.preview');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { path: '/', name: 'home' },
  { path: '/leaderboard', name: 'leaderboard' },
];

const viewports = [
  { name: 'desktop', ...devices['Desktop Chrome'] },
  { name: 'mobile', ...devices['Pixel 5'] },
];

async function blockClerk(route: Route) {
  if (/\.clerk\.accounts\.dev|\.clerk\.com|clerk-telemetry/.test(route.request().url())) {
    return route.abort();
  }
  return route.continue();
}

async function main() {
  const browser = await chromium.launch();
  for (const viewport of viewports) {
    const context = await browser.newContext(viewport);
    await context.route('**/*', blockClerk);
    const page = await context.newPage();
    for (const t of targets) {
      const url = BASE + t.path;
      console.log(`-> ${viewport.name} ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(800);
      const out = join(OUT_DIR, `${t.name}-${viewport.name}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log(`   saved ${out}`);
    }
    await context.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
