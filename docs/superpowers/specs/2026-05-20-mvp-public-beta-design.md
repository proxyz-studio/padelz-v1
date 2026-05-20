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
- Real Upstash Redis credentials in Vercel env to activate the existing rate limiter (`src/libs/RateLimit.ts` is already wired with `@upstash/ratelimit` and fails open on placeholder creds; flipping creds activates real enforcement with no code change)
- Wire the existing `rateLimit(ip, 'webhook')` call into the Clerk webhook route (currently not called)
- Admin tournament CRUD: create (lands in `status='draft'`), publish (`draft → open` transition), edit, delete (preconditions on each)
- Admin BracketBuilder: trigger button + preview page that calls the existing `generateBracket` server action (which we extend to add a status precondition + status transition)
- Public BracketView: read-only render of bracket data on `/t/[slug]`
- Leaderboard tier filter: segmented control (`all` · `bronze` · `silver` · `gold` · `platinum` · `diamond`) via URL search param
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
    ├── RateLimit.ts                           ← EXISTING (untouched in code, activated by Vercel env vars)
    └── Authz.ts                               ← EXISTING (untouched, used by new admin pages)
```

The webhook route at `src/app/api/webhook/clerk/route.ts` gets a small edit to call `rateLimit(ip, 'webhook')` before invoking `handleClerkEvent`. That's the only ratelimit code change.

### 3.2 Architectural anchors

1. **Middleware as the single gate.** `src/middleware.ts` does two jobs in one file: Clerk auth on protected routes (`/c/(.*)/admin(.*)`, `/match/(.*)/(submit|confirm)`, `/me(.*)`) and beta gate on `/` for anonymous visitors when `NEXT_PUBLIC_BETA_OPEN !== 'true'`. Public routes (`/leaderboard`, `/t`, `/t/[slug]`, `/p/[handle]`, `/sign-in`, `/coming-soon`) stay open. Authenticated users always see the real app, regardless of gate state — Tew can poke at the live build before flipping.

2. **Server actions stay the boundary.** Every new UI calls existing or new server actions in `features/*/actions.ts`. No direct DB calls from page components. Three new actions: `publishTournament` (transitions `draft → open`), `updateTournament` (edits fields when `status ∈ {draft, open}` and no matches), and `deleteTournament` (drops the tournament when `status ∈ {draft, open}` and zero rows in the `matches` table for this tournament). All three use the existing `assertClubAdmin(userId, clubId)` helper from `src/libs/Authz.ts` for authorization — same helper the existing scores admin page already uses.

3. **Bracket as data, view as derivation.** `bracket.ts` already returns `BracketData` (either `FlatBracketData` or `RoundBracketData`). The generation logic has zero randomness (verified by inspection — no `Math.random`, no `shuffle`), so the preview the admin sees and the bracket the action commits are byte-identical for the same input. `BracketView` and the preview page render this same shape. The admin confirm step calls the existing `generateBracket(tournament_id)` action — which we extend with a `status='open'` precondition and a status transition to `'in_progress'` within the existing transaction. Public view reads `brackets.data`. No duplication.

## 4. Phase 1 — Auth, gate, and admin tournament CRUD

### 4.1 The five pieces

1. **Real env vars in Vercel production.**
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (Clerk)
   - `CLERK_SECRET_KEY` (Clerk)
   - `CLERK_WEBHOOK_SECRET` (Clerk)
   - `NEXT_PUBLIC_BETA_OPEN=false` (initial value; flipped to `true` at end of §7.4)
   - `UPSTASH_REDIS_REST_URL` (real Upstash URL, not the `placeholder` value)
   - `UPSTASH_REDIS_REST_TOKEN` (real Upstash token, not `placeholder_token`)
   - `src/libs/RateLimit.ts` already detects placeholder values and activates real enforcement automatically once real values land. No code change required to "enable" the limiter.
   - The existing webhook handler at `src/app/api/webhook/clerk/route.ts` and `handleClerkEvent` already work; they just need real Clerk secrets to flow through.

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

4. **Rate limit — wire the one missing call site.**
   - `src/libs/RateLimit.ts` is already fully implemented with `@upstash/ratelimit`. It exposes five limiters: `score_submit`, `registration` (5/60s), `profile_edit`, `webhook` (100/60s), and `auth`. Sliding window. Fails open on placeholder credentials. No code change needed in this file.
   - `registerForTournament` already calls `rateLimit(ip, 'registration')` at the top (verified in actions.ts line 174).
   - The Clerk webhook route at `src/app/api/webhook/clerk/route.ts` does **not** yet call `rateLimit(ip, 'webhook')`. This is the only edit. Add the call before invoking `handleClerkEvent`. On limit hit (which only fires once real Upstash creds are live), return 429 with a `Retry-After` header.
   - UI copy for limit-hit responses surfaced by `registerForTournament`: "Slow down — try again in a minute." in `.fn-red.font-bold`.
   - The skipped ratelimit test (1 test) stays skipped in CI (still uses placeholder creds in CI env); manual smoke verifies limit hit against real Upstash after env vars land.

5. **Admin tournament CRUD.** The tournament lifecycle is `draft → open → in_progress → complete`. The admin form creates in `draft`; a Publish action transitions to `open`; bracket generation transitions to `in_progress` (Phase 2); leaderboard completion transitions to `complete` (existing cron, untouched). The schema's `tournament_status_enum` confirms this set.
   - **`TournamentForm.tsx` (new)** — shared form for create and edit. Fields: name (text), format (select: `round_robin` · `americano` · `mexicano` · `bracket` — matches `CreateSchema` enum), tournament_type (select: `open` · `club_internal` · `group` · `casual` — matches schema), start_at (datetime-local), tier_min (select with empty default — any of the 5 tiers or null), tier_max (same). Native HTML form, no client state. Submit uses `formAction` to a server action passed in as a prop.
   - **`/c/[slug]/admin/tournaments/new/page.tsx` (new)** — wraps `TournamentForm`, calls `createTournament` (existing) on submit. The action returns `{ tournament_id, slug }`; the page redirects to `/c/[slug]/admin/tournaments/[id]`.
   - **`/c/[slug]/admin/tournaments/[id]/page.tsx` (new)** — admin home for one tournament. Shows tournament info, registered players, status. Conditional action buttons:
     - `status='draft'` → `.btn-link.fn-green.font-bold` "Publish (open for registration) →" + `.btn-link` "Edit →" + `.btn-link.fn-red.font-bold` "Delete"
     - `status='open'` + ≥2 registered players → `.btn-link.fn-blue.font-bold` "Generate bracket →" (target is Phase 2 preview page) + `.btn-link` "Edit →" + `.btn-link.fn-red.font-bold` "Delete" (only if zero rows in the `matches` table for this tournament)
     - `status='open'` + <2 players → `.mute` "Need at least 2 registered players to generate bracket" + `.btn-link` "Edit →" + `.btn-link.fn-red.font-bold` "Delete"
     - `status='in_progress'` → `.btn-link` "View bracket →" + `.btn-link.fn-blue` "Manage scores →"
     - `status='complete'` → `.mute` "Tournament complete" (read-only summary only)
   - **`/c/[slug]/admin/tournaments/[id]/edit/page.tsx` (new)** — wraps `TournamentForm` pre-populated, calls `updateTournament` on submit. Edit is allowed when `status ∈ {draft, open}` and zero rows in the `matches` table for this tournament; the page 404s otherwise.
   - **`publishTournament` action (new in `actions.ts`)** — preconditions: `assertClubAdmin(u.id, t.club_id)` AND `status='draft'`. Updates `tournaments.status = 'open'`. Revalidates `/c/[slug]/admin/tournaments/[id]`, `/c/[slug]`, `/t`, `/t/[slug]`. Returns `{ success: true }`.
   - **`updateTournament` action (new in `actions.ts`)** — preconditions: `assertClubAdmin(u.id, t.club_id)` AND `status ∈ {draft, open}` AND zero rows in the `matches` table for this tournament. Validates via Zod schema (same shape as `CreateSchema` minus `club_id`, plus optional fields all defaulting to current values). Returns the updated row. Revalidates the same paths as publish.
   - **`deleteTournament` action (new in `actions.ts`)** — preconditions: `assertClubAdmin(u.id, t.club_id)` AND `status ∈ {draft, open}` AND zero rows in the `matches` table for this tournament. Cascade-deletes via FK (`brackets`, `registrations`, `matches` all cascade per schema verification). Returns `{ success: true }`. Caller redirects to `/c/[slug]`.

### 4.2 Auth model the new admin pages enforce

Use the existing `assertClubAdmin` helper from `src/libs/Authz.ts` — same helper the existing scores admin page (`/c/[slug]/admin/tournaments/[id]/scores/page.tsx`) already uses. The pattern in those pages:

```ts
const { userId: clerkId } = await auth();
if (!clerkId) return notFound();
const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
if (!u) return notFound();
try {
  await assertClubAdmin(u.id, club.id);
} catch {
  return notFound();
}
```

`assertClubAdmin` throws `ForbiddenError` when the caller is not a club admin; we catch and 404 (not 403) so we don't disclose the existence of the club's admin area to non-admins. The new server actions (`publishTournament`, `updateTournament`, `deleteTournament`) call `assertClubAdmin` internally before any mutation, mirroring the existing scoring admin actions (`src/features/scoring/actions.ts` line 602) and the scores admin page (`/c/[slug]/admin/tournaments/[id]/scores/page.tsx`). Note: `createTournament` and `generateBracket` were written before the helper landed and still use inline `club_memberships` queries — we leave those untouched (the result is identical) and adopt `assertClubAdmin` for all new actions.

### 4.3 Error handling

- Form validation lives in the new Zod schemas in `actions.ts` (mirroring existing `CreateSchema`). On failure, the action returns `{ success: false, error: { code, message } }` following the existing `Result<T>` pattern; the page reads `error.message` from a redirect search param and surfaces inline above the form in `.fn-red`.
- Rate-limit hit (real, post-Upstash-env): the limiter returns `success: false`; `registerForTournament` returns the existing rate-limit error code which the UI surfaces as "Slow down — try again in a minute." in `.fn-red.font-bold`.
- Delete on tournament with matches: action returns `{ error: { code: 'HAS_MATCHES', message: 'Cannot delete a tournament with matches recorded. Cancel via SQL or contact support.' } }`. Surfaced inline.
- Edit on tournament with matches or status `in_progress`/`complete`: returns `INVALID_STATUS` code, page shows error.
- Publish on non-draft tournament: returns `INVALID_STATUS` code.

### 4.4 Phase 1 tests

- **Unit (new):** `publishTournament` happy path + `status≠draft` precondition + non-admin forbidden; `updateTournament` happy path + `status='in_progress'` precondition + non-admin forbidden; `deleteTournament` happy path + `status='in_progress'` precondition + has-matches precondition + non-admin forbidden (10 tests)
- **Integration (new):** middleware redirects anonymous `/` → `/coming-soon` when gate is off; middleware lets authenticated users through; admin route 404s for non-admin via `assertClubAdmin`; webhook route honors `rateLimit(ip, 'webhook')` when limiter is configured (4 tests)
- **E2E (new Playwright):** admin signs in (stub Clerk in test env) → creates tournament (draft) → publishes (open) → edits → tries delete with matches (blocked) → deletes without matches; anonymous user blocked from `/` (with gate off); rate limit response surfaces correctly on rapid-fire register clicks against the stub (3 tests)

### 4.5 Phase 1 size

~8 new files, 3 edited files (`actions.ts` for 3 new actions, `app/api/webhook/clerk/route.ts` for one rateLimit call, `app/page.tsx` no-op since middleware handles the redirect), ~800 lines of new code, ~17 new tests. ~5 to 7 hours of subagent time.

## 5. Phase 2 — BracketBuilder + Public BracketView

### 5.1 The four pieces

1. **Admin BracketBuilder entry point.** Defined in Phase 1's admin detail page (`/c/[slug]/admin/tournaments/[id]`); the button's destination is the preview page below.

2. **Bracket preview page (`/c/[slug]/admin/tournaments/[id]/bracket/preview/page.tsx`).**
   - Two-step commit pattern, fully server-rendered, no client JS
   - Auth: `assertClubAdmin` per §4.2 pattern
   - Preconditions checked at render time: `status='open'`, ≥2 registered players, no existing bracket. Otherwise 404
   - Reads registered players from the tournament, calls `generateBracketData(players, format)` *without writing*. Since `bracket.ts` has no randomness (verified — no `Math.random`, no `shuffle`), the preview is byte-identical to what the action will commit
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

`generateBracket` (lines 316–467 in `actions.ts`) already validates club admin, runs the `ALREADY_GENERATED` guard, loads registered players, calls `generateBracketData`, and writes brackets + matches rows in a single transaction. Phase 2 **extends** this action with two additions: a status precondition (`'open'` only) before the idempotency guard, and a `tournaments.status = 'in_progress'` update inside the transaction after the matches insert. Neither addition changes the action's signature or return shape. The two new lines:

```ts
// added before existing ALREADY_GENERATED guard:
if (t.status !== 'open') {
  return { success: false, error: { code: 'INVALID_STATUS', message: 'Tournament must be open to generate bracket' } };
}

// added inside tx, after matches insert:
await tx.update(tournaments).set({ status: 'in_progress' }).where(eq(tournaments.id, t.id));
```

```
admin clicks "Generate bracket →" on detail page
  → 302 /c/[slug]/admin/tournaments/[id]/bracket/preview
  → server checks status='open' + ≥2 players + no existing bracket (else 404)
  → server reads players + format, calls generateBracketData() (read-only, deterministic)
  → renders <BracketView> with preview data + "Confirm" button
  → admin clicks Confirm
  → POST to generateBracket server action
    → re-validates: club admin (assertClubAdmin), status='open' (new), ALREADY_GENERATED (existing)
    → calls generateBracketData() again (deterministic — same output as preview)
    → BEGIN tx
      → insert brackets row (data = jsonb)
      → insert matches rows derived from bracket.matches
      → update tournaments.status = 'in_progress'  ← NEW
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
- **Integration (new):** `generateBracket` action — happy path (now also asserts `status='in_progress'` after commit), new `INVALID_STATUS` precondition when status is `draft`/`in_progress`/`complete`, existing `ALREADY_GENERATED` guard still works, fewer-than-2-players precondition (4 tests)
- **E2E (new Playwright):** admin previews bracket → confirms → bracket appears on public `/t/[slug]` AND tournament status flips to in_progress on detail page; player in a match sees Submit link; player not in match doesn't (2 tests)

### 5.7 Phase 2 size

~4 new files, 3 edited files (the public tournament page, the admin detail page, and `actions.ts` for the two-line `generateBracket` extension), ~500 lines new, ~9 new tests. ~3 to 4 hours of subagent time.

## 6. Phase 3 — Leaderboard tier filter + /me/points history

### 6.1 The two pieces

1. **Leaderboard tier filter (`src/app/leaderboard/page.tsx` — edit).**
   - Add a filter row above the leaderboard rendered as six `<a>` links using `.btn-link` style: `All · Bronze · Silver · Gold · Platinum · Diamond` (matches the full `tier_enum` set: `['bronze', 'silver', 'gold', 'platinum', 'diamond']`)
   - Selected state: `.fn-blue.font-bold` (UI-state indicator; AGENTS.md's pink reservation stays intact — the "Platinum" filter does NOT use `.pink`, that's reserved for the tier label badge itself, not filter chrome)
   - Filter applied via URL search param: `/leaderboard?tier=bronze`
   - No client JS. Each click is a full server navigation. Existing query gets `WHERE players.tier = $1` appended when the param is set
   - Invalid tier param → ignore, render unfiltered (forgiving)
   - Empty result state: `.mute` "No players at this tier yet."
   - Mobile: filter row wraps but otherwise unchanged
   - **Component:** `src/features/leaderboard/components/TierFilter.tsx` — pure server component, props `currentTier?: Tier`, `basePath: string`. Renders 6 links.

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

- **Unit (new):** `TierFilter` renders correctly for each tier and "all" state (6 tests for 5 tiers + all)
- **Integration (new):** leaderboard query honors tier filter; `/me/points` query returns ordered + limited rows (2 tests)
- **E2E (new Playwright):** signed-in user navigates to `/me/points`, sees their entries; anonymous user redirected to `/sign-in`; tier filter changes URL + filters leaderboard rows (3 tests)

### 6.5 Phase 3 size

~2 new files, 1 edited file, ~300 lines new, ~11 new tests. ~2 to 3 hours of subagent time.

## 7. Testing strategy + smoke gates

### 7.1 Test pyramid (built on the existing 240 unit/integration + 13 E2E baseline = 253 total)

| Layer | Phase 1 | Phase 2 | Phase 3 | Total new |
|---|---|---|---|---|
| Unit | 10 | 3 | 6 | 19 |
| Integration | 4 | 4 | 2 | 10 |
| E2E (Playwright) | 3 | 2 | 3 | 8 |

End state: ~290 total (~269 unit + integration, ~21 E2E). Zero regression on the existing 253 is a merge blocker.

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
3. Create a tournament via `/c/[slug]/admin/tournaments/new` → lands as `draft`, NOT visible on `/t` yet
4. Publish the tournament → status flips to `open` → now visible on `/t`
5. Edit it → name change reflected on public page
6. Delete with no matches → succeeds; delete with matches → blocked with correct message
7. Spam-click register → rate limit kicks in with the right copy (against real Upstash creds, not stub)

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
| Tournament create UX | Full CRUD: create (draft) + publish + edit + delete | Tew picked the biggest lift; publish step preserves the existing `draft → open` lifecycle baked into the schema |
| Bracket regeneration | Strict (delete-and-recreate via SQL once `in_progress`) | Fewer code paths, easier to reason about, can iterate to permissive post-MVP |
| Launch posture | Approach 1: phased build with coming-soon gate | Lowest risk to architecture; reversible flip |
| Diamond tier in filter | Include as the 6th option | The schema's `tier_enum` has 5 tiers including diamond; omitting it would be a silent omission |
| Tier-banded tournaments | Form exposes `tier_min` + `tier_max` (both optional, default null) | Schema requires the columns; defaulting them to null preserves backward compatibility with seeded tournaments |
| Rate limit code changes | One line in webhook route only; everything else activated by env vars | The existing `RateLimit.ts` already fully implements `@upstash/ratelimit` and fails open on placeholders — no replacement needed |

## 9. Build order summary

1. **Phase 1** — Auth + gate + admin CRUD with publish step (~800 LOC, ~17 tests, 5 to 7h subagent time)
2. **Phase 2** — BracketBuilder + BracketView + 2-line `generateBracket` extension (~500 LOC, ~9 tests, 3 to 4h)
3. **Phase 3** — Leaderboard filter + /me/points (~300 LOC, ~11 tests, 2 to 3h)

Total: ~1600 LOC new, ~37 new tests, 10 to 14 hours of subagent execution time. Plus reviewer + smoke time.

## 10. Inputs Tew needs to provide

- **Clerk production keys.** Generated on Clerk dashboard; pasted into Vercel → Settings → Environment Variables → Production scope.
- **Upstash Redis credentials.** Real `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (free tier is sufficient for MVP traffic). Required for real rate-limit enforcement. The placeholder values currently in env are not safe for public beta — rate limit fails open on placeholders by design.
- **Confirmation of `NEXT_PUBLIC_BETA_OPEN=false` initial value** in Vercel env at the start of Phase 1. Flip to `true` only at end of §7.4.

If Upstash setup is a blocker for Tew, the only architectural alternative is to ship Phase 1 with `NEXT_PUBLIC_BETA_OPEN=false` indefinitely and only open the gate to a hand-picked allowlist (i.e., Approach 2 from brainstorming instead of Approach 1). That's a real conversation to have if it comes up; the spec assumes Upstash is in place.

**Known manual override (for ops).** Once `generateBracket` flips a tournament to `status='in_progress'`, the new `deleteTournament` action will refuse to drop it. If a regenerate is genuinely needed (e.g., the admin realized the wrong players were registered before any scores landed), the manual override is one SQL statement against Neon: `UPDATE tournaments SET status='open' WHERE id=$1; DELETE FROM brackets WHERE tournament_id=$1; DELETE FROM matches WHERE tournament_id=$1;` Wrap in a transaction. This is rare and stays a manual operator action by design — automating it is post-MVP.

## 11. What this spec does NOT do

It does not implement. The next step (per the brainstorming skill flow) is to invoke `superpowers:writing-plans` after Tew approves this spec, which produces the implementation plan with task breakdown and execution order. The plan informs the implementer subagents.

End.
