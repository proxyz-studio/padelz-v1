import { chromium } from '@playwright/test';

const URL = process.env.SITE_URL || 'http://localhost:3000';
const ROUTES = [
  { url: '/leaderboard', file: 'leaderboard-mobile.png' },
  { url: '/t', file: 'tournament-mobile.png' },
  { url: '/sign-in', file: 'signin-mobile.png' }, // seed has no matches yet; sign-in is a stable third screenshot
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
});
const page = await ctx.newPage();

for (const r of ROUTES) {
  await page.goto(`${URL}${r.url}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `public/screenshots/${r.file}`, fullPage: false });
  console.log(`captured ${r.file}`);
}

await browser.close();
