# Padel-Z MVP Public Beta Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full feature surface required to open Padel-Z to public-beta sign-ups in Phuket, gated behind `NEXT_PUBLIC_BETA_OPEN` until smoke-tested, then flipped via a single env var.

**Architecture:** Three phases (Auth + gate + admin CRUD → Bracket UI → Leaderboard filter + /me/points) that each ship to `origin/main` and auto-deploy. Anonymous visitors see `/coming-soon` until the gate flips. Architecture preserved: new files extend existing patterns, no refactor.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind v4 + Clerk (real, no longer stub) + Drizzle ORM against Neon Postgres + Vitest (unit/integration) + Playwright (E2E) + Upstash Ratelimit + Vercel hosting.

**Spec reference:** `docs/superpowers/specs/2026-05-20-mvp-public-beta-design.md` — every task in this plan implements a section of that spec. If a task and the spec disagree, the spec wins.

**Project conventions reminder (read before each task):**
- This is Next.js 16. APIs differ from Next.js 14/15. Verify async params, middleware, server actions, and revalidatePath against `node_modules/next/dist/...` or current Next.js docs via WebSearch before writing new code.
- Padel-Z design language in `AGENTS.md` is non-negotiable: one font (Inter 400 24px), five colors (`--color-bg`, `--color-fg`, `--color-fg-mute`, `--color-rule`, `--color-pink`), three functional colors (`.fn-red`, `.fn-green`, `.fn-blue`), one button style (`.btn-link`). The `.pink` color is reserved for the `Z` in Padel-Z and the platinum tier label only.
- Mobile (≤720px): use the `desktop-only` / `mobile-only` twin-render pattern from the last mobile-optimization session. Never make a table responsive without a mobile card variant.
- Server actions stay the boundary — never call `db` directly from a page component.
- Commitlint enforces lowercase subject case after `feat(scope):` colon. No em-dashes in commit messages or user-facing copy. The full humanizer rules in `~/.claude/rules/stop-slop-always-on.md` apply.
- `.claude/` is gitignored; never `git add -A` from project root.

---

## Pre-flight

These steps confirm the environment is ready BEFORE any code work begins. If anything here fails, stop and surface to Tew.

- [ ] **Pre-flight Step 1: Tew has set Vercel production env vars**

Verify the following exist in Vercel project `proxyz-s-projects/padelz-v1` → Settings → Environment Variables → Production scope:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (real, starts with `pk_live_…`)
- `CLERK_SECRET_KEY` (real, starts with `sk_live_…`)
- `CLERK_WEBHOOK_SECRET` (real, starts with `whsec_…`)
- `UPSTASH_REDIS_REST_URL` (real Upstash URL, NOT `placeholder`)
- `UPSTASH_REDIS_REST_TOKEN` (real Upstash token, NOT `placeholder_token`)
- `NEXT_PUBLIC_BETA_OPEN=false` (initial value)

If any are missing or contain placeholder values, stop and ask Tew before proceeding.

- [ ] **Pre-flight Step 2: Clerk webhook endpoint configured**

In Clerk dashboard → Webhooks, confirm an endpoint exists for `https://padelz-v1.vercel.app/api/webhook/clerk` subscribed to `user.created`, `user.updated`, `user.deleted`. The signing secret was already captured in step 1.

- [ ] **Pre-flight Step 3: Clean worktree on the target branch**

Run:
```bash
git status
```
Expected: working tree clean (no uncommitted changes). The current branch should be the worktree branch (e.g., `claude/flamboyant-dewdney-545eb9`).

- [ ] **Pre-flight Step 4: Baseline test suite green**

Run:
```bash
npm run test
```
Expected: 240 passing + 1 skipped, 0 failing. If anything is failing, stop and surface — we don't build on red.

```bash
npm run check-types
npm run lint
```
Expected: both clean. No type errors, no lint errors.

- [ ] **Pre-flight Step 5: Read the spec end-to-end before starting**

Read `docs/superpowers/specs/2026-05-20-mvp-public-beta-design.md` in full. Each task in this plan references a spec section; you'll be more accurate if you've held the whole thing in mind once.

---

## Chunk 1: Phase 1 — Auth, gate, and admin tournament CRUD

Implements spec §4. Phase 1 delivers: Clerk middleware turned on, `/coming-soon` holding screen, real rate limiting via Upstash, three new server actions (`publishTournament`, `updateTournament`, `deleteTournament`), shared `TournamentForm` component, and three new admin pages (create, edit, detail). At the end of Phase 1 the site behaves like a real product for signed-in admins, but strangers still see the holding screen.

**File budget for Chunk 1:**

| Path | Status |
|---|---|
| `src/middleware.ts` | CREATE |
| `src/app/coming-soon/page.tsx` | CREATE |
| `src/app/c/[slug]/admin/tournaments/new/page.tsx` | CREATE |
| `src/app/c/[slug]/admin/tournaments/[id]/page.tsx` | CREATE |
| `src/app/c/[slug]/admin/tournaments/[id]/edit/page.tsx` | CREATE |
| `src/features/tournaments/components/TournamentForm.tsx` | CREATE |
| `src/features/tournaments/actions.ts` | MODIFY (append 3 new actions) |
| `src/app/api/webhook/clerk/route.ts` | MODIFY (one rateLimit call) |
| `tests/integration/tournament-actions.test.ts` | MODIFY (append cases for new actions) |
| `tests/integration/middleware.test.ts` | CREATE |
| `tests/integration/clerk-webhook.test.ts` | MODIFY (rate limit cases) |
| `tests/e2e/admin-tournament-crud.spec.ts` | CREATE |
| `tests/e2e/coming-soon.spec.ts` | CREATE |

### Task 1.1: Add coming-soon holding page

**Files:**
- Create: `src/app/coming-soon/page.tsx`
- Create: `tests/e2e/coming-soon.spec.ts`

**Spec reference:** §4.1 item 3.

- [ ] **Step 1: Write the failing E2E test for the coming-soon page**

```ts
// tests/e2e/coming-soon.spec.ts
import { test, expect } from '@playwright/test';

test.describe('/coming-soon', () => {
  test('renders the holding screen with brand line and sign-in link', async ({ page }) => {
    await page.goto('/coming-soon');
    await expect(page.getByText(/Padel-Z/)).toBeVisible();
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
```

- [ ] **Step 2: Run the E2E test, confirm it fails (route does not exist)**

```bash
npm run test:e2e -- tests/e2e/coming-soon.spec.ts
```
Expected: FAIL with 404 or "could not find element".

- [ ] **Step 3: Implement the coming-soon page**

Per AGENTS.md no em-dashes in user-facing copy — use a period or middle dot instead.

```tsx
// src/app/coming-soon/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Opening soon · Padel-Z',
  description: "Phuket's padel community. Opening soon.",
};

export default function ComingSoonPage() {
  return (
    <main className="px-4 pb-8">
      <div style={{ paddingTop: '32vh' }}>
        <p>
          Padel-<span className="pink font-bold">Z</span>. Phuket&apos;s padel community.
        </p>
        <p className="mute">Opening soon.</p>
        <p className="mute" style={{ marginTop: '1em' }}>
          Got an invite link?{' '}
          <Link href="/sign-in">Sign in →</Link>
        </p>
      </div>
    </main>
  );
}
```

The vertical centering uses inline `paddingTop` because we don't want to add a new layout primitive to `globals.css`. If the page needs to coexist with the existing Nav/Footer wrapper from `layout.tsx`, follow the same `<main className="px-4 pb-8">` pattern used by `src/app/page.tsx`.

- [ ] **Step 4: Run the E2E test, confirm it passes**

```bash
npm run test:e2e -- tests/e2e/coming-soon.spec.ts
```
Expected: PASS (both tests).

- [ ] **Step 5: Run check-types and lint**

```bash
npm run check-types && npm run lint
```
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/coming-soon/page.tsx tests/e2e/coming-soon.spec.ts
git commit -m "feat(landing): add coming-soon holding page for beta gate"
```

### Task 1.2: Wire rateLimit() into the Clerk webhook route

**Files:**
- Modify: `src/app/api/webhook/clerk/route.ts`

**Spec reference:** §4.1 item 4 + §2.1.

This task lands BEFORE middleware because the webhook is what populates user/player rows after Clerk signup; we want it rate-limited from the moment middleware turns Clerk on.

**Testing note.** The existing `tests/integration/clerk-webhook.test.ts` exercises `handleClerkEvent()` directly (bypassing the route handler) because the route handler uses `headers()` from `next/headers` which has no implementation in the vitest node environment. Mocking `next/headers` mid-suite is brittle, and the rate-limit guard is a four-line addition with a single clear branch. We rely on the existing integration coverage for `handleClerkEvent` (unchanged) plus the Phase 1 manual smoke (Task 1.12 Step 7) to verify the guard in production. The `rateLimit()` function itself is already tested in `tests/integration/ratelimit.test.ts`.

- [ ] **Step 1: Read the current webhook handler in full**

```bash
cat src/app/api/webhook/clerk/route.ts
```

Confirm the existing structure: it imports `headers` from `next/headers`, awaits `headers()` once into a variable `h`, reads svix headers from `h`, verifies the signature via `Webhook` from `svix`, then invokes `handleClerkEvent`. The new rate-limit call goes BEFORE the svix verification (after the existing `await headers()`) so we don't burn signature verification CPU on a hammered IP.

- [ ] **Step 2: Confirm rateLimit signature and webhook kind**

Open `src/libs/RateLimit.ts` and confirm the signature is `rateLimit(identifier: string, kind: RateLimitKind)`. The `webhook` kind is wired at 100/60s (line 36 of `RateLimit.ts`).

- [ ] **Step 3: Add rateLimit import to the existing import block**

Locate the existing `import { headers } from 'next/headers';` line in `src/app/api/webhook/clerk/route.ts` and add a new import alongside it (do NOT duplicate the `headers` import):

```ts
import { rateLimit } from '@/libs/RateLimit';
```

- [ ] **Step 4: Insert the rate-limit guard at the right point**

The existing `POST` handler already declares `const h = await headers();` near the top. **Reuse this variable** — do not add another `await headers()` call. Immediately after the existing `headers()` line and BEFORE the svix-signature verification block, insert:

```ts
const ip = h.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
const limit = await rateLimit(ip, 'webhook');
if (!limit.success) {
  return new Response('rate limited', {
    status: 429,
    headers: {
      'Retry-After': String(Math.ceil((limit.reset - Date.now()) / 1000)),
    },
  });
}
```

If the existing route already extracts `ip` for any reason, reuse that variable too.

- [ ] **Step 5: Run check-types and lint**

```bash
npm run check-types && npm run lint
```
Expected: clean. No type errors.

- [ ] **Step 6: Run the full test suite to verify no regression**

```bash
npm run test && npm run test:integration
```
Expected: all green. The existing webhook tests (which call `handleClerkEvent` directly, not the route handler) are unaffected by the route-level addition.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/webhook/clerk/route.ts
git commit -m "feat(auth): rate-limit clerk webhook by client ip"
```

### Task 1.3: Add Clerk middleware with beta gate

**Files:**
- Create: `src/middleware.ts`
- Create: `tests/integration/middleware.test.ts`

**Spec reference:** §3.2 anchor 1, §4.1 item 2.

This task turns Clerk ON for the whole app. It is the most behavior-changing change in the plan. Test against `NEXT_PUBLIC_BETA_OPEN=false` (anonymous visitors get redirected) AND `=true` (anonymous visitors land normally).

- [ ] **Step 1: Check Next.js 16 middleware contract**

Next.js 16 uses `clerkMiddleware()` from `@clerk/nextjs/server` (already a dependency, ^6.39.3). Verify the contract: it returns a Next.js middleware function, supports `auth.protect()`, and accepts a callback that runs after Clerk's resolution. Confirm via WebSearch ("Clerk middleware Next.js 16 site:clerk.com") or `node_modules/@clerk/nextjs/dist/`.

Reference the existing Clerk webhook route (`src/app/api/webhook/clerk/route.ts`) to confirm the auth imports already work.

- [ ] **Step 2: Write failing test — beta-gate redirect (with `clerkMiddleware` mocked)**

The challenge: `clerkMiddleware` from `@clerk/nextjs/server` tries to authenticate against Clerk's FAPI on every invocation. In vitest without a real Clerk dev key + session, it errors. We test only the beta-gate redirect logic by mocking `clerkMiddleware` to a pass-through that immediately invokes our callback with a stub `auth()` (returning `userId: null` for anonymous).

Create `tests/integration/middleware.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock clerkMiddleware to a pass-through that calls our callback with a stub auth().
// This isolates the beta-gate redirect logic from Clerk's FAPI call.
vi.mock('@clerk/nextjs/server', async () => {
  const actual = await vi.importActual<typeof import('@clerk/nextjs/server')>('@clerk/nextjs/server');
  return {
    ...actual,
    clerkMiddleware: (handler: (auth: () => Promise<{ userId: string | null }>, req: NextRequest) => Promise<NextResponse | void>) => {
      return async (req: NextRequest) => {
        const stubAuth = Object.assign(
          async () => ({ userId: null }),
          { protect: async () => {} },
        );
        const r = await handler(stubAuth as never, req);
        return r ?? NextResponse.next();
      };
    },
  };
});

describe('middleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects anonymous visitors at / to /coming-soon when NEXT_PUBLIC_BETA_OPEN=false', async () => {
    vi.stubEnv('NEXT_PUBLIC_BETA_OPEN', 'false');
    const { default: middleware } = await import('@/middleware');
    const req = new NextRequest('http://localhost/');
    const res = await middleware(req, {} as never);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/coming-soon');
  });

  it('allows anonymous visitors through at / when NEXT_PUBLIC_BETA_OPEN=true', async () => {
    vi.stubEnv('NEXT_PUBLIC_BETA_OPEN', 'true');
    const { default: middleware } = await import('@/middleware');
    const req = new NextRequest('http://localhost/');
    const res = await middleware(req, {} as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets public routes pass even when gate is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_BETA_OPEN', 'false');
    const { default: middleware } = await import('@/middleware');
    for (const path of ['/leaderboard', '/t', '/t/saturday-open', '/p/somebody', '/sign-in', '/coming-soon']) {
      const req = new NextRequest(`http://localhost${path}`);
      const res = await middleware(req, {} as never);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  });
});
```

If the existing `tests/integration/setup.ts` already stubs Clerk env vars (most repos do for the test runner), the additional `vi.stubEnv` calls above are sufficient. If not, add `vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_…')` and `vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_…')` in the global `beforeEach`. Read `tests/integration/setup.ts` first to see what's already there.

- [ ] **Step 3: Run the failing test**

```bash
npm run test:integration -- middleware
```
Expected: FAIL (middleware doesn't exist).

- [ ] **Step 4: Implement `src/middleware.ts`**

```ts
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/c/(.*)/admin(.*)',
  '/match/(.*)/(submit|confirm)',
  '/me(.*)',
]);

const isPublicLanding = createRouteMatcher(['/']);

export default clerkMiddleware(async (auth, req) => {
  // Beta gate: anonymous visitors at / when gate is closed
  if (isPublicLanding(req)) {
    const { userId } = await auth();
    if (!userId && process.env.NEXT_PUBLIC_BETA_OPEN !== 'true') {
      const url = req.nextUrl.clone();
      url.pathname = '/coming-soon';
      return NextResponse.redirect(url);
    }
  }

  // Auth gate: protected routes require sign-in
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals + all static files unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
```

- [ ] **Step 5: Run the test, confirm it passes**

```bash
npm run test:integration -- middleware
```
Expected: PASS.

- [ ] **Step 6: Run the FULL integration + unit suite to verify no regressions**

```bash
npm run test && npm run test:integration
```
Expected: all green. The existing tests may need to set `NEXT_PUBLIC_BETA_OPEN=true` in their env if they hit `/` directly; check `tests/integration/setup.ts`. If a regression appears, the fix is to add the env stub in setup, not to weaken the middleware logic.

- [ ] **Step 7: Run check-types and lint**

```bash
npm run check-types && npm run lint
```
Expected: clean.

- [ ] **Step 8: Add E2E smoke for the gate behavior**

Append to `tests/e2e/coming-soon.spec.ts`:

```ts
test('anonymous visitor at / is redirected to /coming-soon (gate off)', async ({ page }) => {
  // This test relies on the test env having NEXT_PUBLIC_BETA_OPEN=false
  await page.goto('/');
  await expect(page).toHaveURL(/coming-soon/);
});

test('public routes remain reachable', async ({ page }) => {
  for (const path of ['/leaderboard', '/t', '/sign-in']) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/coming-soon/);
  }
});
```

If the Playwright config doesn't currently set `NEXT_PUBLIC_BETA_OPEN=false`, that's part of the smoke setup. Check `playwright.config.ts` and add the env stub there if needed.

- [ ] **Step 9: Run E2E to verify gate behavior**

```bash
npm run test:e2e -- coming-soon
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/middleware.ts tests/integration/middleware.test.ts tests/e2e/coming-soon.spec.ts
git commit -m "feat(auth): clerk middleware with beta gate"
```

### Task 1.4: Add publishTournament server action

**Files:**
- Modify: `src/features/tournaments/actions.ts` (extend imports + append publishTournament action)
- Modify: `tests/integration/tournament-actions.test.ts` (append publishTournament test block)

**Spec reference:** §3.2 anchor 2, §4.1 item 5 (publishTournament bullet).

- [ ] **Step 1: Re-read the existing action conventions**

Read `src/features/tournaments/actions.ts` lines 59 to 137 (`createTournament`) and lines 316 to 470 (`generateBracket`) for the `Result<T>` shape, the `clerkUserId?` optional test-injection parameter, the Zod schema pattern, and the revalidatePath try/catch wrapper. New actions must match this style exactly.

Read `src/libs/Authz.ts` to confirm `assertClubAdmin(userId: string, clubId: string): Promise<void>` exists. We use this helper for new actions (existing actions use inline queries; we don't refactor them).

- [ ] **Step 1b: Extend the top-of-file imports**

ES modules require all imports at the top of the file. Edit the existing import block in `src/features/tournaments/actions.ts` (lines 1 to 24) to add:

1. To the Schema import (currently imports `brackets, club_memberships, matches, players, registrations, tournaments, users`):
   - Add `clubs` to the list (used by `publishTournament` and `deleteTournament` for slug revalidation)

2. New named import below the existing Authz-free imports:
   ```ts
   import { assertClubAdmin, ForbiddenError } from '@/libs/Authz';
   ```

3. From `drizzle-orm`, ensure `sql` is in the import set (used by `updateTournament` and `deleteTournament` for the count query). The existing import is `import { and, eq } from 'drizzle-orm';` — change to `import { and, eq, sql } from 'drizzle-orm';`.

Do all three import edits in this step; subsequent tasks (1.5, 1.6) reference these imports without re-adding them.

- [ ] **Step 2: Write failing tests for publishTournament**

Append to `tests/integration/tournament-actions.test.ts`:

```ts
import {
  createTournament,
  publishTournament,
  registerForTournament,
} from '@/features/tournaments/actions';

describe('publishTournament', () => {
  it('club admin transitions draft → open', async () => {
    const clerkId = `c-pub-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `pub-${clerkId.slice(-8)}`, name: 'Pub Test' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: u.id, club_id: c.id, role: 'admin' });

    const created = await createTournament(
      {
        club_id: c.id,
        name: 'Sat Open',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );
    if (!created.success) throw new Error('setup failed');

    const r = await publishTournament(
      { tournament_id: created.data.tournament_id },
      clerkId,
    );

    expect(r.success).toBe(true);

    const [t] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, created.data.tournament_id));
    expect(t.status).toBe('open');
  });

  it('returns INVALID_STATUS when called on a tournament not in draft', async () => {
    // Setup an "open" tournament and try to publish it again
    const clerkId = `c-pub2-${uuidv7().slice(0, 8)}`;
    const [u] = await db
      .insert(users)
      .values({ clerk_id: clerkId, email: `${clerkId}@x` })
      .returning();
    const [c] = await db
      .insert(clubs)
      .values({ slug: `pub2-${clerkId.slice(-8)}`, name: 'Pub2 Test' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db
      .insert(tournaments)
      .values({
        slug: `already-open-${clerkId.slice(-8)}`,
        club_id: c.id,
        name: 'Already Open',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000),
        status: 'open',
        created_by: u.id,
      })
      .returning();

    const r = await publishTournament({ tournament_id: t.id }, clerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('returns FORBIDDEN for non-admin caller', async () => {
    const adminClerkId = `c-pub3a-${uuidv7().slice(0, 8)}`;
    const otherClerkId = `c-pub3b-${uuidv7().slice(0, 8)}`;
    const [admin] = await db
      .insert(users)
      .values({ clerk_id: adminClerkId, email: `${adminClerkId}@x` })
      .returning();
    await db
      .insert(users)
      .values({ clerk_id: otherClerkId, email: `${otherClerkId}@x` });
    const [c] = await db
      .insert(clubs)
      .values({ slug: `pub3-${otherClerkId.slice(-8)}`, name: 'Pub3 Test' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: admin.id, club_id: c.id, role: 'admin' });
    const [t] = await db
      .insert(tournaments)
      .values({
        slug: `t-pub3-${otherClerkId.slice(-8)}`,
        club_id: c.id,
        name: 'Draft Tournament',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000),
        status: 'draft',
        created_by: admin.id,
      })
      .returning();

    const r = await publishTournament({ tournament_id: t.id }, otherClerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 3: Run the failing tests**

```bash
npm run test:integration -- tournament-actions
```
Expected: FAIL (publishTournament is not exported).

- [ ] **Step 4: Implement publishTournament in actions.ts**

Append to `src/features/tournaments/actions.ts` (after `createTournament`, before `registerForTournament`). Do NOT add an import statement here — imports were already added in Step 1b above.

```ts
// ── publishTournament ────────────────────────────────────────────────────────

const PublishSchema = z.object({ tournament_id: z.string().uuid() });

/**
 * Transition a tournament from 'draft' to 'open'. Once 'open', players can
 * register and the tournament is visible on the public /t list. Requires the
 * caller to be a club admin.
 */
export async function publishTournament(
  input: z.input<typeof PublishSchema>,
  clerkUserId?: string,
): Promise<Result<{ tournament_id: string }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in required' },
    };
  }

  const parsed = PublishSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'VALIDATION', message: parsed.error.message },
    };
  }

  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.clerk_id, userId))
    .limit(1);
  if (!u) {
    return {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'User not synced' },
    };
  }

  const [t] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, parsed.data.tournament_id))
    .limit(1);
  if (!t) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Tournament not found' },
    };
  }

  try {
    await assertClubAdmin(u.id, t.club_id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return {
        success: false,
        error: { code: 'FORBIDDEN', message: err.message },
      };
    }
    throw err;
  }

  if (t.status !== 'draft') {
    return {
      success: false,
      error: {
        code: 'INVALID_STATUS',
        message: 'Only draft tournaments can be published',
      },
    };
  }

  await db
    .update(tournaments)
    .set({ status: 'open' })
    .where(eq(tournaments.id, t.id));

  try {
    revalidatePath('/t');
    revalidatePath(`/t/${t.slug}`);
  } catch {
    // outside request scope
  }

  return { success: true, data: { tournament_id: t.id } };
}
```

The admin detail page revalidates on its own redirect after the action returns. We only revalidate the public-facing paths (`/t` and `/t/[slug]`) here because those are the visibility-changing ones.

- [ ] **Step 5: Run the tests, confirm they pass**

```bash
npm run test:integration -- tournament-actions
```
Expected: 3 new tests PASS.

- [ ] **Step 6: Full test suite + type check**

```bash
npm run test && npm run test:integration && npm run check-types && npm run lint
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/features/tournaments/actions.ts tests/integration/tournament-actions.test.ts
git commit -m "feat(tournaments): publishTournament action draft to open"
```

### Task 1.5: Add updateTournament server action

**Files:**
- Modify: `src/features/tournaments/actions.ts` (append updateTournament)
- Modify: `tests/integration/tournament-actions.test.ts` (append updateTournament test block)

**Spec reference:** §4.1 item 5 (updateTournament bullet).

- [ ] **Step 1: Write failing tests for updateTournament**

Append to `tests/integration/tournament-actions.test.ts`:

```ts
describe('updateTournament', () => {
  it('club admin can edit name + start_at when status is draft or open and no matches exist', async () => {
    // Create draft tournament via createTournament
    const clerkId = `c-upd-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `upd-${clerkId.slice(-8)}`, name: 'Upd' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const created = await createTournament(
      {
        club_id: c.id,
        name: 'Original',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );
    if (!created.success) throw new Error('setup');

    const newStart = new Date(Date.now() + 172_800_000).toISOString();
    const r = await updateTournament(
      {
        tournament_id: created.data.tournament_id,
        name: 'Renamed',
        format: 'americano',
        tournament_type: 'open',
        start_at: newStart,
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );

    expect(r.success).toBe(true);
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, created.data.tournament_id));
    expect(t.name).toBe('Renamed');
    expect(t.format).toBe('americano');
  });

  it('returns INVALID_STATUS when tournament is in_progress', async () => {
    // Setup tournament with status=in_progress
    const clerkId = `c-upd2-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `upd2-${clerkId.slice(-8)}`, name: 'Upd2' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db.insert(tournaments).values({
      slug: `t-upd2-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'Locked',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'in_progress',
      created_by: u.id,
    }).returning();

    const r = await updateTournament(
      {
        tournament_id: t.id,
        name: 'Try Rename',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('returns INVALID_STATUS when tournament has matches', async () => {
    const clerkId = `c-upd3-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `upd3-${clerkId.slice(-8)}`, name: 'Upd3' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db.insert(tournaments).values({
      slug: `t-upd3-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'Has Matches',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'open',
      created_by: u.id,
    }).returning();
    const [p1] = await db.insert(players).values({ user_id: u.id, handle: `p1-${clerkId.slice(-8)}`, display_name: 'P1', tier: 'bronze' }).returning();
    await db.insert(matches).values({
      tournament_id: t.id,
      team_a: [p1.id],
      team_b: [p1.id],
      status: 'scheduled',
    });

    const r = await updateTournament(
      {
        tournament_id: t.id,
        name: 'Rename Anyway',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      clerkId,
    );

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('returns FORBIDDEN for non-admin', async () => {
    const adminClerkId = `c-upd4a-${uuidv7().slice(0, 8)}`;
    const otherClerkId = `c-upd4b-${uuidv7().slice(0, 8)}`;
    const [admin] = await db
      .insert(users)
      .values({ clerk_id: adminClerkId, email: `${adminClerkId}@x` })
      .returning();
    await db
      .insert(users)
      .values({ clerk_id: otherClerkId, email: `${otherClerkId}@x` });
    const [c] = await db
      .insert(clubs)
      .values({ slug: `upd4-${otherClerkId.slice(-8)}`, name: 'Upd4' })
      .returning();
    await db
      .insert(club_memberships)
      .values({ user_id: admin.id, club_id: c.id, role: 'admin' });
    const [t] = await db
      .insert(tournaments)
      .values({
        slug: `t-upd4-${otherClerkId.slice(-8)}`,
        club_id: c.id,
        name: 'Draft',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000),
        status: 'draft',
        created_by: admin.id,
      })
      .returning();

    const r = await updateTournament(
      {
        tournament_id: t.id,
        name: 'Attempt',
        format: 'round_robin',
        tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(),
        tier_min: null,
        tier_max: null,
      },
      otherClerkId,
    );

    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:integration -- tournament-actions
```
Expected: FAIL.

- [ ] **Step 3: Implement updateTournament**

Append to `src/features/tournaments/actions.ts`:

```ts
// ── updateTournament ─────────────────────────────────────────────────────────

const UpdateSchema = z.object({
  tournament_id: z.string().uuid(),
  name: z.string().min(3).max(120),
  format: z.enum(['americano', 'mexicano', 'round_robin', 'bracket']),
  tournament_type: z.enum(['open', 'club_internal', 'group', 'casual']),
  start_at: z.string().datetime(),
  tier_min: z.enum(TIERS).nullable(),
  tier_max: z.enum(TIERS).nullable(),
});

/**
 * Edit tournament metadata. Allowed only when status ∈ {draft, open} AND
 * zero rows in matches table for this tournament. Requires club admin.
 */
export async function updateTournament(
  input: z.input<typeof UpdateSchema>,
  clerkUserId?: string,
): Promise<Result<{ tournament_id: string }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required' } };
  }

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };
  }

  const [u] = await db.select().from(users).where(eq(users.clerk_id, userId)).limit(1);
  if (!u) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: 'User not synced' } };
  }

  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, parsed.data.tournament_id)).limit(1);
  if (!t) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Tournament not found' } };
  }

  try {
    await assertClubAdmin(u.id, t.club_id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { success: false, error: { code: 'FORBIDDEN', message: err.message } };
    }
    throw err;
  }

  if (t.status !== 'draft' && t.status !== 'open') {
    return { success: false, error: { code: 'INVALID_STATUS', message: 'Edit only allowed for draft or open tournaments' } };
  }

  // Zero rows in matches table for this tournament
  const [{ value: matchCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.tournament_id, t.id));
  if (matchCount > 0) {
    return { success: false, error: { code: 'INVALID_STATUS', message: 'Cannot edit a tournament with matches recorded' } };
  }

  // Validate tier band
  if (
    parsed.data.tier_min &&
    parsed.data.tier_max &&
    TIER_TO_INT[parsed.data.tier_min] > TIER_TO_INT[parsed.data.tier_max]
  ) {
    return { success: false, error: { code: 'VALIDATION', message: 'tier_min must be at or below tier_max' } };
  }

  await db
    .update(tournaments)
    .set({
      name: parsed.data.name,
      format: parsed.data.format,
      tournament_type: parsed.data.tournament_type,
      start_at: new Date(parsed.data.start_at),
      tier_min: parsed.data.tier_min,
      tier_max: parsed.data.tier_max,
    })
    .where(eq(tournaments.id, t.id));

  try {
    revalidatePath('/t');
    revalidatePath(`/t/${t.slug}`);
  } catch {}

  return { success: true, data: { tournament_id: t.id } };
}
```

Note: the `sql<number>count(*)::int` pattern is used here AND in `deleteTournament` (Task 1.6) for consistency. The `sql` import was added in Task 1.4 Step 1b.

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test:integration -- tournament-actions
```
Expected: PASS.

- [ ] **Step 5: Full validation**

```bash
npm run test && npm run test:integration && npm run check-types && npm run lint
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/features/tournaments/actions.ts tests/integration/tournament-actions.test.ts
git commit -m "feat(tournaments): updateTournament action for draft and open edits"
```

### Task 1.6: Add deleteTournament server action

**Files:**
- Modify: `src/features/tournaments/actions.ts` (append deleteTournament)
- Modify: `tests/integration/tournament-actions.test.ts`

**Spec reference:** §4.1 item 5 (deleteTournament bullet).

- [ ] **Step 1: Write 4 failing tests**

Append to `tests/integration/tournament-actions.test.ts`:

```ts
describe('deleteTournament', () => {
  it('club admin deletes a draft tournament', async () => {
    const clerkId = `c-del-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `del-${clerkId.slice(-8)}`, name: 'Del' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db.insert(tournaments).values({
      slug: `t-del-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'Draft',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'draft',
      created_by: u.id,
    }).returning();

    const r = await deleteTournament({ tournament_id: t.id }, clerkId);
    expect(r.success).toBe(true);

    const after = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(after.length).toBe(0);
  });

  it('returns INVALID_STATUS when tournament is in_progress', async () => {
    const clerkId = `c-del2-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `del2-${clerkId.slice(-8)}`, name: 'Del2' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db.insert(tournaments).values({
      slug: `t-del2-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'Locked',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'in_progress',
      created_by: u.id,
    }).returning();

    const r = await deleteTournament({ tournament_id: t.id }, clerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('returns HAS_MATCHES when tournament has matches', async () => {
    const clerkId = `c-del3-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [c] = await db.insert(clubs).values({ slug: `del3-${clerkId.slice(-8)}`, name: 'Del3' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });
    const [t] = await db.insert(tournaments).values({
      slug: `t-del3-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'Has Matches',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'open',
      created_by: u.id,
    }).returning();
    const [p1] = await db.insert(players).values({ user_id: u.id, handle: `p1-${clerkId.slice(-8)}`, display_name: 'P1', tier: 'bronze' }).returning();
    await db.insert(matches).values({
      tournament_id: t.id,
      team_a: [p1.id],
      team_b: [p1.id],
      status: 'scheduled',
    });

    const r = await deleteTournament({ tournament_id: t.id }, clerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('HAS_MATCHES');
  });

  it('returns FORBIDDEN for non-admin', async () => {
    const adminClerkId = `c-del4a-${uuidv7().slice(0, 8)}`;
    const otherClerkId = `c-del4b-${uuidv7().slice(0, 8)}`;
    const [admin] = await db.insert(users).values({ clerk_id: adminClerkId, email: `${adminClerkId}@x` }).returning();
    await db.insert(users).values({ clerk_id: otherClerkId, email: `${otherClerkId}@x` });
    const [c] = await db.insert(clubs).values({ slug: `del4-${otherClerkId.slice(-8)}`, name: 'Del4' }).returning();
    await db.insert(club_memberships).values({ user_id: admin.id, club_id: c.id, role: 'admin' });
    const [t] = await db.insert(tournaments).values({
      slug: `t-del4-${otherClerkId.slice(-8)}`,
      club_id: c.id,
      name: 'Locked from others',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 86_400_000),
      status: 'draft',
      created_by: admin.id,
    }).returning();

    const r = await deleteTournament({ tournament_id: t.id }, otherClerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('FORBIDDEN');
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run test:integration -- tournament-actions
```
Expected: FAIL.

- [ ] **Step 3: Implement deleteTournament**

```ts
// ── deleteTournament ─────────────────────────────────────────────────────────

const DeleteSchema = z.object({ tournament_id: z.string().uuid() });

/**
 * Drop a tournament. Allowed only when status ∈ {draft, open} AND zero rows
 * in the matches table for this tournament. FK cascade clears registrations
 * and brackets rows. Requires club admin.
 */
export async function deleteTournament(
  input: z.input<typeof DeleteSchema>,
  clerkUserId?: string,
): Promise<Result<{ deleted: true }>> {
  const userId = clerkUserId ?? (await auth()).userId;
  if (!userId) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required' } };
  }

  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };
  }

  const [u] = await db.select().from(users).where(eq(users.clerk_id, userId)).limit(1);
  if (!u) {
    return { success: false, error: { code: 'UNAUTHORIZED', message: 'User not synced' } };
  }

  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, parsed.data.tournament_id)).limit(1);
  if (!t) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Tournament not found' } };
  }

  try {
    await assertClubAdmin(u.id, t.club_id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { success: false, error: { code: 'FORBIDDEN', message: err.message } };
    }
    throw err;
  }

  if (t.status !== 'draft' && t.status !== 'open') {
    return { success: false, error: { code: 'INVALID_STATUS', message: 'Delete only allowed for draft or open tournaments' } };
  }

  const [{ value: matchCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.tournament_id, t.id));
  if (matchCount > 0) {
    return { success: false, error: { code: 'HAS_MATCHES', message: 'Cannot delete a tournament with matches recorded' } };
  }

  // Look up club slug BEFORE deleting (FK cascade clears related rows but we need the slug for revalidate)
  const [club] = await db.select({ slug: clubs.slug }).from(clubs).where(eq(clubs.id, t.club_id)).limit(1);

  await db.delete(tournaments).where(eq(tournaments.id, t.id));

  try {
    revalidatePath('/t');
    if (club) revalidatePath(`/c/${club.slug}`);
  } catch {}

  return { success: true, data: { deleted: true } };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test:integration -- tournament-actions
```
Expected: 4 new tests PASS.

- [ ] **Step 5: Full validation**

```bash
npm run test && npm run test:integration && npm run check-types && npm run lint
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/features/tournaments/actions.ts tests/integration/tournament-actions.test.ts
git commit -m "feat(tournaments): deleteTournament action with status and matches guards"
```

### Task 1.7: Build TournamentForm shared component

**Files:**
- Create: `src/features/tournaments/components/TournamentForm.tsx`

**Spec reference:** §4.1 item 5 (TournamentForm bullet).

This component is rendered by both the `/new` page (create) and the `/edit` page (edit). It's a server component that posts to a server action passed in as a prop.

- [ ] **Step 1: Review the existing form patterns**

The repo doesn't have many server-action-driven forms; the closest are in `src/features/scoring/components/`. Inspect one or two to confirm:
- How `action={someServerAction}` is wired
- How errors are surfaced (likely via `redirect` with a query param)
- AGENTS.md styling: `.score-input` for fields, `.btn-link` for buttons, native HTML form

If the existing pattern uses a `<form action={action}>` directly with `formData` extraction, follow that. If it uses `useFormState` (React 19), use that instead.

- [ ] **Step 2: Implement the form component**

```tsx
// src/features/tournaments/components/TournamentForm.tsx
import { TIERS, type Tier } from '@/features/profiles/types';

type Mode = 'create' | 'edit';

type Props = {
  mode: Mode;
  action: (formData: FormData) => Promise<void> | void;
  initial?: {
    name: string;
    format: 'americano' | 'mexicano' | 'round_robin' | 'bracket';
    tournament_type: 'open' | 'club_internal' | 'group' | 'casual';
    start_at: string; // ISO; render as datetime-local
    tier_min: Tier | null;
    tier_max: Tier | null;
  };
  clubId?: string; // required when mode='create'
  tournamentId?: string; // required when mode='edit'
  error?: string;
};

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TournamentForm({ mode, action, initial, clubId, tournamentId, error }: Props) {
  return (
    <form action={action}>
      {clubId ? <input type="hidden" name="club_id" value={clubId} /> : null}
      {tournamentId ? <input type="hidden" name="tournament_id" value={tournamentId} /> : null}

      {error ? <p className="fn-red font-bold" style={{ marginBottom: '1em' }}>{error}</p> : null}

      <p className="mute">Name</p>
      <input
        className="score-input"
        type="text"
        name="name"
        defaultValue={initial?.name ?? ''}
        required
        minLength={3}
        maxLength={120}
      />

      <p className="mute" style={{ marginTop: '1em' }}>Format</p>
      <select className="score-input" name="format" defaultValue={initial?.format ?? 'round_robin'} required>
        <option value="round_robin">round robin</option>
        <option value="americano">americano</option>
        <option value="mexicano">mexicano</option>
        <option value="bracket">bracket</option>
      </select>

      <p className="mute" style={{ marginTop: '1em' }}>Type</p>
      <select className="score-input" name="tournament_type" defaultValue={initial?.tournament_type ?? 'open'} required>
        <option value="open">open</option>
        <option value="club_internal">club internal</option>
        <option value="group">group</option>
        <option value="casual">casual</option>
      </select>

      <p className="mute" style={{ marginTop: '1em' }}>Start</p>
      <input
        className="score-input"
        type="datetime-local"
        name="start_at"
        defaultValue={initial ? isoToLocal(initial.start_at) : ''}
        required
      />

      <p className="mute" style={{ marginTop: '1em' }}>Tier min (optional)</p>
      <select className="score-input" name="tier_min" defaultValue={initial?.tier_min ?? ''}>
        <option value="">any</option>
        {TIERS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <p className="mute" style={{ marginTop: '1em' }}>Tier max (optional)</p>
      <select className="score-input" name="tier_max" defaultValue={initial?.tier_max ?? ''}>
        <option value="">any</option>
        {TIERS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <div style={{ marginTop: '2em' }}>
        <button type="submit" className="btn-link fn-green font-bold">
          {mode === 'create' ? 'Create →' : 'Save →'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Run check-types**

```bash
npm run check-types
```
Expected: clean.

- [ ] **Step 4: Commit (no tests yet — tested via the page-level tests below)**

```bash
git add src/features/tournaments/components/TournamentForm.tsx
git commit -m "feat(tournaments): shared form for create and edit"
```

### Task 1.8: Build /c/[slug]/admin/tournaments/new page

**Files:**
- Create: `src/app/c/[slug]/admin/tournaments/new/page.tsx`

**Spec reference:** §4.1 item 5 (new page bullet) + §4.2 auth model.

- [ ] **Step 1: Read the existing admin scores page for the auth pattern**

```bash
cat src/app/c/[slug]/admin/tournaments/[id]/scores/page.tsx | head -80
```
Note: how it resolves `auth()`, looks up the user row, calls `assertClubAdmin`, and 404s on failure. Match this exact pattern.

- [ ] **Step 2: Implement the page**

```tsx
// src/app/c/[slug]/admin/tournaments/new/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/libs/DB';
import { clubs, users } from '@/models/Schema';
import { assertClubAdmin } from '@/libs/Authz';
import { createTournament } from '@/features/tournaments/actions';
import { TournamentForm } from '@/features/tournaments/components/TournamentForm';

// All admin pages must be request-dynamic — auth() reads cookies + headers
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string }>;

export default async function NewTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const { userId: clerkId } = await auth();
  if (!clerkId) notFound();

  const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
  if (!u) notFound();

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) notFound();

  try {
    await assertClubAdmin(u.id, club.id);
  } catch {
    notFound();
  }

  async function action(formData: FormData) {
    'use server';
    const r = await createTournament({
      club_id: club.id,
      name: String(formData.get('name')),
      format: String(formData.get('format')) as 'americano' | 'mexicano' | 'round_robin' | 'bracket',
      tournament_type: String(formData.get('tournament_type')) as 'open' | 'club_internal' | 'group' | 'casual',
      start_at: new Date(String(formData.get('start_at'))).toISOString(),
      tier_min: (String(formData.get('tier_min') ?? '') || null) as 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | null,
      tier_max: (String(formData.get('tier_max') ?? '') || null) as 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | null,
    });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/new?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}/admin/tournaments/${r.data.tournament_id}`);
  }

  return (
    <main className="px-4 pb-8">
      <p>
        <a href={`/c/${slug}`} className="mute">← {club.name}</a>
      </p>
      <p style={{ marginTop: '0.5em' }}>New tournament</p>
      <p className="mute">Lands as draft. Publish from the next screen.</p>
      <hr className="rule" style={{ margin: '1.5em 0' }} />
      <TournamentForm mode="create" action={action} clubId={club.id} error={error} />
    </main>
  );
}
```

Note on Next.js 16: `params` and `searchParams` are async (Promises). Always `await` them at the top of the component. The `'use server'` inline action must be inside an async function body or a separate file; the pattern above works for server components.

- [ ] **Step 3: Run check-types**

```bash
npm run check-types
```
Expected: clean.

- [ ] **Step 4: Manual smoke check (optional during plan execution)**

This page becomes meaningfully testable via the E2E test in Task 1.12. For now confirm build is clean:

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/c/[slug]/admin/tournaments/new/page.tsx
git commit -m "feat(admin): tournament create page wired to createTournament action"
```

### Task 1.9: Build /c/[slug]/admin/tournaments/[id] detail page

**Files:**
- Create: `src/app/c/[slug]/admin/tournaments/[id]/page.tsx`

**Spec reference:** §4.1 item 5 (admin home for one tournament).

This is the busiest page in Phase 1. It shows tournament info, registered players, status, AND conditional action buttons across all five statuses (`draft`, `open`-with-bracket-ready, `open`-without-enough-players, `in_progress`, `complete`).

- [ ] **Step 1: Sketch the conditional button matrix as a helper function (locally)**

The matrix from spec §4.1 item 5 in code form:

```ts
function getActions(status: 'draft' | 'open' | 'in_progress' | 'complete', registeredCount: number, matchCount: number) {
  if (status === 'draft') return ['publish', 'edit', 'delete'] as const;
  if (status === 'open') {
    const can = registeredCount >= 2 ? ['generate-bracket'] : [];
    const matchesGate = matchCount === 0 ? ['delete'] : [];
    return [...can, 'edit', ...matchesGate] as const;
  }
  if (status === 'in_progress') return ['view-bracket', 'manage-scores'] as const;
  return [] as const; // complete
}
```

Phase 2 wires the 'generate-bracket' and 'view-bracket' buttons; Phase 1 only renders them as visible links to the (not-yet-existing) preview/view URLs.

- [ ] **Step 2: Implement the page**

```tsx
// src/app/c/[slug]/admin/tournaments/[id]/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/libs/DB';
import {
  clubs,
  matches,
  players,
  registrations,
  tournaments,
  users,
} from '@/models/Schema';
import { assertClubAdmin } from '@/libs/Authz';
import {
  publishTournament,
  deleteTournament,
} from '@/features/tournaments/actions';

export const dynamic = 'force-dynamic';

const FORMAT_LABEL: Record<string, string> = {
  americano: 'Americano',
  mexicano: 'Mexicano',
  round_robin: 'Round robin',
  bracket: 'Bracket',
};

const TYPE_LABEL: Record<string, string> = {
  open: 'Open',
  club_internal: 'Club internal',
  group: 'Group',
  casual: 'Casual',
};

type SearchParams = Promise<{ error?: string }>;

export default async function AdminTournamentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: SearchParams;
}) {
  const { slug, id } = await params;
  const { error } = await searchParams;

  const { userId: clerkId } = await auth();
  if (!clerkId) notFound();
  const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
  if (!u) notFound();
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) notFound();
  try { await assertClubAdmin(u.id, club.id); } catch { notFound(); }

  const [t] = await db.select().from(tournaments).where(and(eq(tournaments.id, id), eq(tournaments.club_id, club.id))).limit(1);
  if (!t) notFound();

  const regs = await db
    .select({ player_id: registrations.player_id, handle: players.handle, display_name: players.display_name, tier: players.tier })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.player_id))
    .where(and(eq(registrations.tournament_id, t.id), eq(registrations.status, 'registered')));

  const [{ value: matchCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.tournament_id, t.id));

  async function publishAction() {
    'use server';
    const r = await publishTournament({ tournament_id: t.id });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/${t.id}?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}/admin/tournaments/${t.id}`);
  }

  async function deleteAction() {
    'use server';
    const r = await deleteTournament({ tournament_id: t.id });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/${t.id}?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}`);
  }

  return (
    <main className="px-4 pb-8">
      <p>
        <a href={`/c/${slug}`} className="mute">← {club.name}</a>
      </p>
      <p style={{ marginTop: '0.5em' }}>{t.name}</p>
      <p className="mute">
        {FORMAT_LABEL[t.format]} · {TYPE_LABEL[t.tournament_type]} · status: <span className={t.status === 'in_progress' ? 'fn-blue font-bold' : t.status === 'open' ? 'fn-green font-bold' : ''}>{t.status}</span>
      </p>

      {error ? <p className="fn-red font-bold" style={{ marginTop: '1em' }}>{error}</p> : null}

      {/* Action buttons */}
      <div style={{ marginTop: '2em' }}>
        {t.status === 'draft' && (
          <>
            <form action={publishAction} style={{ display: 'inline-block', marginRight: '1.5em' }}>
              <button type="submit" className="btn-link fn-green font-bold">Publish (open for registration) →</button>
            </form>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/edit`} className="btn-link" style={{ marginRight: '1.5em' }}>Edit →</a>
            <form action={deleteAction} style={{ display: 'inline-block' }}>
              <button type="submit" className="btn-link fn-red font-bold">Delete</button>
            </form>
          </>
        )}
        {t.status === 'open' && regs.length >= 2 && matchCount === 0 && (
          <>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/bracket/preview`} className="btn-link fn-blue font-bold" style={{ marginRight: '1.5em' }}>Generate bracket →</a>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/edit`} className="btn-link" style={{ marginRight: '1.5em' }}>Edit →</a>
            <form action={deleteAction} style={{ display: 'inline-block' }}>
              <button type="submit" className="btn-link fn-red font-bold">Delete</button>
            </form>
          </>
        )}
        {t.status === 'open' && regs.length < 2 && (
          <>
            <p className="mute">Need at least 2 registered players to generate bracket</p>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/edit`} className="btn-link" style={{ marginRight: '1.5em', marginTop: '0.5em', display: 'inline-block' }}>Edit →</a>
            <form action={deleteAction} style={{ display: 'inline-block' }}>
              <button type="submit" className="btn-link fn-red font-bold">Delete</button>
            </form>
          </>
        )}
        {t.status === 'in_progress' && (
          <>
            <a href={`/t/${t.slug}`} className="btn-link" style={{ marginRight: '1.5em' }}>View bracket →</a>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/scores`} className="btn-link fn-blue">Manage scores →</a>
          </>
        )}
        {t.status === 'complete' && (
          <p className="mute">Tournament complete</p>
        )}
        {/* Defensive fallback: an open tournament with matches recorded is architecturally impossible
            (generateBracket transitions status atomically) but if data drifts, surface a hint. */}
        {t.status === 'open' && regs.length >= 2 && matchCount > 0 && (
          <p className="mute">State inconsistency: tournament is open but matches exist. Contact support.</p>
        )}
      </div>

      <hr className="rule" style={{ margin: '2em 0' }} />

      <p className="mute">{regs.length} registered player{regs.length === 1 ? '' : 's'}</p>
      {regs.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '1em' }}>
          {regs.map((r) => (
            <li key={r.player_id} className="rule-bottom" style={{ padding: '0.75em 0' }}>
              <a href={`/p/${r.handle}`}>{r.display_name}</a>{' '}
              <span className="mute">· {r.tier}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mute" style={{ marginTop: '1em' }}>No players registered yet.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Run check-types + build**

```bash
npm run check-types && npm run build
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/c/[slug]/admin/tournaments/[id]/page.tsx
git commit -m "feat(admin): tournament detail page with status-conditional actions"
```

### Task 1.10: Build /c/[slug]/admin/tournaments/[id]/edit page

**Files:**
- Create: `src/app/c/[slug]/admin/tournaments/[id]/edit/page.tsx`

**Spec reference:** §4.1 item 5 (edit page bullet).

- [ ] **Step 1: Implement the edit page**

```tsx
// src/app/c/[slug]/admin/tournaments/[id]/edit/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/libs/DB';
import { clubs, matches, tournaments, users } from '@/models/Schema';
import { assertClubAdmin } from '@/libs/Authz';
import { updateTournament } from '@/features/tournaments/actions';
import { TournamentForm } from '@/features/tournaments/components/TournamentForm';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string }>;

export default async function EditTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: SearchParams;
}) {
  const { slug, id } = await params;
  const { error } = await searchParams;

  const { userId: clerkId } = await auth();
  if (!clerkId) notFound();
  const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
  if (!u) notFound();
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) notFound();
  try { await assertClubAdmin(u.id, club.id); } catch { notFound(); }

  const [t] = await db.select().from(tournaments).where(and(eq(tournaments.id, id), eq(tournaments.club_id, club.id))).limit(1);
  if (!t) notFound();

  // Edit allowed only for draft|open with no matches
  if (t.status !== 'draft' && t.status !== 'open') notFound();
  const [{ value: matchCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.tournament_id, t.id));
  if (matchCount > 0) notFound();

  async function action(formData: FormData) {
    'use server';
    const r = await updateTournament({
      tournament_id: t.id,
      name: String(formData.get('name')),
      format: String(formData.get('format')) as 'americano' | 'mexicano' | 'round_robin' | 'bracket',
      tournament_type: String(formData.get('tournament_type')) as 'open' | 'club_internal' | 'group' | 'casual',
      start_at: new Date(String(formData.get('start_at'))).toISOString(),
      tier_min: (String(formData.get('tier_min') ?? '') || null) as never,
      tier_max: (String(formData.get('tier_max') ?? '') || null) as never,
    });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/${t.id}/edit?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}/admin/tournaments/${t.id}`);
  }

  return (
    <main className="px-4 pb-8">
      <p>
        <a href={`/c/${slug}/admin/tournaments/${t.id}`} className="mute">← {t.name}</a>
      </p>
      <p style={{ marginTop: '0.5em' }}>Edit tournament</p>
      <hr className="rule" style={{ margin: '1.5em 0' }} />
      <TournamentForm
        mode="edit"
        action={action}
        tournamentId={t.id}
        error={error}
        initial={{
          name: t.name,
          format: t.format as 'americano' | 'mexicano' | 'round_robin' | 'bracket',
          tournament_type: t.tournament_type as 'open' | 'club_internal' | 'group' | 'casual',
          start_at: t.start_at.toISOString(),
          tier_min: t.tier_min as never,
          tier_max: t.tier_max as never,
        }}
      />
    </main>
  );
}
```

- [ ] **Step 2: Run check-types + build**

```bash
npm run check-types && npm run build
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/c/[slug]/admin/tournaments/[id]/edit/page.tsx
git commit -m "feat(admin): tournament edit page wired to updateTournament action"
```

### Task 1.11: Add E2E smoke for admin route gating

**Files:**
- Create: `tests/e2e/admin-route-gating.spec.ts`

**Spec reference:** §4.4 E2E. The full *authenticated* CRUD flow is verified by Task 1.12 manual smoke (Tew on iPhone). Automated E2E here covers only what we can test without a Clerk-authenticated session, since the existing E2E suite has no Clerk auth setup and adding one is out of scope for Phase 1.

- [ ] **Step 1: Inspect existing E2E auth setup (if any)**

```bash
cat playwright.config.ts | head -40
grep -rln "storageState\|Clerk\|sign-in" tests/e2e/ 2>/dev/null
```
Confirm: the existing suite tests unauthenticated flows only. If a prior session added a Clerk auth helper, reuse it; otherwise proceed with unauthenticated-only checks here.

- [ ] **Step 2: Write the Playwright spec for unauthenticated gating**

```ts
// tests/e2e/admin-route-gating.spec.ts
import { test, expect } from '@playwright/test';

test.describe('admin route gating', () => {
  test('unauthenticated visitor at admin tournament new redirects to /sign-in', async ({ page }) => {
    const r = await page.goto('/c/destination-padel/admin/tournaments/new');
    // Clerk middleware should redirect to /sign-in
    expect(page.url()).toMatch(/\/sign-in/);
    // OR if the middleware returns 404 first (because the route is gated), accept that too
    if (!page.url().match(/\/sign-in/)) {
      expect(r?.status()).toBe(404);
    }
  });

  test('unauthenticated visitor at admin tournament detail redirects or 404', async ({ page }) => {
    // The id is fake; we just want to confirm the gating fires before any DB lookup
    const r = await page.goto('/c/destination-padel/admin/tournaments/00000000-0000-0000-0000-000000000000');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });

  test('unauthenticated visitor at admin tournament edit redirects or 404', async ({ page }) => {
    const r = await page.goto('/c/destination-padel/admin/tournaments/00000000-0000-0000-0000-000000000000/edit');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });

  test('public tournament list remains accessible without auth', async ({ page }) => {
    await page.goto('/t');
    expect(page.url()).toContain('/t');
    expect(page.url()).not.toMatch(/\/sign-in/);
  });
});
```

- [ ] **Step 3: Run the E2E spec**

```bash
npm run test:e2e -- admin-route-gating
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/admin-route-gating.spec.ts
git commit -m "test(e2e): admin routes gated to authenticated club admins"
```

**Follow-up task created post-MVP:** Add Clerk-authenticated E2E flow that exercises the full create → publish → edit → delete cycle. Requires a Playwright `globalSetup` that seeds an admin Clerk session and saves `storageState.json`. Track as a separate issue; not blocking Phase 1.

### Task 1.12: Phase 1 manual smoke gate

This is not a code task. It's a human checkpoint before moving to Phase 2.

- [ ] **Step 1: Tew opens https://padelz-v1.vercel.app in Incognito (no Clerk session)**

Expected: redirected to `/coming-soon`. Holding screen renders, "Sign in →" link points to `/sign-in`.

- [ ] **Step 2: Tew signs in via real Clerk and lands at /**

Expected: real landing page visible (NOT coming-soon).

- [ ] **Step 3: Tew navigates to `/c/destination-padel/admin/tournaments/new`**

Expected: form renders. Lands a new tournament. Status shows `draft`. NOT visible on public `/t` yet.

- [ ] **Step 4: Tew clicks Publish on the detail page**

Expected: status flips to `open`. Tournament now appears on public `/t`.

- [ ] **Step 5: Tew clicks Edit, changes the name, saves**

Expected: name updates on detail page AND on public `/t/[slug]`.

- [ ] **Step 6: Tew tries to delete a tournament with no matches**

Expected: succeeds, redirects to `/c/destination-padel`.

- [ ] **Step 7: Rate limit spot check**

Tew opens the dev console and spams Register on any tournament for 10+ clicks within 60 seconds. After the 5th, expect "Slow down — try again in a minute." (or the equivalent UI surfacing from the existing rate-limit code). If the limit doesn't fire, suspect Upstash creds aren't taking effect in production — verify in Vercel env vars.

If any step fails, the implementer agent stops, files the bug as a follow-up, and surfaces to Tew. No Phase 2 work until Phase 1 smoke is green.

---

## Chunk 2: Phase 2 — BracketBuilder + Public BracketView

Implements spec §5. Phase 2 delivers: a two-line extension to the existing `generateBracket` action (status precondition + status transition), a server-rendered preview page that calls `generateBracketData` read-only, a public `BracketView` component, and an update to the existing public tournament detail page to render the bracket when one exists.

**File budget for Chunk 2:**

| Path | Status |
|---|---|
| `src/features/tournaments/actions.ts` | MODIFY (two-line edit to `generateBracket`) |
| `src/features/tournaments/components/BracketView.tsx` | CREATE |
| `src/app/c/[slug]/admin/tournaments/[id]/bracket/preview/page.tsx` | CREATE |
| `src/app/t/[slug]/page.tsx` | MODIFY (render bracket if exists) |
| `tests/integration/generate-bracket.test.ts` | MODIFY (add status-precondition + transition tests) |
| `tests/unit/bracket-view.test.tsx` | CREATE |
| `tests/e2e/bracket-flow.spec.ts` | CREATE |

### Task 2.1: Extend generateBracket with status precondition + transition

**Files:**
- Modify: `src/features/tournaments/actions.ts` (two-line addition to existing `generateBracket`)
- Modify: `tests/integration/generate-bracket.test.ts`

**Spec reference:** §5.2 (the explicit two-line code snippet).

- [ ] **Step 1: Re-read the existing generateBracket action**

```bash
sed -n '316,470p' src/features/tournaments/actions.ts
```

Note the structure: auth check → Zod parse → user lookup → tournament lookup → admin check → `ALREADY_GENERATED` idempotency guard → load players → `generateBracketData` call → transaction inserting brackets + matches → revalidate. The two additions go in specific places:

1. **New status precondition** — immediately AFTER the existing `ALREADY_GENERATED` guard finishes (lines 378–391 in the live file) and BEFORE the `regRows` query.
2. **New status transition** — inside the existing `db.transaction(...)` callback, AFTER the matches insert, BEFORE the closing `return [b]`.

- [ ] **Step 2: Write failing tests for the new behaviors**

Append to `tests/integration/generate-bracket.test.ts`:

```ts
import { publishTournament } from '@/features/tournaments/actions';

describe('generateBracket status guards', () => {
  it('returns INVALID_STATUS when tournament is in draft', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().slice(0, 8));
    const tournamentId = await makeTournament(clubId, clerkId, 'round_robin');
    // do NOT publish; leave in draft
    const playerIds = await makePlayers(4);
    for (const pid of playerIds) {
      await db.insert(registrations).values({
        tournament_id: tournamentId,
        player_id: pid,
        status: 'registered',
      });
    }

    const r = await generateBracket({ tournament_id: tournamentId }, clerkId);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.code).toBe('INVALID_STATUS');
  });

  it('flips status from open to in_progress on successful generate', async () => {
    const { clerkId, clubId } = await makeClubAdmin(uuidv7().slice(0, 8));
    const tournamentId = await makeTournament(clubId, clerkId, 'round_robin');

    // Publish to open
    const pub = await publishTournament({ tournament_id: tournamentId }, clerkId);
    expect(pub.success).toBe(true);

    // Register 4 players
    const playerIds = await makePlayers(4);
    for (const pid of playerIds) {
      await db.insert(registrations).values({
        tournament_id: tournamentId,
        player_id: pid,
        status: 'registered',
      });
    }

    const r = await generateBracket({ tournament_id: tournamentId }, clerkId);
    expect(r.success).toBe(true);

    // Verify status flipped
    const [t] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    expect(t.status).toBe('in_progress');

    // Verify bracket + matches rows exist (existing behavior)
    const [br] = await db
      .select()
      .from(brackets)
      .where(eq(brackets.tournament_id, tournamentId));
    expect(br).toBeDefined();
    const ms = await db.select().from(matches).where(eq(matches.tournament_id, tournamentId));
    expect(ms.length).toBeGreaterThan(0);
  });
});
```

The existing tests in `tests/integration/generate-bracket.test.ts` ALL call `createTournament` (which lands in `draft`) and then call `generateBracket` directly. Every one of them will now fail because of the new `status='open'` precondition. The tests that need a `publishTournament({ tournament_id: tournamentId }, clerkId)` call inserted between `makeTournament(...)` and `generateBracket(...)`:

1. The `round_robin` format happy-path test
2. The `americano` format happy-path test
3. The `mexicano` format happy-path test
4. The `bracket` format happy-path test
5. The `ALREADY_GENERATED` idempotency test (the second `generateBracket` call asserts the guard; the first call still needs to succeed, which requires the publish)

Read the existing file to confirm the count — if there are additional tests, fix them too. The fix is mechanical and identical across all of them.

- [ ] **Step 3: Run failing tests**

```bash
npm run test:integration -- generate-bracket
```
Expected: the two new tests FAIL. Any existing tests that depended on draft-status generation also fail.

- [ ] **Step 4: Apply the two-line edit to generateBracket**

In `src/features/tournaments/actions.ts`, locate the existing `ALREADY_GENERATED` idempotency guard (lines ~378–391). Immediately AFTER that guard (after the closing `}` of the `if (existing) { ... }` block), insert:

```ts
if (t.status !== 'open') {
  return {
    success: false,
    error: {
      code: 'INVALID_STATUS',
      message: 'Tournament must be open to generate bracket',
    },
  };
}
```

Then locate the existing `db.transaction(async (tx) => { ... })` block (lines ~436–457). Inside the transaction callback, AFTER the `await tx.insert(matches).values(...)` block and BEFORE the `return [b]`, insert:

```ts
await tx
  .update(tournaments)
  .set({ status: 'in_progress' })
  .where(eq(tournaments.id, t.id));
```

- [ ] **Step 5: Update existing generate-bracket tests that called generateBracket against draft**

In `tests/integration/generate-bracket.test.ts`, find every `await generateBracket(...)` that previously expected success. For each, add `await publishTournament({ tournament_id: tournamentId }, clerkId);` before the `generateBracket` call (and assert `pub.success`). This is needed because the new precondition rejects draft.

- [ ] **Step 6: Run tests, verify all pass**

```bash
npm run test:integration -- generate-bracket
```
Expected: all generate-bracket tests pass, including the two new ones.

- [ ] **Step 7: Full validation**

```bash
npm run test && npm run test:integration && npm run check-types && npm run lint
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/features/tournaments/actions.ts tests/integration/generate-bracket.test.ts
git commit -m "feat(tournaments): generateBracket status precondition and in_progress transition"
```

### Task 2.2: Build BracketView component

**Files:**
- Create: `src/features/tournaments/components/BracketView.tsx`
- Create: `tests/unit/bracket-view.test.tsx`

**Spec reference:** §5.1 item 3.

This is a pure presentational server component. No state, no client JS. Renders a bracket and its matches given pre-loaded data.

- [ ] **Step 1: Confirm the bracket data shape**

```bash
sed -n '1,50p' src/features/tournaments/bracket.ts
```
Confirm the exact types in the file:
- `BracketMatch = { index: number; team_a: string[]; team_b: string[]; next_match_id?: number | null }` — note the required `index` field and optional `next_match_id`
- `BracketRound = { round: number; matches: BracketMatch[] }` — note the field is `round`, NOT `round_number`
- `FlatBracketData = { format: 'round_robin' | 'bracket'; matches: BracketMatch[] }`
- `RoundBracketData = { format: 'americano' | 'mexicano'; rounds: BracketRound[] }`
- `BracketData = FlatBracketData | RoundBracketData`

All test fixtures and BracketView code below must include the `index: 0, 1, 2, …` field on `BracketMatch` literals and use `round.round` (not `round.round_number`).

- [ ] **Step 2: Write the failing render test**

Create `tests/unit/bracket-view.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BracketView } from '@/features/tournaments/components/BracketView';
import type { BracketData } from '@/features/tournaments/bracket';

const pA = '00000000-0000-0000-0000-00000000000a';
const pB = '00000000-0000-0000-0000-00000000000b';
const pC = '00000000-0000-0000-0000-00000000000c';
const pD = '00000000-0000-0000-0000-00000000000d';

const players = new Map([
  [pA, { handle: 'alice', display_name: 'Alice' }],
  [pB, { handle: 'bob', display_name: 'Bob' }],
  [pC, { handle: 'carla', display_name: 'Carla' }],
  [pD, { handle: 'dan', display_name: 'Dan' }],
]);

describe('BracketView', () => {
  it('renders a flat round-robin bracket as a table', () => {
    const data: BracketData = {
      format: 'round_robin',
      matches: [
        { index: 0, team_a: [pA, pB], team_b: [pC, pD] },
      ],
    };
    const html = renderToStaticMarkup(
      <BracketView
        bracket={data}
        matches={new Map()}
        players={players}
        currentUserPlayerId={null}
      />,
    );
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('Carla');
    expect(html).toContain('Dan');
    expect(html).toContain('class="table');
  });

  it('renders a round-based americano bracket with round labels', () => {
    const data: BracketData = {
      format: 'americano',
      rounds: [
        { round: 1, matches: [{ index: 0, team_a: [pA, pB], team_b: [pC, pD] }] },
        { round: 2, matches: [{ index: 1, team_a: [pA, pC], team_b: [pB, pD] }] },
      ],
    };
    const html = renderToStaticMarkup(
      <BracketView
        bracket={data}
        matches={new Map()}
        players={players}
        currentUserPlayerId={null}
      />,
    );
    expect(html).toMatch(/Round\s+1/);
    expect(html).toMatch(/Round\s+2/);
  });

  it('renders a Submit score link only for matches the current user is in', () => {
    const matchId = '00000000-0000-0000-0000-000000000001';
    const data: BracketData = {
      format: 'round_robin',
      matches: [
        { index: 0, team_a: [pA, pB], team_b: [pC, pD] },
      ],
    };
    const matches = new Map([
      [matchId, {
        id: matchId,
        team_a: [pA, pB],
        team_b: [pC, pD],
        result_status: 'pending' as const,
      }],
    ]);
    const html = renderToStaticMarkup(
      <BracketView
        bracket={data}
        matches={matches}
        players={players}
        currentUserPlayerId={pA}
      />,
    );
    expect(html).toContain('Submit score');
  });
});
```

If the existing unit-test runner doesn't already configure JSX rendering (`react-dom/server`), reference `tests/unit/bracket.test.ts` for the closest pattern and adapt. May require adding `@types/react-dom` if not present (it likely is; the project uses React 19).

- [ ] **Step 3: Run failing test**

```bash
npm run test -- bracket-view
```
Expected: FAIL (component doesn't exist).

- [ ] **Step 4: Implement BracketView**

```tsx
// src/features/tournaments/components/BracketView.tsx
import Link from 'next/link';
import type { BracketData, BracketMatch } from '@/features/tournaments/bracket';

type PlayerInfo = { handle: string; display_name: string };

type MatchInfo = {
  id: string;
  team_a: string[];
  team_b: string[];
  result_status: 'pending' | 'confirmed' | 'disputed' | 'admin_set' | 'void';
  score_a?: number | null;
  score_b?: number | null;
};

type Props = {
  bracket: BracketData;
  matches: Map<string, MatchInfo>;
  players: Map<string, PlayerInfo>;
  currentUserPlayerId: string | null;
};

function nameOf(players: Map<string, PlayerInfo>, id: string): string {
  return players.get(id)?.display_name ?? '?';
}

function teamLabel(players: Map<string, PlayerInfo>, ids: string[]): string {
  return ids.map((id) => nameOf(players, id)).join(' + ');
}

function findMatch(matches: Map<string, MatchInfo>, m: BracketMatch): MatchInfo | undefined {
  for (const mi of matches.values()) {
    if (
      mi.team_a.length === m.team_a.length &&
      mi.team_b.length === m.team_b.length &&
      mi.team_a.every((id, i) => id === m.team_a[i]) &&
      mi.team_b.every((id, i) => id === m.team_b[i])
    ) {
      return mi;
    }
  }
  return undefined;
}

function MatchRow({
  m,
  matches,
  players,
  currentUserPlayerId,
}: {
  m: BracketMatch;
  matches: Map<string, MatchInfo>;
  players: Map<string, PlayerInfo>;
  currentUserPlayerId: string | null;
}) {
  const info = findMatch(matches, m);
  const userInMatch =
    currentUserPlayerId != null &&
    (m.team_a.includes(currentUserPlayerId) || m.team_b.includes(currentUserPlayerId));
  const isPending = info?.result_status === 'pending' || info?.result_status === undefined;
  const isDisputed = info?.result_status === 'disputed';
  const aWins = info?.score_a != null && info?.score_b != null && info.score_a > info.score_b;
  const bWins = info?.score_a != null && info?.score_b != null && info.score_b > info.score_a;
  const scoreCell =
    info?.score_a != null && info?.score_b != null ? (
      <>
        <span className={aWins ? 'fn-green font-bold' : ''}>{info.score_a}</span>
        {' – '}
        <span className={bWins ? 'fn-green font-bold' : ''}>{info.score_b}</span>
      </>
    ) : isDisputed ? (
      <span className="fn-red font-bold">Disputed</span>
    ) : (
      <span className="mute">pending</span>
    );

  return (
    <tr>
      <td>{teamLabel(players, m.team_a)}</td>
      <td>{teamLabel(players, m.team_b)}</td>
      <td>{scoreCell}</td>
      <td style={{ textAlign: 'right', width: '56px' }}>
        {info ? (
          userInMatch && isPending ? (
            <Link href={`/match/${info.id}/submit`} className="btn-link fn-blue font-bold">
              Submit score →
            </Link>
          ) : (
            <Link href={`/match/${info.id}`} className="btn-link">→</Link>
          )
        ) : null}
      </td>
    </tr>
  );
}

function MatchCard({
  m,
  matches,
  players,
  currentUserPlayerId,
}: {
  m: BracketMatch;
  matches: Map<string, MatchInfo>;
  players: Map<string, PlayerInfo>;
  currentUserPlayerId: string | null;
}) {
  const info = findMatch(matches, m);
  const userInMatch =
    currentUserPlayerId != null &&
    (m.team_a.includes(currentUserPlayerId) || m.team_b.includes(currentUserPlayerId));
  const isPending = info?.result_status === 'pending' || info?.result_status === undefined;
  return (
    <div className="rule-bottom" style={{ padding: '0.75em 0' }}>
      <p>{teamLabel(players, m.team_a)}</p>
      <p className="mute">vs</p>
      <p>{teamLabel(players, m.team_b)}</p>
      <div style={{ marginTop: '0.5em' }}>
        {info?.score_a != null && info?.score_b != null ? (
          <span>
            {info.score_a} – {info.score_b}
          </span>
        ) : info?.result_status === 'disputed' ? (
          <span className="fn-red font-bold">Disputed</span>
        ) : (
          <span className="mute">pending</span>
        )}
        {info ? (
          <span style={{ float: 'right' }}>
            {userInMatch && isPending ? (
              <Link href={`/match/${info.id}/submit`} className="btn-link fn-blue font-bold">
                Submit →
              </Link>
            ) : (
              <Link href={`/match/${info.id}`} className="btn-link">View →</Link>
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function BracketView({ bracket, matches, players, currentUserPlayerId }: Props) {
  if (bracket.format === 'round_robin' || bracket.format === 'bracket') {
    return (
      <>
        <table className="table desktop-only">
          <thead>
            <tr>
              <th>Team A</th>
              <th>Team B</th>
              <th>Score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bracket.matches.map((m, i) => (
              <MatchRow key={i} m={m} matches={matches} players={players} currentUserPlayerId={currentUserPlayerId} />
            ))}
          </tbody>
        </table>
        <div className="mobile-only">
          {bracket.matches.map((m, i) => (
            <MatchCard key={i} m={m} matches={matches} players={players} currentUserPlayerId={currentUserPlayerId} />
          ))}
        </div>
      </>
    );
  }

  // RoundBracketData: americano | mexicano
  return (
    <>
      {bracket.rounds.map((round) => (
        <section key={round.round} style={{ marginTop: '2em' }}>
          <p className="mute">Round {round.round}</p>
          <table className="table desktop-only">
            <thead>
              <tr>
                <th>Team A</th>
                <th>Team B</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {round.matches.map((m, i) => (
                <MatchRow key={i} m={m} matches={matches} players={players} currentUserPlayerId={currentUserPlayerId} />
              ))}
            </tbody>
          </table>
          <div className="mobile-only">
            {round.matches.map((m, i) => (
              <MatchCard key={i} m={m} matches={matches} players={players} currentUserPlayerId={currentUserPlayerId} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
```

The `BracketView` inlines the table + card pattern for clarity. The `findMatch` linear scan over the matches map is O(n) per row render — fine for MVP scale (≤45 matches per americano) but worth a post-MVP keyed-lookup optimization.

- [ ] **Step 5: Run the unit tests, verify pass**

```bash
npm run test -- bracket-view
```
Expected: all 3 PASS.

- [ ] **Step 6: Check-types + lint**

```bash
npm run check-types && npm run lint
```
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/tournaments/components/BracketView.tsx tests/unit/bracket-view.test.tsx
git commit -m "feat(tournaments): bracketview component with desktop table and mobile card"
```

### Task 2.3: Build bracket preview page

**Files:**
- Create: `src/app/c/[slug]/admin/tournaments/[id]/bracket/preview/page.tsx`

**Spec reference:** §5.1 item 2.

- [ ] **Step 1: Implement the preview page**

```tsx
// src/app/c/[slug]/admin/tournaments/[id]/bracket/preview/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { db } from '@/libs/DB';
import {
  brackets,
  clubs,
  players,
  registrations,
  tournaments,
  users,
} from '@/models/Schema';
import { assertClubAdmin } from '@/libs/Authz';
import { generateBracket } from '@/features/tournaments/actions';
import { generateBracketData } from '@/features/tournaments/bracket';
import { BracketView } from '@/features/tournaments/components/BracketView';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string }>;

export default async function BracketPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: SearchParams;
}) {
  const { slug, id } = await params;
  const { error } = await searchParams;

  const { userId: clerkId } = await auth();
  if (!clerkId) notFound();
  const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
  if (!u) notFound();
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) notFound();
  try { await assertClubAdmin(u.id, club.id); } catch { notFound(); }

  const [t] = await db.select().from(tournaments).where(and(eq(tournaments.id, id), eq(tournaments.club_id, club.id))).limit(1);
  if (!t) notFound();
  if (t.status !== 'open') notFound();

  // Bracket already exists: bounce back to the admin detail page
  const [existingBracket] = await db.select({ id: brackets.id }).from(brackets).where(eq(brackets.tournament_id, t.id)).limit(1);
  if (existingBracket) {
    redirect(`/c/${slug}/admin/tournaments/${t.id}`);
  }

  // Registered players
  const regs = await db
    .select({ player_id: registrations.player_id, handle: players.handle, display_name: players.display_name })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.player_id))
    .where(and(eq(registrations.tournament_id, t.id), eq(registrations.status, 'registered')));

  if (regs.length < 2) notFound();

  // Read-only bracket generation. Deterministic per bracket.ts (no randomness).
  let previewData;
  try {
    previewData = generateBracketData(regs.map((r) => r.player_id), t.format);
  } catch (e) {
    redirect(`/c/${slug}/admin/tournaments/${t.id}?error=${encodeURIComponent(e instanceof Error ? e.message : 'Bracket generation failed')}`);
  }

  const playerMap = new Map(regs.map((r) => [r.player_id, { handle: r.handle, display_name: r.display_name }]));

  async function confirmAction() {
    'use server';
    // generateBracket falls back to auth().userId when called without an explicit clerkId.
    // Since this server action runs in a request context with the signed-in admin's session,
    // the fallback resolves correctly. No need to pass clerkId.
    const r = await generateBracket({ tournament_id: t.id });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/${t.id}/bracket/preview?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}/admin/tournaments/${t.id}`);
  }

  return (
    <main className="px-4 pb-8">
      <p>
        <a href={`/c/${slug}/admin/tournaments/${t.id}`} className="mute">← {t.name}</a>
      </p>
      <p style={{ marginTop: '0.5em' }}>Preview bracket</p>
      <p className="mute">
        This is what {regs.length} registered players will see. Bracket generation is deterministic. Confirm to commit.
      </p>

      {error ? <p className="fn-red font-bold" style={{ marginTop: '1em' }}>{error}</p> : null}

      <hr className="rule" style={{ margin: '1.5em 0' }} />

      <BracketView
        bracket={previewData}
        matches={new Map()}
        players={playerMap}
        currentUserPlayerId={null}
      />

      <div style={{ marginTop: '2em' }}>
        <a href={`/c/${slug}/admin/tournaments/${t.id}`} className="btn-link" style={{ marginRight: '1.5em' }}>← Cancel</a>
        <form action={confirmAction} style={{ display: 'inline-block' }}>
          <button type="submit" className="btn-link fn-green font-bold">Confirm and lock tournament →</button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run check-types + build**

```bash
npm run check-types && npm run build
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/c/[slug]/admin/tournaments/[id]/bracket/preview/page.tsx
git commit -m "feat(admin): bracket preview page with deterministic read-only render"
```

### Task 2.4: Update /t/[slug] public tournament page to render bracket

**Files:**
- Modify: `src/app/t/[slug]/page.tsx`

**Spec reference:** §5.1 item 4.

- [ ] **Step 1: Read the current /t/[slug] page**

```bash
cat src/app/t/[slug]/page.tsx | head -60
```
Note: it currently renders tournament info + registered player roster + a Register button. We extend it to also render the bracket if one exists, and hide the Register button when `status='in_progress'`.

- [ ] **Step 2: Extend the roster query to include `player_id`**

The existing roster query at `src/app/t/[slug]/page.tsx` (around lines 102–116) currently selects only `handle`, `display_name`, `tier`. Add `player_id` to the select set:

```ts
roster = await db
  .select({
    player_id: registrations.player_id,
    handle: players.handle,
    display_name: players.display_name,
    tier: players.tier,
  })
  .from(registrations)
  .innerJoin(players, eq(players.id, registrations.player_id))
  .where(
    and(
      eq(registrations.tournament_id, t.id),
      eq(registrations.status, 'registered'),
    ),
  )
  .limit(64);
```

The TypeScript inferred shape of `roster[number]` will now include `player_id`. Any existing JSX that maps over `roster` will continue to work because no field was renamed or removed.

- [ ] **Step 3: Add bracket + matches query block**

In the same server component, after the roster query, add:

```ts
import { brackets, matches } from '@/models/Schema';
import { BracketView } from '@/features/tournaments/components/BracketView';
import type { BracketData } from '@/features/tournaments/bracket';

// Add to existing Schema import: brackets, matches
// (in the body of the page, after the roster query)

const [bracketRow] = await db
  .select()
  .from(brackets)
  .where(eq(brackets.tournament_id, t.id))
  .limit(1);

const matchRows = bracketRow
  ? await db.select().from(matches).where(eq(matches.tournament_id, t.id))
  : [];

const playerMap = new Map(
  roster.map((r) => [r.player_id, { handle: r.handle, display_name: r.display_name }]),
);

const matchMap = new Map(
  matchRows.map((m) => [m.id, {
    id: m.id,
    team_a: m.team_a,
    team_b: m.team_b,
    // result_status comes from a match_results JOIN that is deferred to a post-MVP follow-up.
    // For now every match renders as pending; the existing scores-admin flow updates the match_results table directly.
    result_status: 'pending' as const,
    score_a: null,
    score_b: null,
  }]),
);

// Resolve currentUserPlayerId from auth() if signed in
let currentUserPlayerId: string | null = null;
const { userId: clerkId } = await auth();
if (clerkId) {
  const [pl] = await db
    .select({ id: players.id })
    .from(players)
    .innerJoin(users, eq(users.id, players.user_id))
    .where(eq(users.clerk_id, clerkId))
    .limit(1);
  currentUserPlayerId = pl?.id ?? null;
}
```

The existing roster query likely already imports `players` and `registrations`; reuse those imports. Add `matches`, `brackets` to the Schema import.

For the `result_status` lookup, the spec wants real `result_status` from the `match_results` table joined to matches. For MVP simplicity, render every match as `pending` initially and let the existing scores admin / match-detail flow update them. A follow-up task can add the join.

- [ ] **Step 4: Render the bracket section conditionally**

Below the existing roster section, add:

```tsx
{bracketRow ? (
  <section style={{ marginTop: '2em' }}>
    <p className="mute">Bracket</p>
    <BracketView
      bracket={bracketRow.data as BracketData}
      matches={matchMap}
      players={playerMap}
      currentUserPlayerId={currentUserPlayerId}
    />
  </section>
) : (
  <p className="mute" style={{ marginTop: '2em' }}>
    Bracket not yet generated. Registration closes when the admin locks it.
  </p>
)}
```

Also update the existing Register button rendering: it should be visible only when `t.status === 'open'`. When `t.status === 'in_progress'`, render `<p className="mute">Registration closed</p>` instead.

- [ ] **Step 5: Check-types + build**

```bash
npm run check-types && npm run build
```
Expected: clean.

- [ ] **Step 6: Run the full unit + integration test suite to verify no regression**

```bash
npm run test && npm run test:integration
```
Expected: all green. If the existing `/t/[slug]` tests (likely in `tests/e2e/tournament-list-detail.spec.ts`) check for specific text, the new bracket section may shift content. Adjust selectors if needed.

- [ ] **Step 7: Commit**

```bash
git add src/app/t/[slug]/page.tsx
git commit -m "feat(tournaments): render bracket on public tournament page when available"
```

### Task 2.5: E2E smoke for bracket preview flow

**Files:**
- Create: `tests/e2e/bracket-flow.spec.ts`

**Spec reference:** §5.6 E2E.

Like Task 1.11, this is limited to unauthenticated assertions because the existing E2E suite has no Clerk session setup. The authenticated bracket-generation flow is covered by Task 2.6 manual smoke.

- [ ] **Step 1: Write the Playwright spec**

```ts
// tests/e2e/bracket-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('bracket flow', () => {
  test('unauthenticated visitor at admin bracket preview redirects or 404', async ({ page }) => {
    const r = await page.goto('/c/destination-padel/admin/tournaments/00000000-0000-0000-0000-000000000000/bracket/preview');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });

  test('public tournament page renders bracket-not-generated message when no bracket exists', async ({ page }) => {
    // Use the seeded tournament from scripts/seed.ts (saturday-open-week-1, draft|open status)
    await page.goto('/t/saturday-open-week-1');
    await expect(page.getByText(/Bracket not yet generated/)).toBeVisible();
  });
});
```

If the seeded tournament's slug differs in the test environment, adjust the slug. Reference `scripts/seed.ts` line 52 for the canonical slug.

- [ ] **Step 2: Run the spec**

```bash
npm run test:e2e -- bracket-flow
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bracket-flow.spec.ts
git commit -m "test(e2e): bracket preview gated and public bracket placeholder visible"
```

### Task 2.6: Phase 2 manual smoke gate

- [ ] **Step 1: Tew creates a draft tournament, publishes it, registers ≥ 2 players (use stub seeds OR have a friend sign up)**

Expected: admin detail page shows "Generate bracket →" button when ≥ 2 players registered.

- [ ] **Step 2: Tew clicks "Generate bracket →"**

Expected: lands on preview page, sees a deterministic bracket render. Refresh — bracket NOT yet committed (no rows in `brackets` table yet).

- [ ] **Step 3: Tew clicks "Confirm and lock tournament →"**

Expected: action commits, redirects to admin detail page. Status flips to `in_progress`. "Generate bracket →" button disappears, "View bracket →" + "Manage scores →" appear.

- [ ] **Step 4: Tew navigates to the public `/t/[slug]`**

Expected: bracket renders below the roster. On mobile, card variant. On desktop, table. Each match has a → link.

- [ ] **Step 5: Tew signs in as a player who is in a match**

Expected: that match's row shows "Submit score →" link. Other matches show plain →.

- [ ] **Step 6: Tew signs in as a player NOT in any match (or anonymous)**

Expected: no Submit links. All matches show plain →.

If any step fails, stop and surface to Tew. No Phase 3 work until Phase 2 smoke is green.

---

## Chunk 3: Phase 3 — Leaderboard tier filter + /me/points history

Implements spec §6. Phase 3 delivers: a `TierFilter` server component, an edit to `/leaderboard/page.tsx` that adds the filter row + applies the tier filter via URL search param, and a new `/me/points` page that renders the signed-in user's points-ledger history.

**File budget for Chunk 3:**

| Path | Status |
|---|---|
| `src/features/leaderboard/components/TierFilter.tsx` | CREATE |
| `src/app/leaderboard/page.tsx` | MODIFY (add filter row + apply tier filter) |
| `src/app/me/points/page.tsx` | CREATE |
| `src/features/profiles/components/PointsHistory.tsx` | CREATE |
| `tests/unit/tier-filter.test.tsx` | CREATE |
| `tests/integration/me-points.test.ts` | CREATE |
| `tests/e2e/leaderboard-filter.spec.ts` | CREATE |

### Task 3.1: Build TierFilter component

**Files:**
- Create: `src/features/leaderboard/components/TierFilter.tsx`
- Create: `tests/unit/tier-filter.test.tsx`

**Spec reference:** §6.1.

- [ ] **Step 1: Write the failing unit test**

```tsx
// tests/unit/tier-filter.test.tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TierFilter } from '@/features/leaderboard/components/TierFilter';

describe('TierFilter', () => {
  it('renders six links (all + 5 tiers) when no tier is selected', () => {
    const html = renderToStaticMarkup(<TierFilter currentTier={null} basePath="/leaderboard" />);
    expect(html).toContain('href="/leaderboard"');
    expect(html).toContain('href="/leaderboard?tier=bronze"');
    expect(html).toContain('href="/leaderboard?tier=silver"');
    expect(html).toContain('href="/leaderboard?tier=gold"');
    expect(html).toContain('href="/leaderboard?tier=platinum"');
    expect(html).toContain('href="/leaderboard?tier=diamond"');
  });

  it('marks the selected tier with .fn-blue.font-bold', () => {
    const html = renderToStaticMarkup(<TierFilter currentTier="silver" basePath="/leaderboard" />);
    // The "Silver" link should have the fn-blue + font-bold classes
    expect(html).toMatch(/href="\/leaderboard\?tier=silver"[^>]*fn-blue[^>]*font-bold|fn-blue font-bold[^>]*href="\/leaderboard\?tier=silver"/);
  });

  it('marks "All" as selected when currentTier is null', () => {
    const html = renderToStaticMarkup(<TierFilter currentTier={null} basePath="/leaderboard" />);
    // The bare /leaderboard link (no ?tier= param) should be styled selected
    expect(html).toMatch(/href="\/leaderboard"[^>]*fn-blue[^>]*font-bold|fn-blue font-bold[^>]*href="\/leaderboard"/);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npm run test -- tier-filter
```
Expected: FAIL (component does not exist).

- [ ] **Step 3: Implement TierFilter**

```tsx
// src/features/leaderboard/components/TierFilter.tsx
import Link from 'next/link';
import type { Tier } from '@/features/profiles/types';

type Props = {
  currentTier: Tier | null;
  basePath: string;
};

const TIERS: Array<{ value: Tier; label: string }> = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'diamond', label: 'Diamond' },
];

export function TierFilter({ currentTier, basePath }: Props) {
  return (
    <nav style={{ marginBottom: '1.5em' }}>
      <Link
        href={basePath}
        className={currentTier === null ? 'btn-link fn-blue font-bold' : 'btn-link'}
        style={{ marginRight: '1em' }}
      >
        All
      </Link>
      {TIERS.map((t) => (
        <Link
          key={t.value}
          href={`${basePath}?tier=${t.value}`}
          className={currentTier === t.value ? 'btn-link fn-blue font-bold' : 'btn-link'}
          style={{ marginRight: '1em' }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
```

The `Tier` type comes from `src/features/profiles/types.ts` (the `TIERS` const + `Tier` type are already exported there). The mid-dot separator that desktop Padel-Z chrome uses is implicit between links via spacing; no separator characters needed.

- [ ] **Step 4: Run tests, verify pass**

```bash
npm run test -- tier-filter
```
Expected: 3 PASS.

- [ ] **Step 5: Check-types + lint**

```bash
npm run check-types && npm run lint
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/leaderboard/components/TierFilter.tsx tests/unit/tier-filter.test.tsx
git commit -m "feat(leaderboard): tierfilter component with selected state"
```

### Task 3.2: Add tier filter to /leaderboard page

**Files:**
- Modify: `src/app/leaderboard/page.tsx`

**Spec reference:** §6.1.

- [ ] **Step 1: Inspect current leaderboard page**

```bash
cat src/app/leaderboard/page.tsx
```
Note the current pattern: server component, reads `players` table, lists 50 rows. Already has `export const dynamic = 'force-dynamic'`. Already imports `players` from Schema.

- [ ] **Step 2: Edit the page to accept `searchParams` and filter by tier**

Modify `src/app/leaderboard/page.tsx`:

1. Add import: `import { TierFilter } from '@/features/leaderboard/components/TierFilter';` and `import { eq } from 'drizzle-orm';` (if not already imported) and `import type { Tier } from '@/features/profiles/types';`.

2. Change the function signature to accept `searchParams`:

```ts
type SearchParams = Promise<{ tier?: string }>;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tier: tierParam } = await searchParams;
  const validTiers: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const currentTier: Tier | null = validTiers.includes(tierParam as Tier) ? (tierParam as Tier) : null;

  let rows: Row[] = [];
  let dbError = false;
  try {
    const baseQuery = db
      .select({
        handle: players.handle,
        name: players.display_name,
        tier: players.tier,
      })
      .from(players)
      .limit(50);
    rows = currentTier
      ? await baseQuery.where(eq(players.tier, currentTier))
      : await baseQuery;
  } catch {
    dbError = true;
  }
  // ... rest of existing render
}
```

Note: drizzle's chainable builder may require finalizing the query differently if `.where` is chained after `.limit`. Read the existing drizzle usage in the file. If the chain doesn't allow conditional `.where`, restructure:

```ts
const rowsBase = db.select({...}).from(players);
const rowsWithFilter = currentTier
  ? rowsBase.where(eq(players.tier, currentTier))
  : rowsBase;
rows = await rowsWithFilter.limit(50);
```

3. Render the `TierFilter` component above the existing leaderboard:

```tsx
<TierFilter currentTier={currentTier} basePath="/leaderboard" />
```

Place it after the intro `<p>` blocks and before the existing `<div className="rule mt-20 desktop-only">` table header.

4. Add an empty state. If `rows.length === 0` AND `currentTier !== null` AND `!dbError`, render:

```tsx
<p className="mute" style={{ marginTop: '2em' }}>No players at this tier yet.</p>
```

This replaces the existing leaderboard table body when the filtered tier is empty.

- [ ] **Step 3: Check-types + build**

```bash
npm run check-types && npm run build
```
Expected: clean.

- [ ] **Step 4: Quick manual smoke (dev server)**

```bash
npm run dev:next &
```
Open `http://localhost:3000/leaderboard` and `http://localhost:3000/leaderboard?tier=bronze`. Verify the filter row renders, links are clickable, and the tier param filters the rows. Kill the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(leaderboard): tier filter via url search param"
```

### Task 3.3: Build /me/points history page

**Files:**
- Create: `src/app/me/points/page.tsx`
- Create: `src/features/profiles/components/PointsHistory.tsx`
- Create: `tests/integration/me-points.test.ts`

**Spec reference:** §6.1 item 2.

This page joins `points_ledger` with `matches`, `tournaments`, and `players` (for opponent names). The signed-in player is resolved from Clerk. The middleware already gates `/me(.*)`, so no auth gating needed at the page level beyond resolving the player row.

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/me-points.test.ts
import { describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { db } from '@/libs/DB';
import {
  clubs,
  matches,
  match_results,
  players,
  points_ledger,
  tournaments,
  users,
} from '@/models/Schema';
import { getMyPointsHistory } from '@/features/profiles/actions';

describe('getMyPointsHistory', () => {
  it('returns last N entries ordered by earned_at desc with opponent context', async () => {
    const clerkId = `mp-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    const [opp] = await db.insert(users).values({ clerk_id: `${clerkId}-opp`, email: `${clerkId}-opp@x` }).returning();

    const [c] = await db.insert(clubs).values({ slug: `mp-club-${clerkId.slice(-8)}`, name: 'MP Club' }).returning();
    const [t] = await db.insert(tournaments).values({
      slug: `mp-t-${clerkId.slice(-8)}`,
      club_id: c.id,
      name: 'MP Test Tournament',
      format: 'round_robin',
      tournament_type: 'club_internal',
      start_at: new Date(),
      status: 'in_progress',
      created_by: u.id,
    }).returning();

    const [pMe] = await db.insert(players).values({ user_id: u.id, handle: `me-${clerkId.slice(-8)}`, display_name: 'Me', tier: 'bronze' }).returning();
    const [pOpp] = await db.insert(players).values({ user_id: opp.id, handle: `opp-${clerkId.slice(-8)}`, display_name: 'Opp', tier: 'bronze' }).returning();

    const [m] = await db.insert(matches).values({
      tournament_id: t.id,
      team_a: [pMe.id],
      team_b: [pOpp.id],
      status: 'complete',
    }).returning();

    await db.insert(points_ledger).values({
      player_id: pMe.id,
      match_id: m.id,
      points: '5',
      breakdown: { base: 5 },
      earned_at: new Date(),
    });

    const r = await getMyPointsHistory(clerkId, 50);
    expect(r.entries.length).toBe(1);
    expect(r.entries[0].points).toBe(5);
    expect(r.entries[0].tournament_name).toBe('MP Test Tournament');
    expect(r.entries[0].opponent_handle).toBe(pOpp.handle);
  });

  it('returns empty array when player has no points entries', async () => {
    const clerkId = `mp2-${uuidv7().slice(0, 8)}`;
    const [u] = await db.insert(users).values({ clerk_id: clerkId, email: `${clerkId}@x` }).returning();
    await db.insert(players).values({ user_id: u.id, handle: `me2-${clerkId.slice(-8)}`, display_name: 'Me2', tier: 'bronze' });
    const r = await getMyPointsHistory(clerkId, 50);
    expect(r.entries.length).toBe(0);
  });
});
```

This test exercises a `getMyPointsHistory(clerkUserId, limit)` server function. We put it in a new file `src/features/profiles/actions.ts` if one doesn't already exist; if `src/features/profiles/` already has an `actions.ts`, append.

- [ ] **Step 2: Run failing test**

```bash
npm run test:integration -- me-points
```
Expected: FAIL.

- [ ] **Step 3: Implement getMyPointsHistory**

Create or extend `src/features/profiles/actions.ts`:

```ts
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  matches,
  players,
  points_ledger,
  tournaments,
  users,
} from '@/models/Schema';
import type { Tier } from '@/features/profiles/types';

export type PointsHistoryEntry = {
  id: string;
  match_id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_slug: string;
  opponent_handle: string;
  opponent_display_name: string;
  points: number;
  earned_at: Date;
  running_total: number;
};

export type MyPointsResult = {
  entries: PointsHistoryEntry[];
  total: number;
  player_id: string | null;
  player_handle: string | null;
  player_display_name: string | null;
  player_tier: Tier | null;
};

/**
 * Returns the signed-in player's most recent points-ledger entries with
 * tournament + opponent context, ordered newest first. Running totals are
 * computed in the order of return (newest entry shows current total). Also
 * returns the player's header metadata (display name, tier, total) so the
 * page can render the header block in a single round trip plus query batch.
 */
export async function getMyPointsHistory(
  clerkUserId: string,
  limit: number = 50,
): Promise<MyPointsResult> {
  const empty: MyPointsResult = {
    entries: [],
    total: 0,
    player_id: null,
    player_handle: null,
    player_display_name: null,
    player_tier: null,
  };
  const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkUserId)).limit(1);
  if (!u) return empty;

  const [p] = await db.select().from(players).where(eq(players.user_id, u.id)).limit(1);
  if (!p) return empty;

  // Last N ledger rows for this player
  const ledger = await db
    .select({
      id: points_ledger.id,
      match_id: points_ledger.match_id,
      points: points_ledger.points,
      earned_at: points_ledger.earned_at,
    })
    .from(points_ledger)
    .where(eq(points_ledger.player_id, p.id))
    .orderBy(desc(points_ledger.earned_at))
    .limit(limit);

  if (ledger.length === 0) {
    return {
      entries: [],
      total: 0,
      player_id: p.id,
      player_handle: p.handle,
      player_display_name: p.display_name,
      player_tier: p.tier as Tier,
    };
  }

  // Total points across ALL ledger rows (not just the limit)
  const allLedger = await db
    .select({ points: points_ledger.points })
    .from(points_ledger)
    .where(eq(points_ledger.player_id, p.id));
  const total = allLedger.reduce((sum, e) => sum + Number(e.points), 0);

  // Hydrate match + tournament + opponent for each entry
  const matchIds = ledger.map((l) => l.match_id);
  const matchRows = await db
    .select({
      id: matches.id,
      team_a: matches.team_a,
      team_b: matches.team_b,
      tournament_id: matches.tournament_id,
    })
    .from(matches)
    .where(inArray(matches.id, matchIds));
  const matchMap = new Map(matchRows.map((m) => [m.id, m]));

  const tournamentIds = [...new Set(matchRows.map((m) => m.tournament_id))];
  const tournamentRows = await db
    .select({ id: tournaments.id, name: tournaments.name, slug: tournaments.slug })
    .from(tournaments)
    .where(inArray(tournaments.id, tournamentIds));
  const tournamentMap = new Map(tournamentRows.map((t) => [t.id, t]));

  // Resolve opponent player_ids: for each match, take the team this player is NOT in
  const opponentIds = new Set<string>();
  for (const m of matchRows) {
    const isInA = m.team_a.includes(p.id);
    const opp = isInA ? m.team_b : m.team_a;
    for (const id of opp) opponentIds.add(id);
  }
  const opponentRows = opponentIds.size > 0
    ? await db
        .select({ id: players.id, handle: players.handle, display_name: players.display_name })
        .from(players)
        .where(inArray(players.id, Array.from(opponentIds)))
    : [];
  const opponentMap = new Map(opponentRows.map((o) => [o.id, o]));

  // Build entries with running totals (descending order: newest first reflects current total)
  let runningTotal = total;
  const entries: PointsHistoryEntry[] = [];
  for (const l of ledger) {
    const m = matchMap.get(l.match_id);
    if (!m) continue;
    const t = tournamentMap.get(m.tournament_id);
    if (!t) continue;
    const isInA = m.team_a.includes(p.id);
    const oppIds = isInA ? m.team_b : m.team_a;
    const oppRow = oppIds.length > 0 ? opponentMap.get(oppIds[0]) : undefined;
    entries.push({
      id: l.id,
      match_id: l.match_id,
      tournament_id: t.id,
      tournament_name: t.name,
      tournament_slug: t.slug,
      opponent_handle: oppRow?.handle ?? '?',
      opponent_display_name: oppRow?.display_name ?? '?',
      points: Number(l.points),
      earned_at: l.earned_at,
      running_total: runningTotal,
    });
    runningTotal -= Number(l.points);
  }

  return {
    entries,
    total,
    player_id: p.id,
    player_handle: p.handle,
    player_display_name: p.display_name,
    player_tier: p.tier as Tier,
  };
}
```

Note: `points` is stored as a `numeric(8,2)` and returned as a string by drizzle. Coerce with `Number(...)` for arithmetic.

- [ ] **Step 4: Run integration tests, verify pass**

```bash
npm run test:integration -- me-points
```
Expected: 2 PASS.

- [ ] **Step 5: Implement the PointsHistory component**

```tsx
// src/features/profiles/components/PointsHistory.tsx
import Link from 'next/link';
import type { PointsHistoryEntry } from '@/features/profiles/actions';

function formatDate(d: Date): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  if (days < 7) {
    if (days < 1) return 'today';
    const rounded = Math.round(days);
    return rounded === 1 ? 'yesterday' : `${rounded} days ago`;
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PointsHistory({ entries }: { entries: PointsHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="mute" style={{ marginTop: '2em' }}>
        No points history yet. Play a tournament to start earning.
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <table className="table desktop-only" style={{ marginTop: '1.5em' }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Change</th>
            <th>Running total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const isGain = e.points > 0;
            const verb = isGain ? 'Earned' : 'Lost';
            return (
              <tr key={e.id}>
                <td className="mute">{formatDate(e.earned_at)}</td>
                <td>
                  {verb} in{' '}
                  <Link href={`/t/${e.tournament_slug}`}>{e.tournament_name}</Link>{' '}
                  vs <Link href={`/p/${e.opponent_handle}`}>{e.opponent_handle}</Link>
                </td>
                <td className={isGain ? 'fn-green font-bold' : 'fn-red font-bold'}>
                  {isGain ? '+' : ''}{e.points}
                </td>
                <td>{e.running_total}</td>
                <td style={{ textAlign: 'right', width: '56px' }}>
                  <Link href={`/match/${e.match_id}`} className="btn-link">→</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile card variant */}
      <div className="mobile-only" style={{ marginTop: '1.5em' }}>
        {entries.map((e) => {
          const isGain = e.points > 0;
          const verb = isGain ? 'Earned' : 'Lost';
          return (
            <div key={e.id} className="rule-bottom" style={{ padding: '0.75em 0' }}>
              <p className="mute" style={{ fontSize: '0.85em' }}>{formatDate(e.earned_at)}</p>
              <p>
                {verb} in{' '}
                <Link href={`/t/${e.tournament_slug}`}>{e.tournament_name}</Link>{' '}
                vs <Link href={`/p/${e.opponent_handle}`}>{e.opponent_handle}</Link>
              </p>
              <p>
                <span className={isGain ? 'fn-green font-bold' : 'fn-red font-bold'}>
                  {isGain ? '+' : ''}{e.points}
                </span>
                {' '}
                <span className="mute">running: {e.running_total}</span>
                {' '}
                <Link href={`/match/${e.match_id}`} className="btn-link" style={{ float: 'right' }}>→</Link>
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 6: Implement the /me/points page**

```tsx
// src/app/me/points/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { getMyPointsHistory } from '@/features/profiles/actions';
import { PointsHistory } from '@/features/profiles/components/PointsHistory';
import { TierBadge } from '@/components/TierBadge';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My points · Padel-Z',
};

export default async function MyPointsPage() {
  const { userId: clerkId } = await auth();
  // Middleware should have redirected anonymous users; defense in depth: 404 if missing
  if (!clerkId) notFound();

  const { entries, total, player_display_name, player_tier } = await getMyPointsHistory(clerkId, 50);

  // Player not yet created via webhook (shouldn't happen post-Clerk webhook but defense in depth)
  if (!player_display_name) notFound();

  return (
    <main className="px-4 pb-8">
      <p>{player_display_name}</p>
      {player_tier ? <p style={{ marginTop: '0.5em' }}><TierBadge tier={player_tier} /></p> : null}
      <p className="mute" style={{ marginTop: '0.5em' }}>
        {total} total points · last 50 entries
      </p>
      <hr className="rule" style={{ margin: '1.5em 0' }} />
      <PointsHistory entries={entries} />
    </main>
  );
}
```

Spec §6.1 originally included a "Rank N of N" line in the header. For MVP we defer the rank computation (would require a per-tier `COUNT(*)` + ranked subquery against the leaderboard view). The total + tier badge alone communicate enough; rank ships in a post-MVP follow-up. If `TierBadge` import path is `@/features/profiles/components/TierBadge` instead of `@/components/TierBadge`, adjust — read the existing import in `src/app/leaderboard/page.tsx` for the canonical path.

- [ ] **Step 7: Check-types + build**

```bash
npm run check-types && npm run build
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/features/profiles/actions.ts src/features/profiles/components/PointsHistory.tsx src/app/me/points/page.tsx tests/integration/me-points.test.ts
git commit -m "feat(profiles): me points history page with running totals"
```

### Task 3.4: E2E smoke for leaderboard filter

**Files:**
- Create: `tests/e2e/leaderboard-filter.spec.ts`

**Spec reference:** §6.4.

- [ ] **Step 1: Write the Playwright spec**

```ts
// tests/e2e/leaderboard-filter.spec.ts
import { test, expect } from '@playwright/test';

test.describe('leaderboard tier filter', () => {
  test('renders six filter links on the leaderboard page', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByRole('link', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bronze' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Silver' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Gold' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Platinum' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Diamond' })).toBeVisible();
  });

  test('clicking Bronze navigates to /leaderboard?tier=bronze', async ({ page }) => {
    await page.goto('/leaderboard');
    await page.getByRole('link', { name: 'Bronze' }).click();
    await expect(page).toHaveURL(/\/leaderboard\?tier=bronze/);
  });

  test('invalid tier param renders unfiltered leaderboard', async ({ page }) => {
    await page.goto('/leaderboard?tier=banana');
    await expect(page).toHaveURL(/\/leaderboard\?tier=banana/);
    // Should still render the filter row (All is selected because tier is invalid)
    await expect(page.getByRole('link', { name: 'All' })).toBeVisible();
  });

  test('/me/points requires auth', async ({ page }) => {
    const r = await page.goto('/me/points');
    expect(page.url().match(/\/sign-in/) || r?.status() === 404).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the spec**

```bash
npm run test:e2e -- leaderboard-filter
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/leaderboard-filter.spec.ts
git commit -m "test(e2e): leaderboard tier filter and me-points auth gate"
```

### Task 3.5: Phase 3 manual smoke gate

- [ ] **Step 1: Tew visits `/leaderboard` and confirms the six-tier filter row renders correctly on desktop AND mobile**

Expected: All · Bronze · Silver · Gold · Platinum · Diamond visible, currently selected one is `.fn-blue.font-bold`. Wraps cleanly on mobile (≤720px).

- [ ] **Step 2: Tew clicks Bronze**

Expected: URL becomes `/leaderboard?tier=bronze`. Only bronze players shown. "All" link returns to unfiltered.

- [ ] **Step 3: Tew clicks Diamond**

Expected: URL becomes `/leaderboard?tier=diamond`. Diamond players shown (or empty-state copy if none seeded yet).

- [ ] **Step 4: Tew signs in and navigates to `/me/points`**

Expected: page renders. If Tew has ledger entries (from a played tournament): list shows them with date, opponent, tournament, +/- points, running total. If no entries: empty-state copy "No points history yet."

- [ ] **Step 5: Anonymous visitor tries `/me/points`**

Expected: redirected to `/sign-in` by middleware.

- [ ] **Step 6: Mobile card variant smoke**

Tew opens `/me/points` on iPhone 15 Pro Max. Expected: cards stack vertically with date as small mute label, description as 24px body, change + running total inline below, arrow tap-target right side at 44pt.

If any step fails, stop and surface to Tew. Phase 3 is the final feature phase before the launch gate flip.

---

## Chunk 4: Final smoke and launch flip

After all three phases pass automated tests + reviewer subagents + manual smoke gates, Tew performs the final launch ritual. Implementer agent's job is just to set up the gate ritual; the actual flip is human-only.

### Task 4.1: Final pre-flip walkthrough as a fresh user

- [ ] **Step 1: Open `https://padelz-v1.vercel.app` in Incognito mode with no Clerk session**

Expected: redirected to `/coming-soon`. Verify holding screen renders.

- [ ] **Step 2: Sign up as a brand-new fresh user**

Use an email address not already tied to a Clerk account (try a `+test1` alias on your own email if you've already burned the main one).

Expected: Clerk signup flow completes. After signup, you should land on `/` (the real landing, because middleware lets authenticated visitors through regardless of gate state).

Verify in the database (via Vercel logs or Neon dashboard): a new row appears in `users` and `players` (created by the webhook).

- [ ] **Step 3: Browse public surfaces**

Visit `/leaderboard`, `/t`, `/t/[slug]` for a published tournament you created in Phase 1 manual smoke. Use the tier filter. Verify the surfaces feel complete.

- [ ] **Step 4: Register for the test tournament**

Click Register on a published tournament. Verify your handle appears in the registered roster on `/t/[slug]` and on `/c/[slug]/admin/tournaments/[id]` (as the admin viewing from a separate Incognito session).

- [ ] **Step 5: As the admin (separate session), generate the bracket**

Generate bracket via preview → confirm flow. Verify the public `/t/[slug]` now shows the bracket below the roster.

- [ ] **Step 6: As the test user, submit a score for a match you're in**

Use the `/match/[id]/submit` flow. The existing submit + confirm pipeline is unchanged in this build; it should still work end-to-end.

- [ ] **Step 7: As the admin, run leaderboard recompute via the existing cron endpoint (one-time manual trigger)**

```bash
curl -X POST 'https://padelz-v1.vercel.app/api/cron/leaderboard' \
  -H "Authorization: Bearer $CRON_SECRET"
```

Or wait for the next scheduled cron run. Verify the test user's points appear on `/leaderboard?tier=bronze` (or whatever tier).

- [ ] **Step 8: As the test user, navigate to `/me/points`**

Verify the points history shows the ledger entry from Step 6.

- [ ] **Step 9: Take screenshots of each surface**

`/coming-soon` (Incognito), `/` (signed in), `/t`, `/t/[slug]` with bracket, `/leaderboard?tier=bronze`, `/me/points`, an admin tournament detail page. These are launch-day proof. Save to a folder for the Tew post-launch summary.

If any step in this walkthrough fails: STOP. Do not flip the gate. File the bug, fix forward, re-run from Step 1.

### Task 4.2: Flip NEXT_PUBLIC_BETA_OPEN to true

- [ ] **Step 1: In Vercel dashboard, change `NEXT_PUBLIC_BETA_OPEN` from `false` to `true`**

Vercel → `proxyz-s-projects/padelz-v1` → Settings → Environment Variables → Production scope → edit `NEXT_PUBLIC_BETA_OPEN`.

- [ ] **Step 2: Trigger a redeploy**

Either push a trivial commit to `main` (e.g., bump a comment) OR use the Vercel dashboard "Redeploy" button on the latest production deployment. Either way, Vercel rebuilds and picks up the new env var.

Wait ~60 to 90 seconds for the new deployment to reach the production alias.

- [ ] **Step 3: Verify in a fresh Incognito window**

Open `https://padelz-v1.vercel.app/` in Incognito with NO Clerk session.

Expected: the real landing page renders. NOT `/coming-soon`.

If you still see `/coming-soon`: the deployment didn't promote, or the env var didn't take effect. Check Vercel deployment logs and the env var screen. Don't proceed until the live URL renders the real landing for anonymous visitors.

- [ ] **Step 4: Take the final launch screenshot**

Screenshot the real landing page from Incognito. This is the "we shipped" moment. Save it to the launch-day folder.

### Task 4.3: Rollback procedure if anything wobbles post-flip

If a bug surfaces after the flip and is user-facing (broken signup, crashed page, exposed PII), flip back immediately:

- [ ] **Step 1: Set `NEXT_PUBLIC_BETA_OPEN=false` in Vercel production env**

- [ ] **Step 2: Trigger redeploy**

Same mechanism as 4.2 Step 2. ~60 seconds for the alias to reflect.

- [ ] **Step 3: Verify Incognito sees `/coming-soon` again**

The public sees the holding screen. Existing signed-in users keep their session and continue to see the real app — middleware doesn't kick them out. They can continue testing.

- [ ] **Step 4: Fix forward on `main`**

Use the rollback pause to fix the bug. Re-run Task 4.1 smoke walkthrough. Re-flip via Task 4.2.

### Task 4.4: Post-launch follow-up tasks

These ship in a separate plan after the MVP is stable for at least 48 hours of public traffic:

- [ ] Add Clerk-authenticated E2E flow that exercises the full create → publish → edit → delete cycle (deferred from Task 1.11)
- [ ] Add `match_results` JOIN to the public `/t/[slug]` bracket render so scores + status appear correctly (deferred from Task 2.4)
- [ ] Add rank computation to `/me/points` header (deferred from Task 3.3)
- [ ] Pagination on `/me/points` if real users exceed 50 ledger entries
- [ ] Maskable icon Android safe-zone padding (HANDOFF §4 open follow-up)
- [ ] `lighthouserc.js` `preset: 'mobile'` invalid setting fix (HANDOFF §4)
- [ ] Speed Index investigation on `/` (HANDOFF §4)
- [ ] Cancel-bracket admin flow (instead of the SQL manual override documented in spec §10)
- [ ] Dependabot PRs #1 through #4

End of plan.
