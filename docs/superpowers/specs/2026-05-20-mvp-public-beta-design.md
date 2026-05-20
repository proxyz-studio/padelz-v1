# Padel-Z MVP Public Beta — Design

> Date: 2026-05-20 | Author: Tew + Claude | Status: Draft, pending reviewer + user approval

## 1. Goal

Ship the full feature surface required to let anyone in Phuket sign up, register for a tournament, see their bracket, submit and confirm scores, and watch their points move on the leaderboard. Land everything behind a coming-soon gate (`NEXT_PUBLIC_BETA_OPEN`), smoke-test on iPhone, then flip a single env var to open the gates.

**Approach:** Phased build with coming-soon gate. Every commit ships to `origin/main` and auto-deploys to Vercel, but the public-facing landing page shows a holding screen until smoke tests pass. The flip is one env var, reversible in ~60 seconds.

**Constraint:** Don't mess up architecture that already works. Extend existing patterns; don't refactor what's there. The 240 existing tests must stay green.

## 2. Scope

### 2.1 In scope (must ship)

- Coming-soon gate via `NEXT_PUBLIC_BETA_OPEN` env var, enforced in middleware
- Clerk middleware turned on with real Clerk env vars in Vercel production
- Rate limit on `/api/webhook/clerk` and `registerForTournament` server action
- Admin tournament CRUD: create, edit, delete (with `status='open'` precondition on edit and delete)
- Admin BracketBuilder: trigger button + preview page that calls existing `generateBracket` server action
- Public BracketView: read-only render of bracket data on `/t/[slug]`
- Leaderboard tier filter: segmented control (`all` · `bronze` · `silver` · `gold` · `platinum`) via URL search param
- `/me/points` history page: chronological points-ledger view for the signed-in user
- Tests + smoke gates for every new flow

### 2.2 Out of scope (deferred to post-MVP)

- Push or email notifications
- Onboarding wizard ("set your home club")
- Profile edit UI
- Admin user management (kick, suspend, role assignment)
- Multi-club discovery / club admin self-onboarding
- HANDOFF §4 open follow-ups except SW Sentry capture (which is a one-liner, gets included incidentally in Phase 1)
- Dependabot PRs #1-#4

### 2.3 Architecture stays untouched

- Tailwind v4 config, design tokens, AGENTS.md single-spec discipline
- Existing routes, layouts, components — we extend, we don't refactor
- Schema — we add no migrations unless a discovered gap forces it
- Scoring math, leaderboard recompute logic, cron endpoints
- PWA infra: service worker, manifest, icons (last night's work)
- The 240 existing unit + integration tests stay green

## 3. Architecture

### 3.1 File map

```
src/
├── middleware.ts                              ← NEW (Clerk + beta gate)
├── app/
│   ├── page.tsx                               ← EDIT: middleware handles the redirect; no body change
│   ├── coming-soon/page.tsx                   ← NEW: holding screen
│   ├── me/
│   │   └── points/page.tsx                    ← NEW: points history (Phase 3)
│   ├── leaderboard/page.tsx                   ← EDIT: add tier filter (Phase 3)
│   ├── t/[slug]/page.tsx                      ← EDIT: render bracket if exists (Phase 2)
│   └── c/[slug]/admin/tournaments/
│       ├── new/page.tsx                       ← NEW: create form (Phase 1)
│       └── [id]/
│           ├── page.tsx                       ← NEW: admin detail + bracket trigger (Phase 1+2)
│           ├── edit/page.tsx                  ← NEW: edit form (Phase 1)
│           ├── bracket/preview/page.tsx       ← NEW: preview page (Phase 2)
│           └── scores/page.tsx                ← EXISTING (untouched)
├── features/
│   ├── tournaments/
│   │   ├── actions.ts                         ← EDIT: add updateTournament, deleteTournament
│   │   ├── bracket.ts                         ← EXISTING (untouched)
│   │   └── components/
│   │       ├── TournamentForm.tsx             ← NEW: shared create/edit form
│   │       ├── BracketView.tsx                ← NEW: public read-only view
│   │       └── BracketBuilder.tsx             ← NEW: admin trigger button + state machine
│   ├── leaderboard/
│   │   └── components/TierFilter.tsx          ← NEW
│   └── profiles/
│       └── components/PointsHistory.tsx       ← NEW
└── libs/
    └── ratelimit.ts                           ← EDIT: enable real limiter for signup + register
```

### 3.2 Architectural anchors

1. **Middleware as the single gate.** `src/middleware.ts` does two jobs in one file: Clerk auth on protected routes (`/c/(.*)/admin(.*)`, `/match/(.*)/(submit|confirm)`, `/me(.*)`) and beta gate on `/` for anonymous visitors when `NEXT_PUBLIC_BETA_OPEN !== 'true'`. Public routes (`/leaderboard`, `/t`, `/t/[slug]`, `/p/[handle]`, `/sign-in`, `/coming-soon`) stay open. Authenticated users always see the real app, regardless of gate state — Tew can poke at the live build before flipping.

2. **Server actions stay the boundary.** Every new UI calls existing or new server actions in `features/*/actions.ts`. No direct DB calls from page components. Two new actions only: `updateTournament` and `deleteTournament` (the latter with a `status='open'` AND zero-matches precondition).

3. **Bracket as data, view as derivation.** `bracket.ts` already returns `BracketData` (either `FlatBracketData` or `RoundBracketData`). `BracketView` and the preview page both render this same shape. The admin trigger calls `generateBracket(tournament_id)` which writes to `brackets.data` (jsonb) AND derives + inserts `matches` rows in a single transaction. Public view reads `brackets.data`. No duplication.

## 4. Phase 1 — Auth, gate, and admin tournament CRUD

### 4.1 The five pieces

1. **Real Clerk env vars in Vercel production.**
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `CLERK_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_BETA_OPEN=false` (initial value)
   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (for rate limit) — if Upstash setup is too much friction, fall back to in-memory LRU
   - The existing webhook at `src/app/api/webhook/clerk/route.ts` and the `handleClerkEvent` handler already work; they just need real secrets.

2. **`src/middleware.ts` (new).**
   - Uses `clerkMiddleware` + `createRouteMatcher`
   - `isProtectedRoute` matcher: `/c/(.*)/admin(.*)`, `/match/(.*)/(submit|confirm)`, `/me(.*)` → `auth.protect()` (302 to `/sign-in` on miss)
   - `isPublicLanding` matcher: `/` → if `process.env.NEXT_PUBLIC_BETA_OPEN !== 'true'` AND `auth().userId == null` → redirect to `/coming-soon`
   - Everything else flows through unchanged

3. **`/coming-soon` page (new).**
   - Pure server component, no client JS
   - Honors AGENTS.md single-spec: white bg, Inter 400 24px, `-0.72px` tracking
   - Body copy: `Padel-Z — Phuket's padel community. Opening soon.` with `Z` in `.pink.font-bold`
   - `.mute` line below: `Got an invite link? Sign in →` linking to `/sign-in` so beta testers (Tew) can still get in

4. **Rate limit (`src/libs/ratelimit.ts` — edit).**
   - Replace stub with `@upstash/ratelimit` against Upstash Redis (or in-memory LRU fallback)
   - Two limiters:
     - `signup`: 5/min per IP, applied at `/api/webhook/clerk` route handler
     - `register`: 10/min per user, applied at top of `registerForTournament` action
   - On limit hit: 429 with `Retry-After` header; UI surfaces "Slow down — try again in a minute." in `.fn-red.font-bold`
   - The existing 1 skipped ratelimit stub test unskips and runs against the real limiter

5. **Admin tournament CRUD.**
   - **`TournamentForm.tsx` (new)** — shared form for create and edit. Fields: name (text), format (select: `round_robin` · `americano` · `mexicano`), tournament_type (select: `club_internal` · `open`), start_at (datetime-local). Native HTML form, no client state. Submit uses `formAction` to a server action passed in as a prop.
   - **`/c/[slug]/admin/tournaments/new/page.tsx` (new)** — wraps `TournamentForm`, calls `createTournament` (existing) on submit.
   - **`/c/[slug]/admin/tournaments/[id]/page.tsx` (new)** — admin home for one tournament. Shows tournament info, registered players, status. Conditional action buttons:
     - `status='open'` + ≥2 players → `.btn-link.fn-blue.font-bold` "Generate bracket →" (Phase 2)
     - `status='open'` + <2 players → `.mute` "Need at least 2 registered players"
     - `status='open'` (always) → `.btn-link` "Edit →"
     - `status='open'` + zero matches → `.btn-link.fn-red.font-bold` "Delete"
     - `status='in_progress'` → `.btn-link` "View bracket →" + `.btn-link.fn-blue` "Manage scores →"
     - `status='complete'` → `.mute` "Tournament complete"
   - **`/c/[slug]/admin/tournaments/[id]/edit/page.tsx` (new)** — wraps `TournamentForm` pre-populated, calls `updateTournament` on submit.
   - **`updateTournament` action (new in `actions.ts`)** — precondition: `status='open'`. Validates via Zod schema (same fields as create). Returns updated row. Revalidates `/c/[slug]/admin/tournaments/[id]` and `/t/[slug]`.
   - **`deleteTournament` action (new in `actions.ts`)** — preconditions: `status='open'` AND zero matches inserted. Cascade-deletes via FK (`brackets`, `registrations`, `matches` already cascade on tournament delete per schema verification). Returns `{ success: true }`. Redirects caller to `/c/[slug]`.

### 4.2 Auth model the new admin pages enforce

Every admin route does:

```ts
const { userId } = auth();
if (!userId) return notFound();
const user = await db.query.users.findFirst({ where: eq(users.clerk_id, userId) });
if (!user) return notFound();
const membership = await db.query.club_memberships.findFirst({
  where: and(eq(club_memberships.user_id, user.id), eq(club_memberships.club_id, club.id), eq(club_memberships.role, 'admin'))
});
if (!membership) return notFound();
```

Non-admins get 404, not 403 — we don't disclose the existence of the club's admin area. This pattern is already used in `/c/[slug]/admin/tournaments/[id]/scores/page.tsx`; copy verbatim.

### 4.3 Error handling

- Form validation lives in the existing Zod schemas in `actions.ts`. On failure, the action returns `{ error: string }`; the page reads it from a redirect search param and surfaces inline above the form in `.fn-red`.
- Rate-limit hit: 429 with `Retry-After`. UI shows the copy above in `.fn-red.font-bold`.
- Delete on tournament with matches: action throws with `"Cannot delete a tournament with matches recorded. Cancel it instead."` Surfaced inline.

### 4.4 Phase 1 tests

- **Unit (new):** `updateTournament` happy path + `status≠open` precondition; `deleteTournament` happy path + `status≠open` precondition + zero-matches precondition (4 tests)
- **Integration (new):** middleware redirects anonymous `/` → `/coming-soon` when gate is off; middleware lets authenticated users through; admin route 404s for non-admin (3 tests)
- **E2E (new Playwright):** admin signs in (stub Clerk in test env) → creates tournament → edits → tries delete with scores (blocked) → deletes without scores; anonymous user blocked from `/`; rate limit triggers on rapid-fire register clicks (3 tests)

### 4.5 Phase 1 size

~8 new files, 2 edited files, ~700 lines of new code, ~10 new tests. ~4 to 6 hours of subagent time.

## 5. Phase 2 — BracketBuilder + Public BracketView

### 5.1 The four pieces

1. **Admin BracketBuilder entry point.** Defined in Phase 1's admin detail page (`/c/[slug]/admin/tournaments/[id]`); the button's destination is the preview page below.

2. **Bracket preview page (`/c/[slug]/admin/tournaments/[id]/bracket/preview/page.tsx`).**
   - Two-step commit pattern, fully server-rendered, no client JS
   - Reads registered players from the tournament, calls `generateBracketData(players, format)` *without writing*
   - Renders the same `BracketView` component the public will see
   - Two buttons at the bottom:
     - `.btn-link` "← Cancel" → back to admin detail
     - `.btn-link.fn-green.font-bold` "Confirm and lock tournament" → form submits to `generateBracket` server action
   - On success: redirect to admin detail page

3. **`BracketView.tsx` component (new, `src/features/tournaments/components/`).**
   - Props: `bracket: BracketData`, `matches: Map<uuid, Match>`, `players: Map<uuid, Player>`, optional `currentUserPlayerId: uuid | null`
   - **`FlatBracketData`:** single `.table` of matches. Columns: `Team A · Team B · Score · →`
   - **`RoundBracketData`:** section per round. `.mute` "Round N" label, then `.table` below
   - Winning team's score: `.fn-green.font-bold`. Losing: default. Disputed: row marked `.fn-red.font-bold` "Disputed" in score column
   - Arrow column: links to `/match/[id]` (read-only). If `currentUserPlayerId` is in `team_a` or `team_b` AND status is pending: link to `/match/[id]/submit` instead with `.fn-blue.font-bold` "Submit score →"
   - Mobile (≤720px): twin-render. `desktop-only` table + `mobile-only` card stack per match: Team A line, `vs` divider, Team B line, score row, 44pt arrow right side

4. **Public tournament detail page (`/t/[slug]/page.tsx` — edit).**
   - Below the existing registered-players roster, render the bracket if one exists
   - One query block at the top of the server component pulls: bracket + matches + player names lookup
   - Pass to `<BracketView>` with `currentUserPlayerId` resolved from `auth()` if signed in
   - If no bracket: `.mute` "Bracket not yet generated. Registration closes when the admin locks it."
   - `status='open'`: keep existing `<RegisterButton>` visible
   - `status='in_progress'`: hide register button, show "Registration closed" in `.mute`

### 5.2 Data flow at bracket-generation time

```
admin clicks "Generate bracket →" on detail page
  → 302 /c/[slug]/admin/tournaments/[id]/bracket/preview
  → server reads players + format, calls generateBracketData() (read-only)
  → renders <BracketView> with preview data + "Confirm" button
  → admin clicks Confirm
  → POST to generateBracket server action
    → re-validates: tournament status='open', club admin role
    → calls generateBracketData() again (idempotent, deterministic for round-robin)
    → BEGIN tx
      → insert brackets row (data = jsonb)
      → insert matches rows derived from bracket.matches
      → update tournaments.status = 'in_progress'
    → COMMIT
  → revalidatePath('/c/[slug]/admin/tournaments/[id]')
  → revalidatePath('/t/[slug]')
  → 302 back to admin detail page
```

### 5.3 Public BracketView data flow

```
visitor → /t/[slug]
  → server queries:
      tournaments.findFirst({where: slug})
      registrations + players where tournament_id (existing)
      brackets.findFirst({where: tournament_id}) ← NEW
      matches.findMany({where: tournament_id}) ← NEW
      players lookup for all player_ids in bracket ← NEW (one IN query)
  → pass to <BracketView>
  → renders deterministically from server data, no client fetch
```

### 5.4 Error handling

- Preview page with status≠'open' → 404 (someone bookmarked an old URL)
- `generateBracket` failure mid-transaction → action returns `{ error }`. Preview page surfaces "Could not generate bracket — try again or contact support." in `.fn-red`. Transaction rolls back; no half-state
- Match link for an anonymous viewer → no "Submit" link rendered (only "View" if applicable)

### 5.5 Regeneration policy (decision)

**Strict.** Once a bracket is committed, the only way to undo is to delete the tournament (Phase 1 capability, gated on `status='open'` AND zero matches — which means we need to delete BEFORE generating, not after). If admin generates and immediately regrets, options:
- Tournament hasn't moved past status='open' yet? Generate already flipped it to in_progress, so delete is blocked. They have to manually update status back to open via SQL — acceptable rare admin override.
- Better path post-MVP: add a "Cancel bracket" action that reverts status + deletes brackets/matches rows. Deferred.

### 5.6 Phase 2 tests

- **Unit (new):** `BracketView` snapshot for `FlatBracketData` shape; same for `RoundBracketData` shape; preview page renders without writing to DB (3 tests)
- **Integration (new):** `generateBracket` action — happy path, status-not-open precondition, fewer-than-2-players precondition (3 tests)
- **E2E (new Playwright):** admin previews bracket → confirms → bracket appears on public `/t/[slug]`; player in a match sees Submit link; player not in match doesn't (2 tests)

### 5.7 Phase 2 size

~4 new files, 2 edited files, ~500 lines new, ~8 new tests. ~3 to 4 hours of subagent time.

## 6. Phase 3 — Leaderboard tier filter + /me/points history

### 6.1 The two pieces

1. **Leaderboard tier filter (`src/app/leaderboard/page.tsx` — edit).**
   - Add a filter row above the leaderboard rendered as five `<a>` links using `.btn-link` style: `All · Bronze · Silver · Gold · Platinum`
   - Selected state: `.fn-blue.font-bold` (UI-state indicator; AGENTS.md's pink reservation stays intact)
   - Filter applied via URL search param: `/leaderboard?tier=bronze`
   - No client JS. Each click is a full server navigation. Existing query gets `WHERE players.tier = $1` appended when the param is set
   - Invalid tier param → ignore, render unfiltered (forgiving)
   - Empty result state: `.mute` "No players at this tier yet."
   - Mobile: filter row wraps but otherwise unchanged
   - **Component:** `src/features/leaderboard/components/TierFilter.tsx` — pure server component, props `currentTier?: Tier`, `basePath: string`. Renders 5 links.

2. **`/me/points` history page (new).**
   - Auth-required (middleware enforces via `/me(.*)` matcher)
   - **Header block:**
     - Pulls signed-in user's `player` row + current points total + current rank (subquery against the leaderboard view if exists; else compute inline)
     - Renders: display name in 24px default, `<TierBadge>` below, `.mute` line "47 points · Rank 12 of 88"
   - **Activity table:**
     - Pulls last 50 entries from `points_ledger` JOIN `matches` JOIN `tournaments` JOIN `players` (for opponent names), ordered by `created_at DESC`
     - Columns: Date · Description · Change · Running total · →
       - Date: relative ("3 days ago") if within 7 days, else "May 18, 2026"
       - Description: "Beat [opponent_handle] in [tournament_name]" or "Lost to [opponent_handle]" — opponent links to `/p/[handle]`, tournament links to `/t/[slug]`
       - Change: `+5` in `.fn-green.font-bold` or `-3` in `.fn-red.font-bold`
       - Running total: integer in default treatment
       - Arrow: links to `/match/[id]`
     - Empty state: full-width `.mute` "No points history yet. Play a tournament to start earning."
     - Mobile (≤720px): twin-render. `mobile-only` card per entry: date as small `.mute`, description as 24px body, change + running-total inline below
   - **50-entry cap:** MVP. Pagination is post-MVP if real users hit the limit.

### 6.2 Data flow

```
visitor → /leaderboard?tier=silver
  → server reads searchParams.tier
  → existing leaderboard query gets WHERE clause
  → renders <TierFilter currentTier="silver" /> + existing leaderboard
  → no extra queries beyond what's already there

signed-in user → /me/points
  → middleware: auth.protect() (gated by Phase 1 middleware)
  → page server-side:
      auth().userId → users.findFirst(clerk_id) → player row
      points_ledger.findMany({where: user_id, limit: 50, orderBy: created_at desc, with: {match, tournament, opponent}})
      compute running totals (cumulative sum, server-side)
  → renders header + activity table
```

### 6.3 Error handling

- Tier param not in enum → ignore, render unfiltered (forgiving)
- Empty points history for a real user → empty state copy
- User not found (shouldn't happen post-Clerk-webhook) → 500 with Sentry capture

### 6.4 Phase 3 tests

- **Unit (new):** `TierFilter` renders correctly for each tier and "all" state (5 tests)
- **Integration (new):** leaderboard query honors tier filter; `/me/points` query returns ordered + limited rows (2 tests)
- **E2E (new Playwright):** signed-in user navigates to `/me/points`, sees their entries; anonymous user redirected to `/sign-in`; tier filter changes URL + filters leaderboard rows (3 tests)

### 6.5 Phase 3 size

~2 new files, 1 edited file, ~300 lines new, ~10 new tests. ~2 to 3 hours of subagent time.

## 7. Testing strategy + smoke gates

### 7.1 Test pyramid (built on the existing 240 passing + 13 E2E baseline)

| Layer | Phase 1 | Phase 2 | Phase 3 | Total new |
|---|---|---|---|---|
| Unit | 4 | 3 | 5 | 12 |
| Integration | 3 | 3 | 2 | 8 |
| E2E (Playwright) | 3 | 2 | 3 | 8 |

End state: ~280 total (~260 unit + integration, ~21 E2E). Zero regression on the existing 240 is a merge blocker.

### 7.2 CI gates per phase (no merge unless all pass)

- `check-types` clean
- `lint` clean
- `test` — full suite green, including new tests
- `build` — production build clean
- Spec compliance + code quality reviewer subagents approve each chunk before merge to `main`
- Lighthouse re-run after each phase. New routes (`/coming-soon`, `/c/[slug]/admin/tournaments/new`, `/c/[slug]/admin/tournaments/[id]`, `/c/[slug]/admin/tournaments/[id]/edit`, `/c/[slug]/admin/tournaments/[id]/bracket/preview`, `/me/points`) added to audit set. Budgets stay green: FCP <1500 · LCP <2500 · TBT <200 · CLS <0.1

### 7.3 Manual smoke gates per phase (Tew on iPhone 15 Pro Max)

**After Phase 1:**
1. Anonymous visitor at `/` redirects to `/coming-soon`
2. Sign in via real Clerk → land on the real `/`
3. Create a tournament via `/c/[slug]/admin/tournaments/new` → see it on `/t`
4. Edit it → name change reflected on public page
5. Delete with no scores → succeeds; delete with scores → blocked with correct message
6. Spam-click register → rate limit kicks in with the right copy

**After Phase 2:**
1. As admin: `/c/[slug]/admin/tournaments/[id]` shows "Generate bracket →" once ≥2 players registered
2. Preview page renders without writing to DB
3. Confirm → bracket exists, status flips to `in_progress`, redirected to admin detail
4. Public `/t/[slug]` shows the bracket below the player roster
5. As a player in a match: see "Submit score" link; as a player not in: don't
6. Existing submit + confirm flow functions end-to-end

**After Phase 3:**
1. `/leaderboard?tier=silver` filters correctly on desktop AND mobile
2. `/me/points` shows my activity with correct date, opponent, tournament, deltas
3. Empty state for a freshly signed-up user
4. Mobile card variant on both pages renders without horizontal scroll

### 7.4 The flip-the-switch gate (Approach 1's defining moment)

Before flipping `NEXT_PUBLIC_BETA_OPEN=false → true` in Vercel:
1. Open `https://padelz-v1.vercel.app` in Incognito with no Clerk session → confirm holding screen
2. Sign up as a **fresh user** with an email not already on Clerk → walk the full journey: register for a tournament Tew created earlier, play it through (submit + confirm from a second device or second incognito with second account)
3. See your name on `/leaderboard`
4. See your activity on `/me/points`
5. Take screenshots — launch-day proof
6. Flip the env var. Vercel redeploys (~60s). Open Incognito again → real landing page visible. Take final screenshot.

If any step wobbles → don't flip. Fix forward. The bug is invisible to the public while the gate is up.

### 7.5 Rollback plan

- **Bug surfaces during a phase build, pre-merge:** reviewer subagent catches it OR Tew's smoke catches it. Fix on branch, re-review, then merge. Nothing on `main` is broken.
- **Bug surfaces after merge, pre-flip:** invisible to public (coming-soon gate covers it). Fix forward on `main`. Smoke again.
- **Bug surfaces post-flip:** flip `NEXT_PUBLIC_BETA_OPEN=true → false` in Vercel. Public sees coming-soon. Reversal time ~60s (redeploy duration). Fix forward on `main`, smoke, re-flip.

### 7.6 Sentry coverage

Existing Sentry init covers all routes; new server actions and middleware inherit. Knock out the open follow-up "SW registration errors → `Sentry.captureException`" incidentally during Phase 1 since it's a one-liner in `RegisterServiceWorker.tsx`. The other three open follow-ups (maskable icon padding, lighthouserc preset, Speed Index) stay deferred per §2.2.

## 8. Open decisions resolved during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Audience | Public beta, anyone in Phuket can sign up | Tew picked the biggest lift |
| Feature scope | Bracket UI + leaderboard tier filter + `/me/points` (the full M2.6 + M2.7 + M4.5 + M4.6 backlog) | Tew picked the biggest lift |
| Tournament create UX | Full CRUD: create + edit + delete | Tew picked the biggest lift |
| Bracket regeneration | Strict (delete-and-recreate) | Fewer code paths, easier to reason about, can iterate to permissive post-MVP |
| Launch posture | Approach 1: phased build with coming-soon gate | Lowest risk to architecture; reversible flip |

## 9. Build order summary

1. **Phase 1** — Auth + gate + admin CRUD (~700 LOC, ~10 tests, 4-6h subagent time)
2. **Phase 2** — BracketBuilder + BracketView (~500 LOC, ~8 tests, 3-4h)
3. **Phase 3** — Leaderboard filter + /me/points (~300 LOC, ~10 tests, 2-3h)

Total: ~1500 LOC new, ~28 new tests, 9-13 hours of subagent execution time. Plus reviewer + smoke time.

## 10. Inputs Tew needs to provide

- **Clerk production keys.** Created on Clerk dashboard. Pasted into Vercel Production environment scope.
- **Upstash Redis credentials.** OR confirmation that in-memory LRU fallback is acceptable for MVP rate limiting.
- **Confirmation of `NEXT_PUBLIC_BETA_OPEN=false` initial value** in Vercel env at the start of Phase 1. Flip to `true` only at end of §7.4.

## 11. What this spec does NOT do

It does not implement. The next step (per the brainstorming skill flow) is to invoke `superpowers:writing-plans` after Tew approves this spec, which produces the implementation plan with task breakdown and execution order. The plan informs the implementer subagents.

End.
