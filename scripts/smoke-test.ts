const url = process.env.SMOKE_URL ?? 'https://padelz.proxyz.studio';
const checks = [
  { path: '/', mustContain: 'Padelz' },
  { path: '/leaderboard', mustContain: 'Leaderboard' },
  { path: '/sign-in', mustContain: 'Sign in' },
  { path: '/manifest.json', mustContain: 'padelz' },
];

async function main() {
  let failed = 0;
  for (const c of checks) {
    try {
      const res = await fetch(url + c.path);
      const text = await res.text();
      if (!res.ok || !text.toLowerCase().includes(c.mustContain.toLowerCase())) {
        console.error(`FAIL ${c.path}: ${res.status}, missing "${c.mustContain}"`);
        failed++;
      } else {
        console.log(`OK   ${c.path}`);
      }
    } catch (e: any) {
      console.error(`FAIL ${c.path}: ${e.message}`);
      failed++;
    }
  }
  if (failed > 0) process.exit(1);
  console.log(`All ${checks.length} checks passed against ${url}`);
}

main();
