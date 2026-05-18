# Padelz-v1 Design Spec

**Date:** 2026-05-18
**Status:** Draft, pending spec-document-reviewer and user approval
**Authors:** Tew Saksri (product owner: Tim Chang), brainstormed via `/superpowers:brainstorming`
**Source PRD:** `../../../02-Product/prd.md` (PRD v1, locked 2026-05-17)
**Source context:** `../../../CONTEXT.md`
**Target repo:** `04-Projects/Padel-Z/padelz-v1/` (to be initialized as git repo in week 1)

---

## Why this document exists

This is the technical design spec for `padelz-v1`, the bare-core-loop MVP of the Padel community platform under PROXYZ Studio. It consolidates the seven decisions taken during brainstorming on 2026-05-18 and lays out the architecture, schema, routes, scoring engine, error handling, security posture, and testing strategy that the four parallel build agents will implement in weeks 2 to 5.

The PRD answers "what are we building and why." This spec answers "how, exactly, do we build it so it's fast on Phuket 4G, secure under the agent-security-guardrails, and shippable in 4 to 6 weeks with multiple Claude Code worktrees running in parallel."

---

## Decisions locked during brainstorm

| # | Decision | Choice |
|---|----------|--------|
| Q1 | Scope | Web-first Next.js PWA. iOS app comes Phase 3 via RN + Expo, sharing logic with web. |
| Q2 | MVP slice | Bare core loop only: tournament create + register, score submit, leaderboard, basic player profile. Skip groups, marketplace, info hub, broadcasts. |
| Q3 | Stack | Mirror Portal exactly: Next.js 14 (App Router) + Clerk + Neon Postgres + Drizzle + shadcn/ui + Tailwind + Motion + Vercel. Add PWA manifest + Vercel Blob + Vercel Cron. |
| Q4 | Team | Tim owns product + design. Tew implements via Claude Code. Tim onboards to Claude Code in parallel. Brand inherits PROXYZ Studio identity (editorial dark + `#FF4193` + IBM Plex Mono). |
| Q5 | Realtime | Polling for v0.5. Defer real-time to v1 polish (Pusher / Postgres LISTEN / SSE TBD). |
| Q6 | Build approach | Parallel agents on four feature modules (M1 to M4), with a mandatory single-thread foundation week 1 that locks schema, auth wiring, and CI before any split. |
| Perf | Performance posture | Server Components by default, Server Actions over `router.refresh()`, edge caching on hot reads, no Tiptap/pglite/Storybook/next-intl bloat, Lighthouse CI budget enforced. |

---

## Section 1 — Architecture

### 1.1 Runtime architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (desktop + mobile PWA)                                 │
│  - Next.js App Router pages (Server Components default)         │
│  - Tailwind + shadcn UI                                         │
│  - Service worker (PWA install + offline-ish leaderboard cache) │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Vercel Edge / Node runtime                                     │
│  - Next.js Server Actions (mutations)                           │
│  - Next.js Route Handlers (/api/* JSON endpoints)               │
│  - Middleware (Clerk auth gate, locale routing)                 │
│  - Vercel Cron (weekly leaderboard rollup, Sun 23:55 ICT)       │
└────────┬────────────────────┬────────────────────┬──────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐         ┌──────────┐        ┌─────────────┐
   │  Clerk   │         │   Neon   │        │ Vercel Blob │
   │  (auth)  │         │ Postgres │        │  (photos)   │
   └──────────┘         └──────────┘        └─────────────┘
         │                    │
         └─────► Sentry ◄─────┘
              (error tracking)
```

### 1.2 Feature module boundaries

Each module owns specific tables. Cross-module reads are allowed; cross-module writes go through the owning module's Server Actions.

| Module | Scope | Owned tables | Primary worktree |
|--------|-------|--------------|------------------|
| **M1 — Auth + Profiles + Notifications** | Clerk wrapping, user-to-DB sync webhook, player profile editor, club profile editor, public profile pages, the shared `createNotification` Server Action that all other modules call | `users`, `players`, `clubs`, `club_memberships`, `tier_history`, `notifications` | `feat/padel-m1-profiles` |
| **M2 — Tournaments** | Tournament create wizard, registration, live participant roster, bracket / draw generation, match scheduling | `tournaments`, `registrations`, `brackets`, `matches` | `feat/padel-m2-tournaments` |
| **M3 — Scoring** | Pure-function points calculator, two-player confirm flow, admin override, idempotent recalc | `match_results`, `points_ledger` | `feat/padel-m3-scoring` |
| **M4 — Leaderboard** | Tier views, weekly/monthly/season filters, top-3 promotion check, cron rollup, public leaderboard pages | `leaderboard_snapshots` | `feat/padel-m4-leaderboard` |

The highest-risk merge conflict is M2 ↔ M3 around the `matches` table. **Rule: M2 owns the `matches` table shape. M3 reads from `matches`, never writes.** See §1.7 for the explicit shared-contract definitions both modules import from.

### 1.3 Foundation week (week 1, single thread)

Week 1 is sequential, not parallel. Single Claude Code session, single branch. This stops agents from diverging on entity shapes.

1. Scaffold `padelz-v1` from saas-boilerplate fork (Portal's starter). Confirm `package.json` has scripts: `dev:next`, `build`, `start`, `lint`, `lint:fix`, `check-types`, `test`, `test:integration`, `test:e2e`, `db:generate`, `db:migrate`, `db:studio`, `db:seed`. Add any missing scripts (especially `test:integration` which Portal doesn't have) in this commit; the CI workflow at `.github/workflows/ci.yml` references them by name.
2. Wire Clerk + Neon + Drizzle. Initial `.env.local`, `t3-oss/env-nextjs` validation in `src/libs/Env.ts`.
3. **Lock the complete schema.** All 13 tables generated (see §2.2), migration `0000_initial_padelz_schema.sql` committed.
3a. **Lock the cross-module TypeScript contracts.** Stub the type files per the canonical §1.7 table below — do NOT inline contract shapes here, to prevent drift. M3 imports `Tier` from M1 (`src/features/profiles/types.ts`), imports `MatchForScoring` from M2 (`src/features/tournaments/types.ts`), and exports `MatchInput`, `PointsAward`, `Result<T>` (`src/features/scoring/types.ts`). Each module's `types.ts` is committed in foundation week with stub exports so importers compile against the locked shape even before implementations exist.
4. Wire `instrumentation.ts` for Sentry, `Logger.ts` for Pino, request_id middleware.
5. Wire PWA manifest + minimal service worker stub.
6. Wire CI (`.github/workflows/ci.yml`) and smoke-deploy (`smoke-deploy.yml`).
7. Tiny vertical slice test: sign in, see your name on a placeholder leaderboard page rendering from an empty `leaderboard_snapshots` table. Confirms end-to-end works.
8. Set up `~/Tools/padelz-worktree` (adapted from `portal-worktree`) and create the four worktrees.

### 1.4 Parallel weeks 2 to 5

Each agent works in its own worktree against the locked schema. Daily merge to main. Each agent runs CI on its own worktree before opening a PR. Tew (or Claude on Tew's behalf) reviews diff and merges. Tim shadows to ramp up on the codebase.

**Week 2-3:**
- M1: Player profile editor, club profile editor, public `/p/[handle]` and `/c/[slug]` pages.
- M2: Tournament create wizard, registration flow, basic bracket builder.
- M3: Scoring engine pure function with full unit test matrix. Points ledger writes.
- M4: Leaderboard read endpoints + first cached view.

**Week 4-5:**
- M1: Tier history audit views, profile photo uploads via Vercel Blob, tier promotion notifications.
- M2: Full bracket / draw generation (manual + auto-seeded), live participant roster, match scheduling UI.
- M3: Two-player confirmation flow, admin override path, dispute notification.
- M4: Weekly/monthly/season views, tier filters, auto-promotion cron check.

### 1.7 Shared contracts (foundation week deliverable)

Cross-module reads need TypeScript contracts to be locked in week 1 so M3 can start its scoring work in week 2 without waiting on M2. Foundation week 1 creates and commits these stub files; agents fill in implementations against the locked shapes.

**Module-owned contracts:**

| File | Owner | What it exports | Imported by |
|------|-------|----------------|-------------|
| `src/models/Schema.ts` | Foundation | Drizzle schema for all 13 tables | All modules (read), each module's actions (write to owned tables) |
| `src/features/profiles/types.ts` | **M1 (sole owner of `Tier`)** | `Tier` enum, `PublicPlayer` view shape, `PublicClub` view shape | M2 (for tier restrictions), M3 (imports `Tier` for scoring), M4 (for tier filters) |
| `src/features/tournaments/types.ts` | M2 | `MatchForScoring = { id, tournament_id, team_a: uuid[2], team_b: uuid[2], format, tournament_type }`, `TournamentStatus` | M3 (read-only), M4 (read-only) |
| `src/features/scoring/types.ts` | M3 | `MatchInput`, `PointsAward`, `Result<T>` (does NOT re-declare `Tier` — imports it from `@/features/profiles/types`) | M4 (for points_ledger reads), UI (breakdown display) |
| `src/features/notifications/types.ts` + `actions.ts` | **M1** | `NotificationType` enum, `createNotification(input)` Server Action | M2/M3/M4 all call `createNotification` — they never INSERT into `notifications` directly |
| `src/features/profiles/actions.ts` (M1 entry point for tier mutations) | **M1** | `promotePlayer({ player_id, new_tier, reason })` Server Action — wraps `tier_history` INSERT, `players.tier` UPDATE, and `createNotification('tier_promoted')` in a single `db.transaction` | M4 cron calls this from auto-promotion path; never writes `tier_history` or `players.tier` directly |
| `src/features/leaderboard/types.ts` | M4 | `LeaderboardRow`, `LeaderboardPeriod`, `TierStandings` | UI only |

**Invariants locked at foundation week (cannot be silently changed by parallel agents):**

- `matches.team_a.length === 2 && matches.team_b.length === 2` for v0.5. Singles and variable-size team support are v1 migrations. Zod schema for match creation enforces this at the API boundary.
- No duplicate player IDs across teams: `new Set([...team_a, ...team_b]).size === 4`. Zod refinement enforces this; integration test asserts the API rejects a payload with a player on both sides.
- `players` to `users` is strictly 1:1 (enforced by `players.user_id UNIQUE`).
- `points_ledger` rows are append-only EXCEPT the admin-override transaction (delete + insert in one tx) and the `user.deleted` redaction.
- `match_results` is 1:1 with `matches` (`UNIQUE(match_id)`).
- All cross-module reads go through the exported types above. No module reads another's internal helpers.

**How parallel agents enforce this:**
- ESLint rule `no-cross-module-internal-imports` (custom): bans `import "../../features/<other>/internal"`. CI fails on violation.
- TypeScript strict mode + `tsc --noEmit` in CI catches contract drift at compile time.
- The foundation-week commit that locks these files is the line in the sand.

### 1.5 Week 6 polish + pilot

- iOS Safari PWA install testing (Add to Home Screen flow on a real iPhone).
- Playwright E2E suite green against staging.
- Sentry sourcemaps verified.
- Smoke-deploy workflow validated against pilot URL.
- One real Phuket club onboarded; one real tournament runs on the platform.

### 1.6 Performance strategy

Portal's mobile lag is fixable habits, not unavoidable Next.js behavior. Padel-Z avoids the same traps from commit #1:

1. **Server Components by default.** Leaderboard, tournament list, profile pages, club pages all render server-side with zero JS shipped. Client Components only for forms, score submission UI, bracket drag-drop.
2. **Streaming with Suspense.** Leaderboard pages stream the shell first, then rows. Mobile users see content at ~600ms vs ~2s.
3. **Edge caching on hot reads.** Leaderboard, tournament list, public profile pages cached with `revalidate: 30`. On-demand `revalidateTag` fires when scores submit.
4. **No `router.refresh()` in client code.** Mutations use Server Actions + `revalidatePath` / `revalidateTag`.
5. **Cut Portal's bloat.** No Tiptap. No `@electric-sql/pglite`. No Storybook in v0.5. No `next-intl` until Thai locale ships. Net JS savings: ~250kb gzipped.
6. **PWA service worker from week 1.** Cache the app shell. Stale-while-revalidate on leaderboard data.
7. **Optimistic UI for score submission** via React 19 `useOptimistic`. Rollback on server reject with toast.
8. **Next.js `<Image>`** for all photos with responsive sizes + WebP/AVIF.
9. **Drizzle prepared statements** for hot queries. Indexed lookups on `(player_id, tier)`.
10. **Mobile-first Tailwind breakpoints.** Design 360px first, scale up.

**Performance budget (enforced in CI):**

| Metric | Budget |
|--------|--------|
| First Contentful Paint (4G mobile) | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Total Blocking Time | < 200ms |
| Cumulative Layout Shift | < 0.1 |
| JS bundle, landing route | < 50kb gzip |
| JS bundle, leaderboard route | < 80kb gzip |

Lighthouse CI runs in `.github/workflows/ci.yml` against every PR preview. Budget bust fails the check.

---

## Section 2 — Data model

### 2.1 ERD

```
                            ┌──────────────┐
                            │    users     │  ← synced from Clerk
                            │  (clerk_id)  │
                            └──────┬───────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
        ┌──────────────┐   ┌──────────────────┐   ┌──────────┐
        │   players    │   │ club_memberships │   │  clubs   │
        │   (1 : 1)    │   │   (role: admin   │◀──┤          │
        │              │   │      / member)   │   │          │
        └──────┬───────┘   └──────────────────┘   └────┬─────┘
               │                                       │
               │ tier_history (audit)                  │
               │                                       │
               ▼                                       ▼
        ┌──────────────┐                       ┌──────────────┐
        │ tier_history │                       │ tournaments  │
        │              │                       │              │
        └──────────────┘                       └──────┬───────┘
                                                      │
                                  ┌───────────────────┼─────────────────┐
                                  ▼                   ▼                 ▼
                          ┌──────────────┐   ┌──────────────┐  ┌──────────────┐
                          │registrations │   │   brackets   │  │   matches    │
                          │              │   │              │  │              │
                          └──────────────┘   └──────────────┘  └──────┬───────┘
                                                                      │
                                                                      ▼
                                                              ┌──────────────┐
                                                              │match_results │
                                                              └──────┬───────┘
                                                                     │
                                                                     ▼
                                                              ┌──────────────┐
                                                              │points_ledger │
                                                              └──────┬───────┘
                                                                     │
                                                  ┌──────────────────┴───────────────┐
                                                  ▼                                  │
                                          ┌────────────────────┐                     │
                                          │leaderboard_snapshot│◀── Sun 23:55 ICT ───┘
                                          │                    │    cron rebuild
                                          └────────────────────┘
```

### 2.2 Table definitions

**13 tables total** (corrected from earlier "11" claim). All columns include `created_at timestamptz default now()` unless noted. UUIDs are v7 (sortable, time-ordered) via `uuidv7` package (Portal pattern).

#### `users` (M1)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | v7 |
| `clerk_id` | text UNIQUE | from Clerk |
| `email` | text | from Clerk, kept for service emails |
| `created_at` | timestamptz | |

#### `players` (M1)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users(id) UNIQUE | 1:1 with users |
| `handle` | text UNIQUE | public URL slug, generated on signup |
| `display_name` | text | |
| `tier` | enum `tier_enum` | current tier (bronze/silver/gold/platinum/diamond) |
| `home_club_id` | uuid FK → clubs(id) nullable | |
| `bio` | text nullable | plain text, no HTML |
| `photo_url` | text nullable | Vercel Blob URL |
| `verified` | boolean default false | optional Lunda/Playtomic verification badge |
| `redacted_at` | timestamptz nullable | set when Clerk `user.deleted` fires; UI hides redacted profiles |
| `created_at` | timestamptz | |

(The `auto_demote_opt_in` column originally proposed is **deferred to v1** along with the auto-demotion feature itself. v0.5 ships no UI toggle for it.)

#### `clubs` (M1)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `slug` | text UNIQUE | public URL slug |
| `name` | text | |
| `city` | text default 'Phuket' | |
| `description` | text nullable | |
| `court_count` | int nullable | |
| `photo_url` | text nullable | |
| `created_at` | timestamptz | |

#### `club_memberships` (M1)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users(id) | |
| `club_id` | uuid FK → clubs(id) | |
| `role` | enum `membership_role_enum` | `admin`, `member` |
| `created_at` | timestamptz | |

Constraint: `UNIQUE (user_id, club_id)`.

#### `tier_history` (M1)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `player_id` | uuid FK → players(id) | |
| `tier` | enum `tier_enum` | |
| `from_date` | timestamptz | |
| `to_date` | timestamptz nullable | null = current |
| `reason` | enum `tier_change_reason_enum` | `initial`, `auto_promote`, `auto_demote`, `manual` (the `auto_demote` value is pre-provisioned in the enum but unused in v0.5; v1 adds the auto-demote cron path that emits it) |

#### `tournaments` (M2)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `slug` | text UNIQUE | |
| `club_id` | uuid FK → clubs(id) | |
| `name` | text | |
| `format` | enum `tournament_format_enum` | `americano`, `mexicano`, `round_robin`, `bracket` |
| `tournament_type` | enum `tournament_type_enum` | `open`, `club_internal`, `group`, `casual` |
| `start_at` | timestamptz | |
| `tier_min` | enum `tier_enum` nullable | |
| `tier_max` | enum `tier_enum` nullable | |
| `status` | enum `tournament_status_enum` | `draft`, `open`, `in_progress`, `complete` |
| `created_by` | uuid FK → users(id) | |
| `created_at` | timestamptz | |

#### `registrations` (M2)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tournament_id` | uuid FK | |
| `player_id` | uuid FK | |
| `status` | enum `registration_status_enum` | `registered`, `waitlist`, `withdrawn` |
| `created_at` | timestamptz | |

Constraint: `UNIQUE (tournament_id, player_id)`.

#### `brackets` (M2)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tournament_id` | uuid FK | |
| `data` | jsonb | seeding + bracket structure |
| `created_at` | timestamptz | |

#### `matches` (M2 owns shape; M3 reads only)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tournament_id` | uuid FK | |
| `team_a` | uuid[] | player IDs |
| `team_b` | uuid[] | player IDs |
| `scheduled_at` | timestamptz nullable | |
| `status` | enum `match_status_enum` | `scheduled`, `in_progress`, `complete`, `void` |

#### `match_results` (M3)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `match_id` | uuid FK UNIQUE → matches(id) | one-row-per-match |
| `team_a_score` | int | |
| `team_b_score` | int | |
| `submitted_by` | uuid FK → users(id) | |
| `confirmed_by` | uuid FK → users(id) nullable | |
| `status` | enum `match_result_status_enum` | `pending`, `confirmed`, `disputed`, `admin_set`, `void` |
| `submitted_at` | timestamptz | |
| `confirmed_at` | timestamptz nullable | |

#### `points_ledger` (M3)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `player_id` | uuid FK | |
| `match_id` | uuid FK | |
| `points` | numeric(8,2) | always ≥ 0 |
| `breakdown` | jsonb | full math: base, multipliers, opponent tiers |
| `earned_at` | timestamptz | match completion time |

Constraints: `UNIQUE (player_id, match_id)`. Indexes: `(player_id, earned_at DESC)`. FK rules: `match_id REFERENCES matches(id) ON DELETE RESTRICT` (matches must be voided, not deleted, to preserve audit). The admin-override delete-and-reinsert happens inside a `db.transaction` (see §4.7 step 5).

#### `notifications` (M1, in-app delivery in v0.5)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users(id) | recipient |
| `type` | enum `notification_type_enum` | `score_pending`, `score_confirmed`, `score_disputed`, `pending_expired`, `score_overridden`, `tier_promoted`, `registration_confirmed` |
| `payload` | jsonb | structured data: match_id, tournament_id, tier change, etc. |
| `read_at` | timestamptz nullable | |
| `created_at` | timestamptz | |

Indexes: `(user_id, read_at, created_at DESC)` for the unread bell-count read.

#### `leaderboard_snapshots` (M4, cached materialized view)
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `period` | enum `leaderboard_period_enum` | `week`, `month`, `season` |
| `period_start` | date | |
| `tier` | enum `tier_enum` | |
| `player_id` | uuid FK | |
| `rank` | int | per `(period, period_start, tier)`. Uses SQL `ROW_NUMBER() OVER (PARTITION BY period, period_start, tier ORDER BY points_sum DESC, match_count DESC, players.created_at ASC)`. The tie-breaker chain below guarantees distinct ranks, so every position is deterministic — `ROW_NUMBER` is chosen over `RANK` precisely because we never want gaps. |
| `points_sum` | numeric(10,2) | |
| `match_count` | int | |
| `stale` | boolean default false | set true when admin override or void affects a snapshot's matches; cron rebuilds stale rows |
| `rebuilt_at` | timestamptz | when this row was last computed |

Constraints: `UNIQUE (period, period_start, tier, player_id)`. Indexes: `(period, period_start, tier, rank)`.

**Ranking tie-breaker (encoded in the `ORDER BY` of the cron rebuild query, in order):**
1. Higher `points_sum`
2. Higher `match_count`
3. Earlier `players.created_at` (longer-tenured player edges newer one)

Since the third tie-breaker uses a `UNIQUE` column, every leaderboard position is deterministic and no gaps appear in `rank`.

### 2.3 Design decisions

- **Points ledger is the source of truth.** Every confirmed match writes one row per player. Snapshots are derived. We can recompute history at any time.
- **`match_results` is one-row-per-match** with a state machine (`pending` → `confirmed` → `disputed` → `admin_set`).
- **`player_id` vs `user_id` split.** Users come from Clerk (auth identity). Players are the platform profile.
- **`tier` is an enum, not a number.** Multipliers live in `src/features/scoring/constants.ts`, not the DB. Tunable without migrations.
- **`matches.team_a` / `team_b` are `uuid[]` arrays.** Doubles support; future formats possible.
- **`breakdown` is JSONB.** Audit trail so a player can see why they got 60.95 points.

### 2.4 Indexes

```sql
-- Hot reads
players (handle)                                          -- public profile URL
clubs (slug)                                              -- public club URL
tournaments (club_id, start_at DESC)                      -- club tournaments
points_ledger (player_id, earned_at DESC)                 -- "my matches"
leaderboard_snapshots (period, period_start, tier, rank)  -- hot leaderboard

-- FK indexes auto-generated by Drizzle for every FK

-- Search (deferred to v1)
players (handle, display_name) pg_trgm GIN                -- player search
```

---

## Section 3 — Routes + auth roles

### 3.1 Roles

| Role | Definition | Examples of allowed actions |
|------|------------|------------------------------|
| **Visitor** | No Clerk session | View leaderboard, view tournament, view public profile |
| **Player** | Clerk session + `players` row | Edit own profile, register, submit own score, confirm opponent's score |
| **Club admin** | `club_memberships.role = 'admin'` for at least one club | Create tournament at their club, override match result, edit club profile |
| **Platform admin** | `ENV.PLATFORM_ADMIN_EMAILS` contains user's email | Edit anything. No formal UI in v0.5. |

### 3.2 Route map

**Public (no auth):**
- `/` — landing (signed out) / dashboard (signed in)
- `/sign-in`, `/sign-up` — Clerk
- `/p/[handle]` — public player profile
- `/c/[slug]` — public club profile
- `/t` — Phuket tournament calendar
- `/t/[slug]` — tournament detail
- `/t/[slug]/bracket` — bracket view
- `/t/[slug]/results` — final results
- `/leaderboard` — filterable leaderboard
- `/leaderboard/[tier]` — tier-specific view

**Player (Clerk-gated):**
- `/me` — my profile + edit
- `/me/tournaments` — registration history
- `/me/matches` — match history
- `/me/points` — points breakdown
- `/me/settings` — account deletion only in v0.5 (no opt-in toggles ship in v0.5; auto-demote opt-in lands in v1)
- `/t/[slug]/register` — registration form
- `/match/[id]/submit` — submit score
- `/match/[id]/confirm` — confirm opponent's score

**Club admin (role-checked at layout):**
- `/c/[slug]/admin` — dashboard
- `/c/[slug]/admin/profile` — edit club info
- `/c/[slug]/admin/tournaments` — list + create
- `/c/[slug]/admin/tournaments/new` — create wizard
- `/c/[slug]/admin/tournaments/[id]/edit` — edit details
- `/c/[slug]/admin/tournaments/[id]/draw` — bracket builder
- `/c/[slug]/admin/tournaments/[id]/scores` — score override

**API + system:**
- `/api/webhook/clerk` — Svix-verified user sync
- `/api/cron/leaderboard` — Vercel Cron, secret-gated, Sun 23:55 ICT
- `/api/cron/expire-pending` — Vercel Cron, secret-gated, daily 00:30 ICT, notifies club admins of `match_results` stuck in `pending` for >48h (see §4.7 race-conditions table)
- `/manifest.json` — PWA manifest
- `/sw.js` — service worker
- `/robots.txt`, `/sitemap.xml` — generated by Next.js

### 3.3 Permission matrix

| Action | Visitor | Player | Club admin | Platform admin |
|--------|---------|--------|------------|----------------|
| View leaderboard | Yes | Yes | Yes | Yes |
| View public profile | Yes | Yes | Yes | Yes |
| View tournament + bracket | Yes | Yes | Yes | Yes |
| Edit own player profile | No | Yes | Yes | Yes |
| Register for tournament | No | Yes | Yes | Yes |
| Submit match score | No | Yes (own match) | Yes (own match) | Yes |
| Confirm opponent's score | No | Yes (own match) | Yes (own match) | Yes |
| Create tournament | No | No | Yes (their club) | Yes |
| Override match result | No | No | Yes (their tourn.) | Yes |
| Edit club profile | No | No | Yes (their club) | Yes |
| Cross-club actions | No | No | No | Yes |

### 3.4 Three protection layers (defense in depth)

1. **Middleware (`src/middleware.ts`).** Clerk gates everything under `/me/*`, `/match/*`, `/c/*/admin/*`. Unauth users redirect to `/sign-in`.
2. **Layout-level role check.** `src/app/c/[slug]/admin/layout.tsx` server-side queries `club_memberships` and confirms the user has `role = 'admin'` for this club. Wrong club returns 404 (not 403) to avoid leaking which clubs exist.
3. **Server Action authorization.** Every mutation re-verifies the user owns the resource. Authorization is never "we already checked it in the layout."

### 3.6 Mixed-role scenarios

The four roles are **not exclusive.** A `users` row can simultaneously be:
- A `players` row (almost always — every signed-in user has one)
- An `admin` `club_membership` for one or more clubs
- A `member` `club_membership` for one or more other clubs
- Listed in `ENV.PLATFORM_ADMIN_EMAILS` (Tew + Tim)

**Rules for overlapping cases:**

| Scenario | Behavior |
|----------|----------|
| Club admin registers for a tournament at their own club | Allowed. They appear as a regular participant in the bracket. |
| Club admin participates in a match and wants to override its result | **Blocked.** Server Action `adminOverrideMatch` first resolves `adminPlayerId = (SELECT id FROM players WHERE user_id = currentUserId)`, then checks `adminPlayerId NOT IN unnest(matches.team_a \|\| matches.team_b)`. If the admin's player_id appears on either side, the override is rejected with `{ success: false, error: { code: 'CONFLICT_OF_INTEREST', message: 'You participated in this match. A different admin must resolve disputes.' } }`. If no other admin of this club exists, the platform admin escalation path (Tew or Tim) is the only option. |
| User is admin of Club A and member of Club B | Their `/c/A/admin/*` routes work; their `/c/B/admin/*` routes 404. Scoped per `club_id`. |
| Two admins of the same club race to override | First-writer-wins via `SELECT … FOR UPDATE` on the `match_results` row inside the override transaction. Second admin sees `{ success: false, error: { code: 'ALREADY_OVERRIDDEN', message: '...' } }`. |
| Platform admin (Tew or Tim) overrides anywhere | Allowed via the platform-admin email check. Same audit trail (`confirmed_by` records their user_id). |
| User deletes account via Clerk | Webhook → `players.redacted_at = now()`, `display_name = '[deleted]'`, `photo_url = null`. Match history preserved. Their `club_memberships` rows are deleted (they're no longer admin of anything). Their `points_ledger` entries stay so leaderboards remain consistent. |

The redact-not-delete pattern matches the `agent-security-guardrails` "minimize data surface" rule and Thai data-protection norms.

### 3.5 Clerk webhook handling

`/api/webhook/clerk` verifies Svix signature on every payload. Handlers:
- `user.created` → insert `users` row + auto-create `players` row with a randomized handle slug. Handle generation uses `nanoid(8)` and retries up to 5 times on `UNIQUE` collision; sixth attempt extends to `nanoid(10)` and so on. Collision probability with 8-char nanoid at 100k users is ~0.005%, but the retry keeps it bulletproof.
- `user.updated` → sync email changes.
- `user.deleted` → redact (not delete) player: set `redacted_at = now()`, overwrite `display_name = '[deleted]'`, set `photo_url = null`. Preserve `points_ledger` rows for leaderboard integrity. Delete `club_memberships` rows (they're no longer affiliated).

### 3.7 Tournament tier-restriction enforcement

`tournaments.tier_min` and `tier_max` are nullable. When a player tries to register via `/t/[slug]/register`:
- If both are null → anyone can register.
- If `tier_min` is set → reject if `players.tier < tier_min`. Error: `{ code: 'TIER_TOO_LOW', message: 'This tournament requires ${tier_min}+ tier.' }`.
- If `tier_max` is set → reject if `players.tier > tier_max`. Error: `{ code: 'TIER_TOO_HIGH', message: 'This tournament is capped at ${tier_max} and below.' }`.
- Tier comparison uses the same integer mapping as scoring (bronze=1 ... diamond=5).
- The UI hides the "Register" button entirely when ineligibility is known at page-load. The Server Action re-checks at submit time for the case where the player auto-promoted between page load and submit.

---

## Section 4 — Scoring engine

### 4.1 The formula

```
points = base × tier_mult × tournament_mod × format_mod
```

Round to 2 decimals at write time. Always ≥ 0. Store final value in `points_ledger.points`, store the full breakdown in `points_ledger.breakdown` (JSONB).

### 4.2 Base points

**Bracket / games & sets format:**
- Win: 100
- Loss: 25 (participation, never negative)

**Americano / mexicano (point-by-point format):**
```
total_points = team_a_score + team_b_score   // sum across both sides
base = max(25, roundHalfUp(100 × your_team_points / total_points))
```

`roundHalfUp(x) = Math.floor(x + 0.5)` — implemented in `src/features/scoring/rounding.ts`. Never use bare `Math.round` (browser-dependent at .5) or Postgres `round` (banker's rounding). All scoring math goes through the helper.

Rewards close matches. Worked: 21-19 loss → `100 × 19 / 40 = 47.5 → 48 base`. 21-15 loss → `100 × 15 / 36 = 41.67 → 42 base`. Decisive 21-3 loss → `100 × 3 / 24 = 12.5 → 13`, then floored to 25 by the `max(25, …)` participation floor.

### 4.3 Tier multiplier (only applied on wins)

| Your tier vs avg opponent tier | Multiplier on win | On loss |
|-------------------------------|-------------------|---------|
| 2+ tiers above (e.g. Gold beats Diamond avg) | 2.0x | 1.0x |
| 1 tier above | 1.5x | 1.0x |
| Same tier | 1.0x | 1.0x |
| 1 tier below | 0.5x | 1.0x |
| 2+ tiers below | 0.25x | 1.0x |

For doubles: map tiers to integers (bronze=1, silver=2, gold=3, platinum=4, diamond=5), average both opponents, apply `roundHalfUp` (the same helper used in base-points rounding), compare to your tier integer. Examples:

| Opponent A | Opponent B | Avg | `roundHalfUp` | Result tier |
|------------|------------|-----|----------------|-------------|
| Bronze (1) | Silver (2) | 1.5 | 2 | Silver |
| Silver (2) | Gold (3) | 2.5 | 3 | Gold |
| Gold (3) | Platinum (4) | 3.5 | 4 | Platinum |
| Platinum (4) | Diamond (5) | 4.5 | 5 | Diamond |
| Silver (2) | Diamond (5) | 3.5 | 4 | Platinum |

**Losses are flat regardless of tier** — prevents farming low-tier opponents for safety points.

**Tier snapshot at match-completion time.** When the match enters `confirmed` or `admin_set` state, the scoring engine reads `players.tier` for the four participants and snapshots them into `points_ledger.breakdown.your_tier` / `breakdown.avg_opponent_tier`. If a player auto-promotes the next Sunday, their already-confirmed match points are unaffected. The snapshot in `breakdown` is the source of truth for that match's math forever.

### 4.4 Tournament type modifier

| Type | Modifier | Notes |
|------|----------|-------|
| Open / inter-club | +20% (×1.20) | |
| Club-internal | standard (×1.00) | Default for v0.5 |
| Group / social | standard (×1.00) | v1 polish |
| Casual self-reported | −15% (×0.85) | v1 polish |

v0.5 ships only `club_internal` and `open`.

### 4.5 Format modifier

| Format | Modifier |
|--------|----------|
| Americano / mexicano (point-by-point) | +15% (×1.15) |
| Games & sets | standard (×1.00) |
| Bracket | standard (×1.00) |

### 4.6 Worked example

A Gold player wins an Americano at a club-internal tournament. Opponents: Silver + Platinum (avg = Gold). Score: 24 points won, 21 points lost.

```
base           = max(25, roundHalfUp(100 × 24/45)) = max(25, roundHalfUp(53.33)) = max(25, 53) = 53
tier_mult      = 1.0  (same tier on win)
tournament_mod = 1.0  (club-internal)
format_mod     = 1.15 (americano)

points = 53 × 1.0 × 1.0 × 1.15 = 60.95
```

`points_ledger` row stores:
```json
{
  "base": 53,
  "tier_mult": 1.0,
  "avg_opponent_tier": "gold",
  "your_tier": "gold",
  "tournament_modifier": 1.0,
  "format_modifier": 1.15,
  "result": "win",
  "points_won": 24,
  "points_lost": 21
}
```

### 4.7 Confirmation flow

State machine on `match_results`: `pending` → (`confirmed` | `disputed` | `admin_set` | `void`).

**Happy path:**
1. Player A (any member of either team) submits scores via `POST /api/match/[id]/submit` (Server Action). The Server Action resolves `submitter_player_id = (SELECT id FROM players WHERE user_id = currentUserId)` and rejects if the submitter is not a participant (`submitter_player_id NOT IN unnest(matches.team_a || matches.team_b)` → 403). On success it INSERTs `match_results` row with `status = 'pending'`, `submitted_by = currentUserId` (column stores `user_id`). The insert uses `ON CONFLICT (match_id) DO NOTHING` because of `UNIQUE(match_id)` — first writer wins.
2. Any player on the OPPOSING team can confirm or dispute. The `/match/[id]/confirm` route layout enforces participation server-side — non-participants get 404, not 403, to avoid leaking match existence. The Server Action enforces two guards before acting:
   - Participation guard: `confirmer_player_id = (SELECT id FROM players WHERE user_id = currentUserId)`, must satisfy `confirmer_player_id IN unnest(matches.team_a || matches.team_b)`.
   - Opposite-team guard: `(confirmer_player_id ∈ team_a) XOR (submitter_player_id ∈ team_a)` (resolved from the prior `match_results.submitted_by → players.id` lookup). If submitter and confirmer are on the same team, the action returns `{ success: false, error: { code: 'CONFLICT_OF_INTEREST', message: 'Your teammate already submitted. The opposing team must confirm.' } }`.
   The first opposing-team player to act resolves the state.
3. **Confirm:** Server Action transitions `status = 'pending' → 'confirmed'` inside a transaction. Same transaction inserts `points_ledger` rows for all participants (idempotent via `UNIQUE (player_id, match_id)`). `confirmed_by` and `confirmed_at` set in the same statement. Then calls M1's `createNotification({ type: 'score_confirmed', user_ids: <all 4 participants' user_ids>, payload: { match_id } })`.
4. **Dispute:** Server Action transitions `status = 'pending' → 'disputed'`, then calls M1's `createNotification({ type: 'score_disputed', user_ids: <all club admin user_ids for the tournament's club>, payload: { match_id, tournament_id } })`. Never INSERTs into `notifications` directly — M1 owns that table per §1.7.
5. **Admin override:** Club admin of the tournament's club calls `POST /api/admin/match/[id]/override` with authoritative scores. Server Action wraps **all** of the following in a single `db.transaction`:
   - Update `match_results` (`status = 'admin_set'`, `team_a_score`, `team_b_score`, `confirmed_by = admin_user_id`, `confirmed_at = now()`).
   - `DELETE FROM points_ledger WHERE match_id = $1` (cleans up prior `pending`-or-`confirmed` ledger entries, if any).
   - Recompute and `INSERT` fresh `points_ledger` rows.
   - Mark the affected `(period, period_start, tier)` triplets in `leaderboard_snapshots` with a `stale = true` flag (see §2.2 update note). The Sunday cron rebuilds stale snapshots.
   - After the transaction commits, call M1's `createNotification({ type: 'score_overridden', user_ids: <all 4 participants' user_ids>, payload: { match_id } })`.
6. **Admin void:** Club admin can also set `match_results.status = 'void'` and `matches.status = 'void'`. Inside the same transaction, ledger rows are deleted and affected snapshots marked stale. No new ledger rows inserted. Post-commit, fires `createNotification({ type: 'score_overridden', ... payload: { match_id, void: true } })` to participants.

**Race conditions — explicitly handled:**

| Case | Trigger | Resolution |
|------|---------|------------|
| Both teams submit simultaneously | Two players on opposite sides hit submit within seconds | DB-level `UNIQUE(match_id)` rejects the second insert. Server Action returns `{ success: false, error: { code: 'CONFLICT', message: 'Already submitted by ${otherPlayerHandle}. Confirm or dispute that submission instead.' } }`. UI redirects loser-of-race to `/match/[id]/confirm`. |
| Two opposing players race to confirm | Both submit confirm within seconds | First-writer-wins via row-level lock (`SELECT … FOR UPDATE` on `match_results`). Second confirm is a no-op (status already `confirmed`); Server Action returns `{ success: true, data: { alreadyConfirmed: true } }`. |
| Pending TTL | No-one confirms within 48 hours | `vercel.json` adds a daily cron `/api/cron/expire-pending` that finds `match_results.status = 'pending' WHERE submitted_at < now() - INTERVAL '48 hours'`. For each: notify all club admins of the parent tournament's club; do **not** auto-confirm and do **not** auto-dispute (escalation only). Admin can then `admin_set` or `void`. |
| Confirm-during-admin-override | Admin overrides while opposing player hits confirm at the same moment | `admin_set` transition runs inside a transaction with `SELECT … FOR UPDATE`. Concurrent confirm sees the row already in `admin_set` and returns gracefully. |
| Two admins of same club race to override | Both admins click override within seconds | First-writer-wins via `SELECT … FOR UPDATE` inside the override transaction. Second admin sees `{ success: false, error: { code: 'ALREADY_OVERRIDDEN', message: 'Match was just overridden by ${otherAdmin.display_name}.' } }`. |

**Optimistic UI clarification.** Section 1.6 mentions optimistic UI for score submission. The optimistic state is **client-side only** via React 19 `useOptimistic` — the submitter sees the score reflected in *their own* `/me/matches` view immediately, plus a "Waiting for opponent confirmation" badge. **Public leaderboards do not change until confirm or admin_set.** This avoids a transient phantom leaderboard from a pending score that ends up disputed.

#### 4.7.4 Notifications

Backed by the `notifications` table (see §2.2). Fired in v0.5 for:
- Score pending your confirmation (target: opposing team players)
- Score confirmed (target: all 4 match participants)
- Score disputed (target: club admins of tournament's club)
- Pending expired (target: club admins)
- Admin override happened (target: all 4 match participants)
- Tier auto-promotion (target: promoted player)
- Tournament registration confirmed (target: registering player)

Surfaced via a `<Bell>` icon in the top nav, fed by a Server Component reading the user's unread notifications. No push / email in v0.5 — purely in-app, per §"Open questions".

### 4.8 Idempotency

- `UNIQUE (player_id, match_id)` on `points_ledger` makes scoring idempotent. `ON CONFLICT DO NOTHING`.
- Admin override: delete + reinsert ledger rows for that match. Mark affected weekly snapshot as `stale = true`.
- Sunday cron always rebuilds snapshots from the ledger. Fully derived state, always safe to re-run.
- If we tune scoring constants later, we can recompute historical ledger entries.

### 4.9 Auto-promotion / auto-demotion

**Auto-promotion** (in week-5 polish):
- Sunday cron checks each tier snapshot.
- **Snapshot population rule:** `leaderboard_snapshots` rows are generated **only for players who played at least 1 match in that snapshot's period** (i.e., have a `points_ledger` row with `earned_at` within the period). Players with zero matches in the period do not appear in that snapshot. This prevents inactive thin-tier players from ranking ≤ 3 by default.
- **Eligibility:** player's `rank` (per the §2.2 tie-breaker) ≤ 3 in **each** of 4 consecutive weekly snapshots, where the player was in the **same tier** at the start of each of those weeks (`players.tier` matches `snapshot.tier`), AND total cumulative `match_count ≥ 4` across the 4-week window. This prevents the "promoted with 0-2 matches in a thin tier" failure mode.
- **Action:** M4 cron calls M1's `promotePlayer({ player_id, new_tier, reason: 'auto_promote' })` Server Action. M1 wraps `tier_history` INSERT (close prior row's `to_date`, open new row with `from_date = now()`, `reason = 'auto_promote'`), `players.tier` UPDATE, and `createNotification('tier_promoted')` in a single `db.transaction`. M4 never writes to `tier_history`, `players`, or `notifications` directly.
- **Idempotency:** the cron job uses an advisory lock keyed off the period_start. SQL: `SELECT pg_advisory_lock(hashtextextended('padelz_promote_' || $period_start, 0))`. `hashtextextended` returns a `bigint`, which is the type `pg_advisory_lock` expects (the text-arg form does not exist). Lock is released on cron completion via `pg_advisory_unlock`.
- **Tier snapshot preservation:** promoted players' confirmed-match `points_ledger` entries are unchanged (tier was already snapshotted in `breakdown.your_tier` at match-confirm time).

**Auto-demotion deferred to v1.** The `auto_demote_opt_in` boolean is **not** in the v0.5 schema. `/me/settings` ships with no demotion toggle in v0.5.

### 4.10 File layout for M3

```
src/features/scoring/
  ├── constants.ts        # tier_mult, tournament_mod, format_mod values
  ├── rounding.ts         # roundHalfUp helper (Math.floor(x + 0.5))
  ├── calculate.ts        # pure: MatchInput → PointsAward[]
  ├── calculate.test.ts   # exhaustive Vitest matrix (~250 cases)
  ├── confirm.ts          # two-player confirm state machine
  ├── ledger.ts           # idempotent write to points_ledger
  ├── actions.ts          # Server Actions: submitScore, confirmScore, adminOverride, adminVoid
  └── types.ts            # MatchInput, PointsAward, Result<T> (imports Tier from M1)
```

---

## Section 5 — Error handling, observability, security

### 5.1 Error handling

- **Server Actions return typed `Result<T>`**:
  ```typescript
  type Result<T> =
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } };
  ```
  No throws across the wire. Client unwraps with a discriminated union.
- **Zod at every Server Action entry point.** Invalid input returns `{ success: false, error: { code: 'VALIDATION', ... } }`.
- **React Error Boundaries** via Next.js `error.tsx` at every feature-route level. Per-feature fallback UI.
- **Optimistic UI with rollback.** React 19 `useOptimistic` for score submissions, with toast on revert.
- **Offline score queue.** Service worker persists pending submissions via Background Sync API (Chromium/Edge). Fallback for iOS Safari (no Background Sync as of 2026-05): localStorage queue + `online` event listener that retries serially with 1s → 5s → 30s exponential backoff (3 retries total). After the 3rd retry fails, surface a "Submit failed, tap to retry" UI with the original payload preserved.
- **404 not 403** on unauthorized access (minimizes data surface).

### 5.2 Observability

| Concern | Tool | Wired where |
|---------|------|-------------|
| Runtime errors | Sentry | `instrumentation.ts` + sourcemaps via `next.config.mjs` |
| Server logs | Pino structured JSON | `src/libs/Logger.ts`, request_id middleware |
| Traffic | Vercel Analytics | layout.tsx, free tier |
| Core Web Vitals | Vercel Speed Insights | monitors perf budget in prod |
| DB query performance | Neon dashboard | watch p95 on hot reads |
| Uptime + smoke | GitHub Action `smoke-deploy.yml` | post-deploy URL probe |
| Product analytics | PostHog | deferred to v1 |

### 5.3 Security mapping (against `agent-security-guardrails.md`)

1. **Never process untrusted file payloads** — Vercel Blob uploads enforce 5MB max, MIME allowlist (jpeg/png/webp), no SVG (XSS risk). `sharp` re-encodes server-side, strips EXIF.
2. **Never follow URLs from external input** — player bio is plain text. No auto-linkification in v0.5.
3. **Never execute instructions in external data** — n/a v0.5; flag when we add bot integrations.
4. **Minimize data surface** — public APIs return only public fields. Email never in public profile response. 404 on unauth.
5. **Default read-only** — every Server Action re-authorizes ownership.
6. **Flag potential prompt injection** — n/a v0.5; flag when we add bot or AI features.

### 5.4 Specific security must-haves

| Risk | Mitigation |
|------|------------|
| Score spam | Rate limit: 10 submissions / min / player. Implementation: **Upstash Redis + `@upstash/ratelimit`** (matches `agent-security-guardrails` "default to read-only" rule + Vercel ecosystem). Locked choice, not "or". |
| Registration flood | Rate limit: 5 / min / IP. Plus Clerk bot protection |
| Profile photo XSS | No SVG. `sharp` re-encode + EXIF strip server-side |
| CSRF on Server Actions | Next.js 14 default (origin check + encrypted ID) |
| SQL injection | Drizzle parameterizes all queries |
| Clerk webhook spoofing | Svix signature mandatory on `/api/webhook/clerk` |
| Cron endpoint abuse | `CRON_SECRET` header check on `/api/cron/*` |
| Env sprawl | `t3-oss/env-nextjs` validates at boot |
| Account deletion | Soft delete `players`, redact PII, preserve ledger |

### 5.5 Build-deploy rules compliance

Every requirement from `~/.claude/rules/build-deploy-architecture.md` applies:

- Auto-deploy from `main` ON
- CI gate before deploy (`ci.yml`)
- Post-deploy smoke check (`smoke-deploy.yml`)
- Sentry DSN in Vercel prod env, verified day one
- Preview deploys smoke-tested before merge
- Production Deployment Protection ON before first non-team user

---

## Section 6 — Testing strategy + CI gates

### 6.1 Test pyramid

```
                  ▲
                 / \
                /E2E\         ~10 flows. Playwright vs preview.
               /─────\        Critical paths only.
              /       \
             /Integr.  \      ~50 tests. Vitest + ephemeral DB.
            /───────────\     Server Actions + webhook + cron.
           /             \
          /     Unit      \   ~250 tests. Pure logic.
         /─────────────────\  Scoring engine (~200), schemas, utils.
        ▼
```

### 6.2 What gets tested where

**Unit (Vitest):**
- Scoring engine: full matrix is **200+ tests**, not the 80 I first estimated. Math: 5 tiers × 5 opponent-avg-tiers × 2 tournament-types-in-v0.5 (open + club_internal) × 3 formats × 2 win/loss = 300 cases, minus impossible combos. Plus boundary cases for `roundHalfUp` at every half-integer tier average (4 cases) and at the 25-point participation floor (3+ cases). Plus base-points worked examples (21-19, 21-15, 21-3, 11-9, etc.) — at least 10. Total target: **~250 cases.** Required for the 100%-line-and-branch coverage in §6.7.
- Zod schemas: accept valid, reject invalid.
- Tier promotion logic: boundary conditions.
- Date / time utilities (ICT timezone).
- Slug generation, handle uniqueness.

**Integration (Vitest, ephemeral Postgres):**
- Server Actions assert DB side effects.
- Clerk webhook handler with mock Svix payload.
- Vercel Cron leaderboard rebuild.
- Points ledger idempotency (re-run = no-op).
- Admin override (delete + reinsert).
- Rate limit triggers correctly.

**E2E (Playwright vs preview):**
- Sign up → player profile created.
- Create tournament → register → submit score → confirm → see leaderboard update.
- Score dispute → club admin override.
- PWA install on mobile viewport.
- Public profile + leaderboard render unauthed.

**Performance (Lighthouse CI):**
- Landing: FCP <1.5s, LCP <2.5s, JS <50kb.
- Leaderboard: FCP <1.5s, LCP <2.5s, JS <80kb.
- Profile: same as landing.
- Tournament detail: FCP <1.5s, LCP <3.0s.
- Mobile + desktop runs separately.

### 6.3 CI workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on: [push, pull_request]

jobs:
  check-types:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, npm ci, npm run check-types]

  lint:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, npm ci, npm run lint]

  test-unit:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, npm ci, npm run test]

  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16 }
    steps: [checkout, setup-node, npm ci, db:migrate, npm run test:integration]

  test-e2e:
    runs-on: ubuntu-latest
    needs: [check-types, lint]
    steps: [checkout, setup-node, npm ci, playwright install, wait-for-vercel-preview, npm run test:e2e]

  lighthouse:
    runs-on: ubuntu-latest
    needs: [test-e2e]
    steps: [checkout, lhci autorun --upload.target=temporary-public-storage]
```

### 6.4 What blocks merge to main

| Check | Required? | Why |
|-------|-----------|-----|
| check-types | Yes | Type errors are real bugs |
| lint | Yes | Catches common mistakes |
| test-unit | Yes | Scoring engine breaks = product breaks |
| test-integration | Yes | DB side effects need verifying |
| test-e2e | Yes on PR, advisory on main | Flaky-prone but catches regressions |
| lighthouse perf budget | Yes | Stops mobile lag from creeping in |
| smoke-deploy (post-merge) | Alerts on fail | Catches the "built fine but didn't promote alias" 2026-05-13 bug |

### 6.5 Parallel-agent CI

Each worktree runs the same CI on push. Before opening a PR to main:

1. Agent finishes work in `feat/padel-mN-*` worktree.
2. Agent runs locally: `npm run check-types && npm run lint && npm run test`.
3. Agent pushes branch → GitHub Actions runs full suite.
4. If green, agent opens PR. Description names which module(s) it touches.
5. Tew (or Claude on Tew's behalf) reviews diff. Module-boundary conflicts (M2 ↔ M3 on matches) get explicit reasoning.
6. Merge requires green checks + reviewer approval. No skipping `--no-verify`.

Husky pre-commit hooks catch lint/format issues before push.

### 6.6 Test data + fixtures

- `scripts/seed.ts` creates dev data: 1 club, 4 players (1 per tier), 1 tournament with 2 matches submitted.
- Integration tests use ephemeral Postgres (local Docker), reset between test files.
- E2E tests run against Vercel preview deploys with a dedicated test Clerk org.
- Production data never touched by tests.

### 6.7 Coverage targets for v0.5

- Scoring engine: **100% line + branch** (it's pure; no excuse not to).
- Server Actions: **90%+** (the mutation surface).
- Schema / Zod validators: **100%** (cheap to write).
- UI components: not enforced (rely on E2E).
- Codecov via `codecov.yml` (Portal pattern). PRs that lower coverage warn.

---

## Open questions / deferred to v1+

- **Realtime architecture.** Live bracket view needs Pusher, Postgres LISTEN/NOTIFY, or SSE. Decide when v1 polish work starts.
- **Search.** Player + club search via pg_trgm GIN. Deferred until we have more than ~50 players.
- **Telegram bot.** Acquisition channel per CONTEXT.md. Designed as separate service; needs prompt-injection guardrails.
- **i18n.** Thai locale via `next-intl`. Add when first Thai-speaking player asks.
- **External tier verification.** Lunda / Playtomic screenshot → verified badge. UI design TBD.
- **Notifications.** v0.5 = in-app only. Push notifications via OneSignal or web push API in v1.
- **Annual invitational.** Not announced until participation hits threshold; design when triggered.

---

## Next step

Once this spec passes the `spec-document-reviewer` agent and final user approval, hand off to `writing-plans` skill to create the implementation plan with:
- Week-by-week task breakdown for each of M1–M4
- Foundation week 1 sequenced task list
- Dependency graph between modules
- Definition of done per task
- Demo checkpoints (Friday of each week)
- Risk register with mitigation
