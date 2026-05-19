# Padel-Z mobile + performance optimization — design

**Date:** 2026-05-20
**Author:** Tew + Claude (brainstorming session)
**Status:** Design approved, awaiting implementation plan
**Supersedes:** N/A
**Related:**
- `AGENTS.md` — Padel-Z design language (locked, no edits in this work)
- `docs/superpowers/specs/2026-05-18-padelz-v1-design.md` — original v0.5 design spec
- `docs/superpowers/plans/2026-05-18-padelz-v1-plan.md` — Task 7.1 (PWA polish), Task 7.4 (perf audit)

---

## 1. Context

Padel-Z v0.5 shipped its M1-M4 backend + the niklas single-spec design language on 2026-05-19 (commits `7d89a39`, `d8e649b`, `e9951d8`, `fc31ff4`..`46dbe1f`). The live deployment at `https://padelz-v1.vercel.app` is end-to-end functional with real Neon data and a working leaderboard cron.

Three gaps surfaced during the live-site review:

1. **Tables overflow horizontally on mobile.** Fixed grid templates (`grid-template-columns: 80px 1fr 280px 160px 56px` on `/c/[slug]/admin/tournaments/[id]/scores`, similar on `/t`, `/leaderboard`) do not collapse below 720px. Below ~430px the rightmost columns clip off-screen. The HANDOFF explicitly flagged "Login → nav cell wraps on narrow widths" and "Conflict of interest wraps in admin column" but the real damage is deeper — entire columns are inaccessible on phones.

2. **Service worker shipped without cache versioning.** Task 1.14 added a PWA manifest + SW shell, but the cache name is a static string. During this same session, a stale dark editorial design was served from the SW cache for several minutes after the new niklas design deployed, even though the server's `x-vercel-cache: MISS` confirmed fresh HTML. Every future deploy will trap users on the previous build until they manually clear cache or hard-reload. Unacceptable before the Destination Padel pilot.

3. **No production-build Lighthouse measurement exists.** CI has a `lighthouserc.js` with budgets (FCP <1500ms, LCP <2500ms, TBT <200ms, CLS <0.1) but it has never been run against the live production URL. The codebase is server-component-heavy (only 5 client components total — `SubmitScoreForm`, `ConfirmScorePanel`, `AdminScoreTable`, `RegisterButton`, `RegisterServiceWorker`) so theoretical perf is good, but theoretical isn't measured.

The Destination Padel pilot will onboard ~20 players via WhatsApp share links. Vast majority of first visits will be on iPhone Safari. All three gaps must close before that audience hits the site.

---

## 2. Goals

- Every existing route renders correctly and is fully usable at 390px width (iPhone 15 Pro Max viewport) without horizontal scroll or hidden content.
- All tap targets meet iOS HIG minimum 44pt × 44pt on mobile.
- The site is installable to iPhone home screen with a real branded icon, splash screen, and fullscreen launch (no Safari chrome).
- Each new deploy invalidates the previous service worker cache automatically; users see the latest build on their next page load with no manual action.
- Lighthouse against `padelz-v1.vercel.app` in mobile / 4G mode passes the four budgets in `lighthouserc.js` (FCP <1500ms, LCP <2500ms, TBT <200ms, CLS <0.1).
- One codebase, two layouts. The desktop experience is unchanged.

---

## 3. Non-goals

- **No separate mobile codebase, native app, or React Native fork.** Same Next.js project, same routes, same components — only responsive CSS + a handful of conditionally-rendered mobile components.
- **No design rewrite.** The niklas single-spec discipline in `AGENTS.md` stays locked. One typeface (Inter 400), one size per breakpoint, the same five colors, color does the semantic work.
- **No premature optimization.** Phase 3 measures before fixing. Speculative bundle splitting, SSR streaming, or React Server Components migration is out of scope unless Lighthouse identifies it as a top-3 budget bust.
- **No new pages.** Existing routes only. The deferred `/leaderboard/[tier]` (Task 6.5) and `/me/points` (Task 6.6) are not in this spec.
- **No Clerk live keys, no Sentry DSN swap, no Upstash live binding.** Those are pilot-launch tasks, separately scoped.
- **No A/B testing infrastructure.** Roll out one design, see how it performs in the pilot, iterate after.

---

## 4. Constraints

- Stay on `main`. The project's pattern is direct commits to main; no PR branches.
- Single mobile breakpoint at **720px**, matching the existing `@media (max-width: 720px)` block in `src/app/globals.css`. No tablet-tier breakpoint; iPad-class viewports get the desktop layout.
- Mobile target: **iOS 15+ Safari on iPhone 15 Pro Max** (Tew's device). Android secondary.
- Vercel Hobby plan (no premium features required).
- Lighthouse mobile preset (375 × 667 viewport, 4G throttling, Moto G4 emulation).
- Total work budget: ~1.5 days across all three phases. Phase 1 ~half day, Phase 2 ~half day, Phase 3 measurement + targeted fixes.

---

## 5. Phase 1 — Mobile layout

### 5.1 Strategy

Below 720px, three transforms apply automatically via CSS + a small number of conditional render points:

1. **Header nav collapses to hamburger menu** with slide-down overlay.
2. **All grid-based "tables" become stacked cards** — each row renders as a vertical block with the row's primary label as a heading, secondary info as muted lines, and any actions as full-width tappable rows.
3. **Tap targets enlarge** to minimum 44pt × 44pt.

The 720px breakpoint stays as the single switch. No tablet tier.

### 5.2 Header nav

- **File:** `src/components/Nav.tsx`
- **Today:** Inline links right-aligned: `Tournaments ↓ Leaderboard Sign in`. Wraps + clips below ~430px.
- **After:** Below 720px, render a single `☰` icon button (44pt tap target, top-right). Tapping opens a slide-down overlay with the same nav links stacked vertically (line-height 2.0, full-width tap rows). Tapping outside or a second tap on `☰` closes it.
- **State:** Local `useState` in a new tiny client component `MobileNavToggle.tsx` (the nav itself can stay server-rendered; only the toggle button + overlay needs to be client).
- **Accessibility:** `aria-expanded`, `aria-controls`, `aria-label="Open menu"`. Focus trap inside the overlay when open. `Escape` closes.

### 5.3 Table → card pattern

The pattern applies to every page that currently uses CSS Grid as a faux-table. Implementation:

- Above 720px: keep current `grid-template-columns: …` (unchanged).
- Below 720px: override to `grid-template-columns: 1fr` and rely on stack flow. Each cell within a row becomes a labelled block — the column header from the desktop view becomes a small mute label above each cell, OR the cell is composed into a logical card with hand-picked typography per the per-route designs below.

In practice, the cleanest approach is hand-tuned per route (not a generic CSS toggle) because each table has different "primary info" and "secondary info" — a leaderboard row is rank + name + tier, while a tournament row is name + status + date + host. Generic toggling produces awkward stacks.

**Per-route transformations:**

| Route | Today (desktop grid) | Mobile (card stack) |
|---|---|---|
| `/` landing | "Latest tournaments" table | Stacked tournament cards (same as `/t`) |
| `/t` | 5-col grid: Year · Tournament · Date+format+type+status+tier · Host · arrow | Card: tournament name (bold) + status badge top-right; meta line (year · format · type); meta line (date · host); tier band line; arrow as a footer link |
| `/leaderboard` | 5-col grid: Rank · Player · Tier · Points · Match count | Card: rank (large) + player name + handle; meta line (tier · points · matches) |
| `/c/[slug]` | club roster table | Same pattern: name + tier + arrow |
| `/p/[handle]` | stats grid (2-col on desktop) | Stack to 1-col below 720px (simple) |
| `/match/[id]/submit` | form with side-by-side inputs | Stack inputs full-width, increase input height to 44pt, full-width primary button at bottom |
| `/match/[id]/confirm` | same as submit | same as submit |
| `/c/[slug]/admin/tournaments/[id]/scores` | 5-col grid: # · Status · Teams+Score · Winner · Actions | Card: "# · Team A vs Team B" (bold) + status badge top-right; score line (bold winner); action row (Override / Void as separate `.fn-blue.font-bold` + `.fn-red.font-bold` taps) |

### 5.4 Tap targets

- Minimum 44 × 44pt for any tappable element below 720px.
- Apply via `@media (max-width: 720px)` block on `.arrow`, `.btn-link`, `.action-link` utility classes in `globals.css`.
- Score input cells (`.score-input` in admin scores) bump from current padding to min-height 44pt; font-size stays 18px per the existing mobile spec.
- Hamburger button is 44 × 44pt by default (no scaling needed).

### 5.5 Files affected

- `src/app/globals.css` — add `@media (max-width: 720px)` rules for tap targets + table grid overrides where generic.
- `src/components/Nav.tsx` — refactor to render hamburger toggle + overlay below 720px.
- `src/components/MobileNavToggle.tsx` — new client component (the only new file in Phase 1).
- `src/app/page.tsx` — Latest tournaments section: add mobile card variant.
- `src/app/t/page.tsx` — tournament list table: full card refactor.
- `src/app/leaderboard/page.tsx` — leaderboard table: card variant below 720px.
- `src/app/c/[slug]/page.tsx` — club roster: minor card variant.
- `src/app/p/[handle]/page.tsx` — stats grid: 1-col mobile.
- `src/app/match/[id]/submit/page.tsx` — touch-sized form.
- `src/app/match/[id]/confirm/page.tsx` — touch-sized form.
- `src/app/c/[slug]/admin/tournaments/[id]/scores/page.tsx` (and `AdminScoreTable.tsx`) — full card refactor with action row.

### 5.6 Testing

- **Visual snapshots:** add Playwright screenshot tests at three viewports per affected route: 390 (iPhone 15), 720 (breakpoint boundary), 1024 (desktop). Stored under `tests/e2e/snapshots/mobile/`.
- **Manual:** before merge, every affected route must be hand-tested at 390px viewport in Chrome DevTools device emulation by the implementer.
- **Real device gate:** Tew opens each affected route on his iPhone 15 Pro Max in Safari, confirms no horizontal scroll and all actions tappable.

### 5.7 Out of scope for Phase 1

- Animations / transitions on the nav overlay (instant show/hide is fine for v1).
- Swipe gestures, pull-to-refresh, or any iOS-specific interaction patterns beyond the `Add to Home Screen` flow handled in Phase 2.
- Tablet-tier (720-1024px) breakpoint. iPad gets desktop.

---

## 6. Phase 2 — Install-to-home-screen + cache versioning

### 6.1 Icons

Design three icon files matching the niklas brand language:

- `public/icons/icon-192.png` — 192 × 192, white background, black `P` + pink `#ff4193` `Z` monogram, IBM-Plex-Mono-like geometric letterforms (or render via `@vercel/og` from inline SVG), tight letter-spacing (-3px), centered.
- `public/icons/icon-512.png` — 512 × 512, same composition.
- `public/icons/icon-maskable-512.png` — 512 × 512, same composition but with safe-zone padding (the inner 80% must contain the full mark, since Android masks the outer 20% to round/circle shapes).

iOS-specific (rendered by Next.js automatically when present in `src/app/icon.tsx` or referenced from layout):

- `apple-touch-icon` (180 × 180) — iOS uses this for home-screen icons. Same composition, no safe-zone padding (iOS does its own rounding).
- Splash screens for iPhone 15 Pro Max (1290 × 2796) — optional but improves the launch experience. White background + centered monogram.

Production approach: render via `next/og` `ImageResponse` from a single source SVG to avoid maintaining N raster files. Place generation logic in `src/app/icon.tsx` and `src/app/apple-icon.tsx` (Next.js convention).

### 6.2 Manifest

**File:** `src/app/manifest.ts` (Next.js convention) — exports a `MetadataRoute.Manifest`.

```ts
{
  name: 'Padel-Z',
  short_name: 'Padel-Z',
  description: 'Phuket padel community — tournaments, scores, leaderboard.',
  start_url: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  screenshots: [
    { src: '/screenshots/leaderboard-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Leaderboard' },
    { src: '/screenshots/tournament-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Tournament' },
    { src: '/screenshots/submit-mobile.png', sizes: '1290x2796', type: 'image/png', form_factor: 'narrow', label: 'Submit score' },
  ],
  shortcuts: [
    { name: 'Leaderboard', url: '/leaderboard' },
    { name: 'Tournaments', url: '/t' },
    { name: 'My profile', url: '/me' },
  ],
}
```

Screenshots are real PNGs captured at iPhone 15 Pro Max viewport (after Phase 1 ships, before Phase 2 ships) by running Playwright in mobile mode against the Phase 1 build.

### 6.3 Service worker cache versioning

**File:** `public/sw.js` (or wherever the SW currently lives — verify in implementation).

Today's bug: cache name is a static string. After a new deploy, the SW intercepts requests and serves the stale shell from the old cache.

Fix:

- Generate a build-time constant `BUILD_ID` and inject it into the SW source. Next.js exposes its build ID via `next/build-id` or via reading `.next/BUILD_ID`. Simplest path: a small build step replaces a `__BUILD_ID__` placeholder in `public/sw.js` with the actual Next.js build ID during `next build`. Implement via a `postbuild` npm script that does a `sed` in-place on the deployed SW.
- The SW's cache name becomes `padelz-v${BUILD_ID}`. Each deploy = new cache name.
- On activation, the SW iterates `caches.keys()` and deletes any cache that doesn't match the current `BUILD_ID`. This is the cleanup pass.
- Add `self.skipWaiting()` in the `install` handler and `clients.claim()` in the `activate` handler so the new SW takes control on the user's next page load (no need to close all tabs first).
- Cache strategy stays as it was — likely network-first for HTML, cache-first for static assets. Don't change the strategy in this phase, only the keying.

### 6.4 Real-device gate

Mandatory before Phase 2 is signed off:

1. Open `https://padelz-v1.vercel.app/` in iPhone 15 Pro Max Safari.
2. Tap share → Add to Home Screen → confirm. Icon should be the new monogram, not a default Safari screenshot.
3. Tap the home-screen icon. Launch should be fullscreen — no address bar, no Safari chrome.
4. Navigate to `/leaderboard`. Should render the niklas mobile layout from Phase 1.
5. Trigger a deploy of an unrelated trivial change (e.g., a comment in a CSS file). Wait for Vercel to mark Ready.
6. Reopen the app from the home screen icon. The new build's content must appear on the next page navigation — no manual refresh required.

If any step fails, the gate is open. Phase 2 not done.

### 6.5 Files affected

- `src/app/manifest.ts` — full rewrite per §6.2.
- `src/app/icon.tsx` — new, renders the 192/512 icons via `next/og`.
- `src/app/apple-icon.tsx` — new, renders the 180×180 apple-touch-icon.
- `public/icons/` — generated PNG files (if not using runtime ImageResponse).
- `public/screenshots/` — three mobile screenshots (captured after Phase 1 ships).
- `public/sw.js` — cache versioning refactor.
- `package.json` — add `postbuild` script to inject `BUILD_ID` into SW.

### 6.6 Out of scope for Phase 2

- Custom install-prompt UI (e.g., a banner suggesting "Add to home screen"). Users discover the install flow via Safari's share menu.
- Push notifications (web push requires HTTPS + permission flow + a backend; not a v0.5 requirement).
- Offline support beyond the existing PWA shell caching strategy.

---

## 7. Phase 3 — Speed audit + targeted fixes

### 7.1 Baseline measurement

1. Trigger a fresh Vercel production deploy of `main` (with Phase 1 + 2 merged).
2. Wait for Ready + canonical alias updated.
3. Run Lighthouse CI:
   ```bash
   npx lhci autorun --collect.url=https://padelz-v1.vercel.app/ \
                    --collect.url=https://padelz-v1.vercel.app/leaderboard \
                    --collect.url=https://padelz-v1.vercel.app/t \
                    --collect.url=https://padelz-v1.vercel.app/sign-in \
                    --upload.target=temporary-public-storage
   ```
4. Record FCP, LCP, TBT, CLS, SI, Total Blocking Time, JS bundle size (gzipped) per route. Commit results to `docs/lighthouse-baseline-2026-05-20.md`.

### 7.2 Decision tree

For each route × metric, compare against the budget:

| Metric | Budget | If failing → fix candidates (in order to try) |
|---|---|---|
| FCP | < 1500ms | (1) Reduce JS shipped on initial load — check if Clerk/Sentry are loading on routes that don't need them. (2) Add `revalidate` to server components so Vercel caches the HTML at the edge. (3) Inline critical CSS via `next/font`'s built-in mechanisms. |
| LCP | < 2500ms | (1) If hero text → reduce font payload (already using `next/font/google` with `display: swap`). (2) If a table → enable Edge runtime + ISR for the route. (3) If an image → use `next/image` with priority + correct sizes. |
| TBT | < 200ms | (1) Defer Sentry init via `lazyLoadIntegrations`. (2) Lazy-load Clerk client on routes that aren't behind auth. (3) Audit `'use client'` components — convert to server where the interaction surface allows. |
| CLS | < 0.1 | (1) Reserve space for fonts via `font-display: optional` or pre-defined `aspect-ratio` on font-loaded text containers. (2) Pre-size images. (3) Avoid dynamically inserting nav overlay above existing content (the Phase 1 overlay should use `position: fixed` so it doesn't shift layout). |

Fix only what's red. Re-measure after each fix. Each fix must cite the specific Lighthouse audit it addresses (e.g., "fix LCP-2.8s on /leaderboard by adding `revalidate = 30` to the page").

### 7.3 Verification

- Re-run Lighthouse CI after fixes. All four metrics must be green on all four routes.
- The existing `.github/workflows/ci.yml` Lighthouse job should pass on the next PR / push (it currently exists but has not been run against the prod URL).

### 7.4 Real-device gate

1. Tew opens `padelz-v1.vercel.app/` on iPhone 15 Pro Max over a real Phuket 4G connection (or Chrome DevTools "Fast 3G" emulation if no 4G handy).
2. Time-to-content for `/leaderboard` should feel under 2 seconds.
3. Tapping any link should respond instantly (no perceptible lag while a script blocks the main thread).
4. Scrolling should not jank.

### 7.5 Files likely affected (will firm up after measurement)

Cannot pre-determine. Likely candidates based on a priori knowledge of the codebase:

- `instrumentation-client.ts` — Sentry init, candidate for `lazyLoadIntegrations`.
- `src/middleware.ts` — Clerk middleware, can be scoped narrower.
- `src/app/leaderboard/page.tsx` — add `revalidate = 30`.
- `src/app/t/page.tsx` — add `revalidate = 30`.
- `src/app/page.tsx` — currently `dynamic = 'force-dynamic'`; reconsider once we know what's slow.

### 7.6 Out of scope for Phase 3

- Edge runtime migration (Vercel Edge functions). Only consider if LCP fails by >500ms and the cause is server response time.
- React Server Components Streaming. Only if measurement points to it.
- Code splitting beyond what Next.js does by default.
- Image optimization workflow changes. Padel-Z v0.5 has no large images yet.

---

## 8. Sequencing + dependencies

Strict order — each phase produces an artifact the next phase needs:

1. **Phase 1 (Mobile layout) ships first.** Independent. ~half day.
2. **Phase 2 (PWA + SW versioning) ships next.** Depends on Phase 1 because the manifest's screenshots are captured against the Phase 1 mobile build. ~half day.
3. **Phase 3 (Speed audit) ships last.** Depends on Phases 1 + 2 being merged + deployed because Lighthouse measures the final stack. Measurement first, then targeted fixes scoped by what failed. Variable time — could be 1h if everything's green, 4h+ if there are real budget busts.

Each phase merges to `main` directly per the project pattern.

---

## 9. Risks

- **Phase 1: Per-route hand-tuned mobile layouts could balloon.** Mitigation: cap at the eight routes listed in §5.5. Any new mobile-specific patterns that emerge during implementation become design follow-ups, not in-scope work.
- **Phase 2: Real-device gate fails.** Mitigation: Tew tests on his iPhone before Phase 2 is signed off. If gate fails, iterate within Phase 2 budget; if budget exceeded, surface to Tew for a re-scope.
- **Phase 3: Lighthouse passes but real-device feel is still bad.** Mitigation: real-device gate is qualitative + mandatory. Lighthouse alone isn't a pass criterion; Tew's feel on his iPhone over Phuket 4G is the final gate.
- **Service worker bug regression.** Mitigation: a Playwright smoke test deploys to a Vercel preview, hard-refreshes, opens an incognito tab, verifies the latest commit's content renders. Add to CI before Phase 2 ships.
- **Cache strategy change breaks offline scenarios.** Mitigation: Phase 2 explicitly does not change the cache strategy, only the keying. Offline behavior stays identical to today.

---

## 10. Success criteria

Phase 1 done when:
- Every route in §5.5 renders correctly at 390px with no horizontal scroll, all actions accessible, all data visible.
- Playwright snapshot tests pass at 390 / 720 / 1024 for each.
- Tew confirms on his iPhone 15 Pro Max in Safari.

Phase 2 done when:
- Site installs to iPhone home screen with the new monogram icon.
- Launching from home screen opens fullscreen.
- Each manifest shortcut works.
- A subsequent deploy is picked up automatically on next page load (no user action required).
- All 6 real-device gate steps in §6.4 pass.

Phase 3 done when:
- Lighthouse passes all four budgets (FCP <1500ms, LCP <2500ms, TBT <200ms, CLS <0.1) on all four measured routes.
- Baseline + post-fix Lighthouse results committed to the repo.
- Real-device feel test passes per §7.4.

Whole spec done when all three phases are merged to `main`, deployed, real-device-verified, and the HANDOFF + primer are updated.

---

## 11. References

- AGENTS.md — Padel-Z design language (locked).
- `src/app/globals.css` — current breakpoint at 720px and design tokens.
- Task 1.14 in plan — original PWA scaffolding.
- Task 7.1 in plan — PWA polish.
- Task 7.4 in plan — production performance audit.
- iOS HIG: touch target sizing — 44 × 44pt minimum.
- Apple Web App meta tags — `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`.
- Vercel — Web Vitals, Lighthouse CI.

---

## 12. Open questions

None blocking. Two design follow-ups to address during implementation:

1. **What letterform for the `PZ` monogram?** The design proposal uses tight-tracked geometric forms reminiscent of IBM Plex Mono. Final lockup can be polished by Tew during Phase 2 icon design.
2. **Where does the mobile nav overlay sit in the z-order?** Above the page content but below any modal dialogs. The current codebase has no modal dialogs, so this is theoretical — note it for whenever modals get introduced.

End.
