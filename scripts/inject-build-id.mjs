import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BUILD_ID_PATH = resolve('.next/BUILD_ID');
const TEMPLATE = resolve('public/sw.template.js');
const OUT = resolve('public/sw.js');

if (!existsSync(BUILD_ID_PATH)) {
  console.error('inject-build-id: .next/BUILD_ID not found; run after `next build`.');
  process.exit(1);
}

const buildId = readFileSync(BUILD_ID_PATH, 'utf8').trim();
const sw = readFileSync(TEMPLATE, 'utf8');
const out = sw.replace(/__BUILD_ID__/g, buildId);
writeFileSync(OUT, out, 'utf8');
console.log(`inject-build-id: wrote BUILD_ID=${buildId} into public/sw.js`);
