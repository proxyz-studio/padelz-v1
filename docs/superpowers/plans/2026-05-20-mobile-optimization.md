# Padel-Z mobile + perf optimization — implementation plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three phases that make Padel-Z usable on iPhone Safari, installable to the home screen with proper cache invalidation, and provably fast against Lighthouse mobile budgets.

**Architecture:** One codebase, two layouts. Single mobile breakpoint at 720px. Tables collapse into stacked cards on mobile via per-route hand-tuned variants. Hamburger nav overlay below 720px. Service worker re-keyed per build-ID so each deploy auto-invalidates the previous cache. Lighthouse-driven targeted fixes (measure first, fix only red).

**Tech Stack:** Next.js 16.2.6 + TypeScript + Tailwind v4 (custom CSS heavy, minimal utility class use per the niklas language) + Vitest + Playwright + Drizzle/Postgres (unchanged) + Vercel.

**Spec:** `docs/superpowers/specs/2026-05-20-mobile-optimization-design.md`

**Project conventions:**
- Stay on `main` — direct commits, no PR branches.
- Commitlint enforces lowercase subject case. Use `feat(mobile): …` / `feat(pwa): …` / `perf(mobile): …` patterns.
- TDD: failing test first, then implementation. Reference `@superpowers:test-driven-development`.
- AGENTS.md design discipline is locked — one font (Inter 400), one size per breakpoint, white background, color is semantic.
- Worktree note: harness opens worktrees, but commits go to `/Users/tews/Code/padelz-v1` on `main`. From a worktree, `cd /Users/tews/Code/padelz-v1` lands on main.

---

## File structure overview

Before tasks, here's where work lands. Each file has one responsibility.

### New files (created in this plan)
- `src/components/MobileNavToggle.tsx` — client component, hamburger button + slide-down overlay. Owns ONE concern: showing/hiding the mobile nav. Imported by `Nav.tsx`.
- `src/app/icon.tsx` — Next.js convention, exports a 192/512 PNG via `next/og` `ImageResponse`. Renders the `PZ` monogram.
- `src/app/apple-icon.tsx` — Next.js convention, exports a 180×180 PNG for iOS home-screen icon.
- `tests/e2e/mobile-layout.spec.ts` — Playwright snapshots of 8 routes × 3 viewports.
- `tests/e2e/sw-cache-invalidation.spec.ts` — Playwright smoke for service worker versioning.
- `scripts/inject-build-id.mjs` — postbuild script that replaces `__BUILD_ID__` in `public/sw.js`.
- `docs/lighthouse-baseline-2026-05-20.md` — Lighthouse baseline + post-fix results.

### Modified files (touched in this plan)
- `src/app/globals.css` — add tap-target rules + base mobile overrides in the existing `@media (max-width: 720px)` block.
- `src/components/Nav.tsx` — render MobileNavToggle below 720px.
- `src/app/page.tsx` — mobile card variant for latest tournaments section.
- `src/app/t/page.tsx` — mobile card variant for tournament list.
- `src/app/leaderboard/page.tsx` — minor mobile adjustments + `revalidate = 30` if needed for Phase 3.
- `src/app/c/[slug]/page.tsx` — minor card variant for club roster.
- `src/app/p/[handle]/page.tsx` — stats grid → 1-col mobile.
- `src/app/match/[id]/submit/page.tsx` — touch-sized form.
- `src/app/match/[id]/confirm/page.tsx` — touch-sized form.
- `src/app/c/[slug]/admin/tournaments/[id]/scores/page.tsx` + `src/features/scoring/components/AdminScoreTable.tsx` — card variant + action row.
- `src/app/manifest.ts` — full rewrite per spec §6.2.
- `public/sw.js` — cache versioning refactor.
- `package.json` — add `postbuild` script.
- Possibly: `instrumentation-client.ts`, `src/middleware.ts` (only if Lighthouse flags TBT issues).

---

## Chunk 1: Phase 1 — Mobile layout

This chunk is the visual transformation. Tables → cards below 720px, nav → hamburger, tap targets up to iOS HIG minimum. 12 tasks.

### Task 1.1: Add mobile-only globals.css primitives

**Files:**
- Modify: `src/app/globals.css` (find the existing `@media (max-width: 720px)` block around line 173 and extend it)

- [ ] **Step 1: Read the existing mobile block**

Look at `src/app/globals.css` lines 170-220. Confirm the existing `@media (max-width: 720px)` block exists with body font-size override.

- [ ] **Step 2: Add tap-target + base table overrides to the mobile block**

Extend the existing `@media (max-width: 720px)` block:

```css
@media (max-width: 720px) {
  /* (existing rules — body font-size 18px, tracking -0.4px — keep them) */

  /* iOS HIG minimum tap targets */
  .arrow,
  .btn-link,
  a.no-underline {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }

  /* Bare-input score fields */
  .score-input {
    min-height: 44px;
    font-size: 18px;
  }

  /* Default table → single column. Per-route variants override with their own grid. */
  .table {
    display: block;
  }
  .table > * {
    display: block;
  }
  .table .row,
  .table > div {
    display: block;
    padding: 12px 0;
    border-bottom: 1px solid var(--color-rule);
  }

  /* Mobile-only show/hide helpers — used by per-route variants */
  .desktop-only { display: none !important; }
  .mobile-only { display: block !important; }
}

/* Hide mobile-only blocks on desktop */
@media (min-width: 721px) {
  .mobile-only { display: none !important; }
}
```

- [ ] **Step 3: Verify the CSS compiles**

Run: `npm run build` (or just `npm run check-types` if build is slow)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/tews/Code/padelz-v1
git add src/app/globals.css
git commit -m "feat(mobile): tap-target + base table override primitives in globals.css"
```

---

### Task 1.2: MobileNavToggle component + Nav refactor

**Files:**
- Create: `src/components/MobileNavToggle.tsx`
- Modify: `src/components/Nav.tsx`
- Test: `tests/e2e/mobile-nav.spec.ts`

- [ ] **Step 1: Write a failing E2E test**

`tests/e2e/mobile-nav.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('mobile nav', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hamburger toggles overlay with nav links', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /open menu/i });
    await expect(toggle).toBeVisible();

    // overlay hidden initially
    await expect(page.getByRole('navigation', { name: /mobile/i })).not.toBeVisible();

    // tap toggle → overlay shows
    await toggle.click();
    const overlay = page.getByRole('navigation', { name: /mobile/i });
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('link', { name: /tournaments/i })).toBeVisible();
    await expect(overlay.getByRole('link', { name: /leaderboard/i })).toBeVisible();

    // tap toggle again → hides
    await toggle.click();
    await expect(overlay).not.toBeVisible();
  });

  test('hamburger is at least 44pt tap target', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /open menu/i });
    const box = await toggle.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd /Users/tews/Code/padelz-v1
npx playwright test tests/e2e/mobile-nav.spec.ts
```

Expected: FAIL (toggle doesn't exist yet).

- [ ] **Step 3: Implement MobileNavToggle**

`src/components/MobileNavToggle.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function MobileNavToggle({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-overlay"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="md:hidden"
        style={{
          minWidth: 44,
          minHeight: 44,
          padding: 0,
          background: 'transparent',
          border: 0,
          fontSize: 24,
          lineHeight: 1,
          color: 'var(--color-fg)',
          cursor: 'pointer',
        }}
      >
        {open ? '×' : '☰'}
      </button>
      {open ? (
        <nav
          ref={overlayRef as React.RefObject<HTMLElement>}
          id="mobile-nav-overlay"
          aria-label="Mobile primary"
          className="md:hidden"
          style={{
            position: 'fixed',
            top: 64,
            left: 0,
            right: 0,
            background: 'var(--color-bg)',
            borderBottom: `1px solid var(--color-rule)`,
            padding: '12px 16px 24px',
            zIndex: 50,
          }}
        >
          <Link href="/t" onClick={() => setOpen(false)} className="no-underline" style={{ display: 'block', padding: '12px 0', minHeight: 44 }}>Tournaments</Link>
          <Link href="/leaderboard" onClick={() => setOpen(false)} className="no-underline" style={{ display: 'block', padding: '12px 0', minHeight: 44 }}>Leaderboard</Link>
          <div style={{ borderTop: `1px solid var(--color-rule)`, marginTop: 8, paddingTop: 8 }}>
            <Link href="/sign-in" onClick={() => setOpen(false)} className="no-underline" style={{ display: 'block', padding: '12px 0', minHeight: 44 }}>Sign in →</Link>
          </div>
          {children}
        </nav>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Update `src/components/Nav.tsx`**

Current Nav.tsx (verified by the planning agent — do NOT re-read first, just replace the file contents):

```tsx
import Link from 'next/link';

export function Nav() {
  return (
    <header className="px-4 pt-4 pb-20">
      <div className="grid grid-cols-2 items-baseline gap-6 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <Link href="/" className="no-underline hover:no-underline">
          Padel-<span className="pink font-bold">Z</span>
        </Link>
        <Link href="/t" className="hidden md:block">
          Tournaments <span className="mute">↓</span>
        </Link>
        <Link href="/leaderboard" className="hidden md:block">
          Leaderboard <span className="mute">↓</span>
        </Link>
        <Link href="/about" className="hidden md:block mute">
          About
        </Link>
        <Link href="/sign-in" className="text-right">
          Login <span className="mute">→</span>
        </Link>
      </div>
    </header>
  );
}
```

Replace with:

```tsx
import Link from 'next/link';
import MobileNavToggle from './MobileNavToggle';

export function Nav() {
  return (
    <header className="px-4 pt-4 pb-20">
      <div className="grid grid-cols-2 items-baseline gap-6 md:grid-cols-[1fr_auto_auto_auto_auto]">
        <Link href="/" className="no-underline hover:no-underline">
          Padel-<span className="pink font-bold">Z</span>
        </Link>
        <Link href="/t" className="hidden md:block">
          Tournaments <span className="mute">↓</span>
        </Link>
        <Link href="/leaderboard" className="hidden md:block">
          Leaderboard <span className="mute">↓</span>
        </Link>
        <Link href="/about" className="hidden md:block mute">
          About
        </Link>
        <Link href="/sign-in" className="hidden md:block text-right">
          Login <span className="mute">→</span>
        </Link>
        <div className="md:hidden text-right">
          <MobileNavToggle />
        </div>
      </div>
    </header>
  );
}
```

Two changes only: (1) add `hidden md:block` to the existing Login link so it disappears on mobile, (2) add a `md:hidden` wrapper rendering MobileNavToggle in its place. Tailwind `md:` here means ≥768px; this plus the `@media (max-width: 720px)` in globals.css means the gap 721-767px shows neither the Login link nor the hamburger — accept this as the boundary because it's so narrow no real device sits there.

- [ ] **Step 5: Run E2E test, confirm it passes**

```bash
npx playwright test tests/e2e/mobile-nav.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run type-check + lint**

```bash
npm run check-types && npm run lint
```

Both must be clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/tews/Code/padelz-v1
git add src/components/MobileNavToggle.tsx src/components/Nav.tsx tests/e2e/mobile-nav.spec.ts
git commit -m "feat(mobile): hamburger nav overlay with esc-close and 44pt tap targets"
```

---

### Task 1.3: Landing page (`/`) mobile card variant

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read the current page** — open `src/app/page.tsx`. Find the "Latest tournaments" or equivalent table section. Note its grid template.

- [ ] **Step 2: Wrap the table in a `desktop-only` div and add a `mobile-only` card stack**

Pattern: keep the desktop grid table as-is, wrap in `<div className="desktop-only">`. Add a new `<div className="mobile-only">` rendering the same data as stacked cards. Each card is a `<Link>` with:
- Tournament name (bold)
- Status (`.fn-green.font-bold` if open, default otherwise) on the right
- Meta line: year · format · type (muted)
- Meta line: date · host (muted)
- Arrow at bottom right

Approximate mobile card markup:

```tsx
<div className="mobile-only">
  {tournaments.map((t) => (
    <Link key={t.slug} href={`/t/${t.slug}`} className="no-underline" style={{ display: 'block', padding: '16px 0', borderBottom: '1px solid var(--color-rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <strong>{t.name}</strong>
        <span className={t.status === 'open' ? 'fn-green font-bold' : 'mute'} style={{ fontSize: 14 }}>{t.status}</span>
      </div>
      <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>{t.year ?? new Date(t.start_at).getFullYear()} · {t.format} · {t.tournament_type}</div>
      <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>{new Date(t.start_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {t.club_name}</div>
    </Link>
  ))}
</div>
```

- [ ] **Step 3: Verify in browser at 390px**

Open dev server, set viewport to 390 in Chrome DevTools, confirm card layout renders + desktop table is hidden. Then switch to 1024 wide, confirm desktop grid is back.

- [ ] **Step 4: Run lint + type-check**

```bash
npm run check-types && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(mobile): landing page tournament card variant below 720px"
```

---

### Task 1.4: Tournaments list (`/t`) mobile card variant

**Files:**
- Modify: `src/app/t/page.tsx`

- [ ] **Step 1: Read current `/t` page** — note the grid template, what data each cell displays.

- [ ] **Step 2: Apply the same desktop-table / mobile-card split as Task 1.3**

The /t page already shows the most overflow on mobile. Card shape:

```tsx
<div className="mobile-only">
  {tournaments.map((t) => (
    <Link key={t.slug} href={`/t/${t.slug}`} className="no-underline" style={{ display: 'block', padding: '16px 0', borderBottom: '1px solid var(--color-rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <strong>{t.name}</strong>
        <span className={t.status === 'open' ? 'fn-green font-bold' : 'mute'} style={{ fontSize: 14 }}>{t.status}</span>
      </div>
      <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>{t.year} · {t.format} · {t.tournament_type}</div>
      <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>{formatDate(t.start_at)} · {t.club_name}</div>
      <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>{t.tier_band ? t.tier_band : 'All tiers'}</div>
    </Link>
  ))}
</div>
```

- [ ] **Step 3: Verify at 390px** — confirm "Saturday Open" card shows name, status, year/format/type, date/host, tier band, with no overflow.

- [ ] **Step 4: Commit**

```bash
git add src/app/t/page.tsx
git commit -m "feat(mobile): tournaments list card variant below 720px"
```

---

### Task 1.5: Leaderboard (`/leaderboard`) mobile minor

**Files:**
- Modify: `src/app/leaderboard/page.tsx`

- [ ] **Step 1: Read current page** — already 4 columns, fits OK on 390px but tier label could be clearer.

- [ ] **Step 2: Add a mobile card variant**

Same pattern:

```tsx
<div className="mobile-only">
  {rows.map((r) => (
    <div key={r.player_id} style={{ display: 'block', padding: '16px 0', borderBottom: '1px solid var(--color-rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <strong style={{ marginRight: 8 }}>{String(r.rank).padStart(2, '0')}</strong>
          {r.display_name} <span className="mute">@{r.handle}</span>
        </div>
        <span className={r.tier === 'platinum' ? 'pink font-bold' : r.tier === 'diamond' ? 'fn-blue font-bold' : 'mute'} style={{ fontSize: 14 }}>{r.tier}</span>
      </div>
      <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>{r.points_sum} pts · {r.match_count} matches</div>
    </div>
  ))}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(mobile): leaderboard card variant below 720px"
```

---

### Task 1.6: Club page (`/c/[slug]`) mobile minor

**Files:**
- Modify: `src/app/c/[slug]/page.tsx`

- [ ] **Step 1: Read current page** — note roster table structure.

- [ ] **Step 2: Wrap roster table in desktop-only, add mobile-only stack**

Mobile card per roster row:
- Player name (bold) + tier on the right
- Handle + role (muted)
- Arrow link to player profile

- [ ] **Step 3: Commit**

```bash
git add src/app/c/[slug]/page.tsx
git commit -m "feat(mobile): club page roster card variant below 720px"
```

---

### Task 1.7: Player page (`/p/[handle]`) stats single-column

**Files:**
- Modify: `src/app/p/[handle]/page.tsx`

- [ ] **Step 1: Read current stats grid** — likely a 2-col grid (label/value pairs).

- [ ] **Step 2: Add mobile rule**

If the stats grid uses `grid-template-columns: 1fr 1fr` on desktop, add a `@media (max-width: 720px)` override to `grid-template-columns: 1fr` inline-style or via a class. Or simpler: change the grid to be inherently fluid (`auto-fit, minmax(160px, 1fr)`).

- [ ] **Step 3: Commit**

```bash
git add src/app/p/[handle]/page.tsx
git commit -m "feat(mobile): player profile stats single-column on mobile"
```

---

### Task 1.8: Submit form touch-sized

**Files:**
- Modify: `src/app/match/[id]/submit/page.tsx` and/or `src/features/scoring/components/SubmitScoreForm.tsx`

- [ ] **Step 1: Find score input + submit button** — likely uses `.score-input` class.

- [ ] **Step 2: Already partially handled by Task 1.1 (`.score-input` min-height: 44px on mobile)**

Verify on mobile viewport:
- Score inputs are 44pt tall
- Submit button is full-width and 44pt tall below 720px

If the submit button isn't full-width on mobile, add inline style or class:

```tsx
<button type="submit" style={{ width: '100%', minHeight: 44 }}>Submit score</button>
```

(Adjust to match existing button pattern — likely `.btn-link` or inline-styled.)

- [ ] **Step 3: Commit**

```bash
git add src/features/scoring/components/SubmitScoreForm.tsx
git commit -m "feat(mobile): touch-sized submit-score form"
```

---

### Task 1.9: Confirm form touch-sized

**Files:**
- Modify: `src/features/scoring/components/ConfirmScorePanel.tsx`

Same pattern as Task 1.8. Verify Confirm + Dispute buttons are full-width and 44pt tall on mobile.

- [ ] **Commit:**

```bash
git add src/features/scoring/components/ConfirmScorePanel.tsx
git commit -m "feat(mobile): touch-sized confirm-score panel"
```

---

### Task 1.10: Admin scores table — the big one

**Files:**
- Modify: `src/features/scoring/components/AdminScoreTable.tsx`

- [ ] **Step 1: Read the current component** — note its grid template (5 cols: # · Status · Teams+Score · Winner · Actions).

- [ ] **Step 2: Add desktop-only / mobile-only split inside the component**

Mobile card per row:

```tsx
<div className="mobile-only" style={{ padding: '16px 0', borderBottom: '1px solid var(--color-rule)' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
    <strong>{String(idx + 1).padStart(2, '0')} · {team1Label} vs {team2Label}</strong>
    <span className={statusClass(status)}>{statusLabel(status)}</span>
  </div>
  <div style={{ marginTop: 6 }}>
    <strong>{score1} – {score2}</strong>
    {winner ? <span className="mute"> · Winner: {winner}</span> : null}
  </div>
  {isAdmin ? (
    <div style={{ marginTop: 12, display: 'flex', gap: 24 }}>
      <button onClick={onOverride} className="fn-blue font-bold btn-link" style={{ minHeight: 44 }}>Override →</button>
      {status !== 'void' ? <button onClick={onVoid} className="fn-red font-bold btn-link" style={{ minHeight: 44 }}>Void →</button> : null}
    </div>
  ) : null}
</div>
```

Where:
- `statusClass`: 'pending' → 'mute', 'confirmed' → 'fn-green font-bold', 'disputed' → 'fn-red font-bold', 'admin_set' → 'fn-blue font-bold', 'void' → 'fn-red font-bold'
- `statusLabel`: uppercase the status

Hand-tune to match the existing component's data shape.

- [ ] **Step 3: Verify at 390px** — confirm Override + Void are real tap targets, all data visible.

- [ ] **Step 4: Commit**

```bash
git add src/features/scoring/components/AdminScoreTable.tsx
git commit -m "feat(mobile): admin scores card variant with action row below 720px"
```

---

### Task 1.11: Playwright snapshot tests for the 8 routes

**Files:**
- Create: `tests/e2e/mobile-layout.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect, devices } from '@playwright/test';

const routes = [
  { name: 'landing', url: '/' },
  { name: 'tournaments', url: '/t' },
  { name: 'leaderboard', url: '/leaderboard' },
  // (add club/player after seed has those slugs available)
] as const;

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet-edge', width: 720, height: 1024 },
  { name: 'desktop', width: 1024, height: 800 },
] as const;

for (const route of routes) {
  for (const v of viewports) {
    test(`${route.name} renders without horizontal scroll at ${v.name}`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto(route.url);
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasOverflow).toBe(false);
    });
  }
}
```

- [ ] **Step 2: Run the tests**

```bash
npx playwright test tests/e2e/mobile-layout.spec.ts
```

Expected: all green.

- [ ] **Step 3: If any fail, fix the offending route in its prior task. Do not silence the test.**

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/mobile-layout.spec.ts
git commit -m "test(mobile): no-horizontal-overflow snapshot tests for 3 viewports"
```

---

### Task 1.12: Phase 1 sign-off

- [ ] **Step 1: Verification gate**

```bash
cd /Users/tews/Code/padelz-v1
npm run check-types
npm run lint
npm run test -- --run
npx playwright test tests/e2e/mobile-layout.spec.ts tests/e2e/mobile-nav.spec.ts
```

All must pass.

- [ ] **Step 2: Push to origin**

```bash
git push origin main
```

- [ ] **Step 3: Wait for Vercel auto-deploy + smoke test the live URL at 390px**

Hit `https://padelz-v1.vercel.app/` and `/t` in mobile-emulated browser. Confirm card layouts render.

- [ ] **Step 4: Phase 1 complete.** Proceed to Chunk 2.

---

## Chunk 2: Phase 2 — PWA install + cache versioning

### Task 2.1: Resolve the current service worker location

**Files:**
- Read only: `public/sw.js`, `src/components/RegisterServiceWorker.tsx`, `src/app/manifest.ts`

- [ ] **Step 1: Grep for SW**

```bash
cd /Users/tews/Code/padelz-v1
grep -rn "serviceWorker\|registerSW\|sw\.js" src/ public/ next.config.* 2>/dev/null
```

- [ ] **Step 2: Document findings in a temp note (not committed)** — confirm whether SW is at `public/sw.js`, registered by `RegisterServiceWorker.tsx`, or generated by a plugin. Note the current cache name string + strategy.

- [ ] **Step 3: No commit; this is reconnaissance for Task 2.5.**

---

### Task 2.2: Capture Phase 1 mobile screenshots for the manifest

**Files:**
- Create: `public/screenshots/leaderboard-mobile.png`, `tournament-mobile.png`, `submit-mobile.png`

- [ ] **Step 1: Write a Playwright script to capture three screenshots at iPhone 15 Pro Max viewport (1290 × 2796 physical, 430 × 932 CSS @ 3x)**

`scripts/capture-pwa-screenshots.mjs`:

```javascript
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
```

- [ ] **Step 2: Start the dev server, run the script**

```bash
npm run dev &  # in background
sleep 5
node scripts/capture-pwa-screenshots.mjs
```

- [ ] **Step 3: Verify the three PNGs exist + look right**

```bash
ls -lh public/screenshots/
```

If a match ID doesn't exist in seed, swap the third route to `/sign-in` or `/p/seed-player-0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-pwa-screenshots.mjs public/screenshots/
git commit -m "feat(pwa): mobile screenshots for manifest install prompt"
```

---

### Task 2.3: Generate icon + apple-icon via next/og

**Files:**
- Create: `src/app/icon.tsx`, `src/app/apple-icon.tsx`

- [ ] **Step 1: Write `src/app/icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 320,
          fontWeight: 900,
          letterSpacing: -24,
          color: '#1a1a1a',
        }}
      >
        P<span style={{ color: '#ff4193' }}>Z</span>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: Write `src/app/apple-icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 112,
          fontWeight: 900,
          letterSpacing: -8,
          color: '#1a1a1a',
        }}
      >
        P<span style={{ color: '#ff4193' }}>Z</span>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 3: Verify by hitting `/icon` and `/apple-icon`**

```bash
npm run dev &
sleep 5
curl -I http://localhost:3000/icon
curl -I http://localhost:3000/apple-icon
```

Both must return 200 + `content-type: image/png`.

- [ ] **Step 4: Commit**

```bash
git add src/app/icon.tsx src/app/apple-icon.tsx
git commit -m "feat(pwa): PZ monogram icons via next/og for both Android and iOS"
```

---

### Task 2.4: Update manifest.ts

**Files:**
- Modify: `src/app/manifest.ts`

- [ ] **Step 1: Replace manifest with the full spec from design §6.2**

```typescript
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Padel-Z',
    short_name: 'Padel-Z',
    description: 'Phuket padel community — tournaments, scores, leaderboard.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      // Next.js serves /icon (from src/app/icon.tsx, 512x512) — point both regular and maskable purposes at it.
      // Do NOT create /public/icons/*.png files; the next/og route is the single source of truth.
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: [
      { src: '/screenshots/leaderboard-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Leaderboard' },
      { src: '/screenshots/tournament-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Tournament' },
      { src: '/screenshots/signin-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Sign in' },
    ],
    shortcuts: [
      { name: 'Leaderboard', url: '/leaderboard' },
      { name: 'Tournaments', url: '/t' },
      { name: 'My profile', url: '/me' },
    ],
  };
}
```

(`/me` route may not exist yet — fall back to `/sign-in` if so.)

- [ ] **Step 2: Verify /manifest.webmanifest serves correctly**

```bash
curl http://localhost:3000/manifest.webmanifest | head -40
```

- [ ] **Step 3: Commit**

```bash
git add src/app/manifest.ts
git commit -m "feat(pwa): full manifest with shortcuts and install screenshots"
```

---

### Task 2.5: Service worker cache versioning

**Files:**
- Modify: `public/sw.js` (or wherever Task 2.1 reconnaissance located the SW)

Current `public/sw.js` (verified by the planning agent — fully replace the file with the version below; existing handler is 24 lines, no preservation logic needed):

```javascript
const CACHE_NAME = 'padelz-shell-v1';
const APP_SHELL = ['/', '/leaderboard', '/manifest.webmanifest'];
// (install/activate/fetch handlers using CACHE_NAME)
```

- [ ] **Step 1: Move source to a template, then write the new SW**

We can't track `public/sw.js` directly because the postbuild step rewrites it on every build (would dirty git). Instead: keep the source at `public/sw.template.js` (tracked), let postbuild generate `public/sw.js` (gitignored).

```bash
cd /Users/tews/Code/padelz-v1
git mv public/sw.js public/sw.template.js
echo "/public/sw.js" >> .gitignore
```

- [ ] **Step 2: Write the new template content to `public/sw.template.js`**

Replace the entire file with:

```javascript
const BUILD_ID = '__BUILD_ID__';
const CACHE = `padelz-v${BUILD_ID}`;
const APP_SHELL = ['/', '/leaderboard', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('/api/') || req.url.includes('/_next/')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    })
  );
});
```

- [ ] **Step 3: Commit**

```bash
git add public/sw.template.js .gitignore
git commit -m "feat(pwa): SW template with build-ID-keyed cache and old-cache cleanup"
```

---

### Task 2.6: Postbuild script to inject BUILD_ID

**Files:**
- Create: `scripts/inject-build-id.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the script**

`scripts/inject-build-id.mjs`:

```javascript
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
```

This reads from `public/sw.template.js` (tracked) and writes to `public/sw.js` (gitignored), so git stays clean on every build.

- [ ] **Step 2: Add `postbuild` to package.json**

In the `scripts` object, add:

```json
"postbuild": "node scripts/inject-build-id.mjs"
```

- [ ] **Step 3: Run a local build to verify**

```bash
npm run build
```

Inspect `public/sw.js` after build — file should exist (it's gitignored, so it appears after the first build), and `__BUILD_ID__` should be replaced with a real hash. Git status stays clean.

- [ ] **Step 4: Commit**

```bash
git add scripts/inject-build-id.mjs package.json
git commit -m "feat(pwa): postbuild script injects BUILD_ID into sw.js for cache versioning"
```

---

### Task 2.7: SW cache invalidation smoke test

**Files:**
- Create: `tests/e2e/sw-cache-invalidation.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
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
    expect(swText).not.toContain('__BUILD_ID__');
    expect(swText).toMatch(/padelz-v[a-zA-Z0-9_-]+/);
  });
});
```

- [ ] **Step 2: Run the test against a built+served bundle**

Dev mode does NOT run the postbuild SW injection. Must use the production build:

```bash
npm run build
PORT=3001 npm start &
SERVER_PID=$!
sleep 5
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/sw-cache-invalidation.spec.ts
kill $SERVER_PID
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sw-cache-invalidation.spec.ts
git commit -m "test(pwa): verify SW BUILD_ID injection succeeded"
```

---

### Task 2.8: Phase 2 sign-off (manual gate — Tew's morning task)

This task does NOT auto-execute. It's a checklist for Tew in the morning.

- [ ] **Step 1: Push everything to origin** (handled at end of overnight build).

- [ ] **Step 2: After Vercel auto-deploy** — Tew opens `https://padelz-v1.vercel.app/` on iPhone 15 Pro Max Safari.

- [ ] **Step 3: Tap share → Add to Home Screen.** Confirm:
  - Icon is the `PZ` monogram (not a Safari screenshot)
  - Title is "Padel-Z"

- [ ] **Step 4: Launch from home screen.** Confirm:
  - Opens fullscreen
  - No Safari address bar visible
  - Navigates to `/`

- [ ] **Step 5: Trigger a no-op deploy** (e.g., edit a comment in `AGENTS.md`, push). Wait for Vercel Ready.

- [ ] **Step 6: Reopen from home screen icon.** Confirm the new build's content appears on next navigation without manual refresh.

If all 6 checks pass: Phase 2 done.

---

## Chunk 3: Phase 3 — Speed audit + targeted fixes

### Task 3.1: Lighthouse baseline against the live build

**Files:**
- Create: `docs/lighthouse-baseline-2026-05-20.md`

- [ ] **Step 1: Run Lighthouse CI against four routes**

```bash
cd /Users/tews/Code/padelz-v1
npx --yes @lhci/cli@0.13 autorun \
  --collect.url=https://padelz-v1.vercel.app/ \
  --collect.url=https://padelz-v1.vercel.app/leaderboard \
  --collect.url=https://padelz-v1.vercel.app/t \
  --collect.url=https://padelz-v1.vercel.app/sign-in \
  --collect.settings.preset=desktop \
  --collect.numberOfRuns=1 \
  --upload.target=temporary-public-storage \
  | tee .lhci-output.txt
```

(Note: the project's existing `lighthouserc.js` sets mobile preset already; if it's picked up automatically, the CLI flags may be ignored. Confirm by reading `.lhci-output.txt` for which preset ran.)

- [ ] **Step 2: Parse results into a markdown table**

Write `docs/lighthouse-baseline-2026-05-20.md`:

```markdown
# Lighthouse baseline · 2026-05-20

Live build: `e8b272f` + chunk 1 + chunk 2 commits (sha at top of report)
Settings: mobile preset, 4G throttling, Moto G4 emulation.

| Route | FCP | LCP | TBT | CLS | SI | Total JS |
|---|---|---|---|---|---|---|
| /          | … ms | … ms | … ms | … | … ms | … kB |
| /leaderboard | … ms | … ms | … ms | … | … ms | … kB |
| /t         | … ms | … ms | … ms | … | … ms | … kB |
| /sign-in   | … ms | … ms | … ms | … | … ms | … kB |

Budgets: FCP <1500ms · LCP <2500ms · TBT <200ms · CLS <0.1

**Red metrics:** (list any failing route × metric pairs here)

**Top suspect:** (write the implementation agent's hypothesis here)
```

Fill in the actual numbers from `.lhci-output.txt`.

- [ ] **Step 3: Commit**

```bash
git add docs/lighthouse-baseline-2026-05-20.md
git commit -m "docs(perf): lighthouse baseline against live mobile build"
```

---

### Task 3.2: Decide what to fix

Read the baseline. For each (route, metric) pair that's red, pick a fix from the decision tree below and add it as Task 3.3, 3.4, … in this plan. Then execute each.

| Metric red | First fix to try |
|---|---|
| FCP | Add `revalidate = 30` (or `60`) to the offending server page so Vercel CDN-caches the HTML. |
| LCP | Same — `revalidate` on the page. If still red, audit any large element on the page. |
| TBT | Lazy-load Sentry: switch to `lazyLoadIntegrations` per Sentry/Next.js docs. Defer Clerk client on unauthenticated routes. |
| CLS | Ensure `position: fixed` on mobile nav overlay (already done in Task 1.2). Audit any image without explicit width/height. Use `font-display: optional` if font swap is causing layout shift. |

For each fix:

- [ ] **Step N.1:** Apply the smallest possible change addressing the named audit.
- [ ] **Step N.2:** Run Lighthouse again on just the affected route.
- [ ] **Step N.3:** Confirm the metric moved from red → green.
- [ ] **Step N.4:** Commit with `perf(mobile): <one-line> on <route> for <metric>`.

If no metrics are red after baseline, skip Task 3.3+ entirely and proceed to 3.N.

---

### Task 3.N: Phase 3 verification

- [ ] **Step 1: Final Lighthouse run** against all four routes.

- [ ] **Step 2: Append "post-fix" column to `docs/lighthouse-baseline-2026-05-20.md`** showing the deltas.

- [ ] **Step 3: All metrics must be green.** If anything's still red after 3 fix attempts, surface to Tew and stop.

- [ ] **Step 4: Commit**

```bash
git add docs/lighthouse-baseline-2026-05-20.md
git commit -m "docs(perf): post-fix lighthouse showing all budgets green"
```

---

### Task 3.N+1: Phase 3 sign-off (Tew's morning task)

- [ ] **Step 1: Tew opens `padelz-v1.vercel.app/` on his iPhone 15 Pro Max over real 4G** (or Chrome DevTools Fast 3G if no 4G handy).

- [ ] **Step 2: Verify:**
  - First page paint feels under 2 seconds
  - Any tap responds immediately
  - Scroll is smooth

If all green: Phase 3 done.

---

## Final session steps

After Chunk 3 verification:

- [ ] **Update `HANDOFF.md`** with the full session report: commits shipped, what's left for Tew's morning gates, any unresolved issues.

- [ ] **Update `~/.claude/primer.md`** to reflect the active state.

- [ ] **Final commit** if HANDOFF / primer changed:

```bash
git add HANDOFF.md
git commit -m "docs: handoff for overnight mobile + perf build"
git push origin main
```

- [ ] **Final status screen** to the visual companion at `/Users/tews/Code/padelz-v1/.superpowers/brainstorm/55713-*/final-summary.html` listing every commit, what shipped, the three morning gates.

---

## Notes for the implementing agent

- If a task can't proceed because of ambiguity (unclear data shape, missing fixture, etc.), STOP and document the question. Don't guess on user-facing behavior or aesthetics.
- The niklas single-spec design discipline in `AGENTS.md` is locked. Do not introduce new fonts, sizes, colors, or background tones.
- All commits target `main` directly. Run the verification gate (`check-types && lint && test`) before every commit.
- Real-device gates (Phase 2 step 2.8, Phase 3 step 3.N+1) are Tew's morning checklist — document them in HANDOFF, don't try to auto-pass them.
- Skip a task if its prerequisite isn't met (e.g., `/me` route doesn't exist → swap shortcut to `/sign-in` in manifest; specific match ID for screenshot doesn't exist → swap to a real one).

End of plan.
