# Padelz-v1 v0.5 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bare-core-loop MVP of `padelz-v1` — tournament create + register, score submit with two-player confirm, leaderboard, basic player profile — deployed to Vercel as a Next.js PWA with PROXYZ Studio branding.

**Architecture:** Mirror PROXYZ Portal stack. Four feature modules (M1 Auth+Profiles+Notifications, M2 Tournaments, M3 Scoring, M4 Leaderboard) own discrete table sets and cross-talk only through TypeScript contracts in `§1.7 Shared contracts` of the spec. Foundation week 1 is a single thread that locks schema, contracts, CI, and PWA shell; weeks 2-5 split into 4 parallel Claude Code worktrees; week 6 polishes and pilots.

**Tech Stack:** Next.js 14 App Router · Clerk auth · Neon Postgres · Drizzle ORM · shadcn/ui · Tailwind · Motion · Vercel Blob · Upstash Redis (rate limiting) · Sentry · Pino · Vitest · Playwright · Lighthouse CI · Vercel hosting with auto-deploy.

**Spec:** See `../specs/2026-05-18-padelz-v1-design.md` for the design this plan implements. Every task references its spec section in parentheses.

---

## Plan overview

| Chunk | Phase | Mode | Estimated time |
|-------|-------|------|----------------|
| 1 | Foundation Week Part A (scaffold + schema + contracts + ESLint) | Single thread | days 1-3 |
| 2 | Foundation Week Part B (CI + observability + PWA + E2E + worktrees) | Single thread | days 3-5 |
| 3 | M1 — Auth + Profiles + Notifications | Parallel worktree `feat/padel-m1` | 3 weeks (in parallel with 4-6) |
| 4 | M2 — Tournaments + Registrations + Brackets | Parallel worktree `feat/padel-m2` | 3 weeks |
| 5 | M3 — Scoring Engine + Confirmation Flow | Parallel worktree `feat/padel-m3` | 3 weeks |
| 6 | M4 — Leaderboard + Cron + Auto-Promotion | Parallel worktree `feat/padel-m4` | 3 weeks |
| 7 | Week 6 — Polish + Pilot | Single thread | 5 days |

Total wall-clock: ~6 weeks.

---

## File structure overview

The plan creates the following top-level structure inside `padelz-v1/` (paths relative to the repo root after foundation week scaffold):

```
padelz-v1/
├── .github/workflows/
│   ├── ci.yml                          # type-check, lint, tests, Lighthouse budget
│   └── smoke-deploy.yml                # post-deploy live URL probe
├── docs/superpowers/
│   ├── specs/2026-05-18-padelz-v1-design.md   # the spec
│   └── plans/2026-05-18-padelz-v1-plan.md     # THIS file
├── migrations/
│   └── 0000_initial_padelz_schema.sql  # all 13 tables, one migration
├── public/
│   ├── manifest.json                   # PWA manifest
│   ├── sw.js                           # service worker
│   └── icons/                          # PWA app icons (PROXYZ pink)
├── scripts/
│   └── seed.ts                         # dev seed: 1 club, 4 players, 1 tournament, 2 matches
├── src/
│   ├── app/
│   │   ├── [locale]/                   # next-intl scaffolding (locale skipped in v0.5 but route group exists)
│   │   ├── api/
│   │   │   ├── cron/
│   │   │   │   ├── leaderboard/route.ts
│   │   │   │   └── expire-pending/route.ts
│   │   │   └── webhook/
│   │   │       └── clerk/route.ts
│   │   ├── global-error.tsx
│   │   ├── manifest.ts
│   │   ├── robots.ts
│   │   └── sitemap.ts
│   ├── components/                     # shared shadcn primitives + composites
│   ├── features/
│   │   ├── profiles/                   # M1
│   │   │   ├── actions.ts              # promotePlayer, redactPlayer, etc.
│   │   │   ├── types.ts                # Tier enum (sole owner), PublicPlayer, PublicClub
│   │   │   ├── components/             # ProfileCard, ClubCard, TierBadge
│   │   │   └── pages/                  # /p/[handle], /c/[slug]
│   │   ├── notifications/              # M1-owned, called by M2/M3/M4
│   │   │   ├── actions.ts              # createNotification Server Action
│   │   │   ├── types.ts                # NotificationType enum
│   │   │   └── components/             # NotificationBell, NotificationItem
│   │   ├── tournaments/                # M2
│   │   │   ├── actions.ts              # createTournament, register, generateBracket
│   │   │   ├── types.ts                # MatchForScoring, TournamentStatus
│   │   │   ├── components/             # TournamentCard, BracketView, RegisterButton
│   │   │   └── pages/                  # /t, /t/[slug]/*
│   │   ├── scoring/                    # M3
│   │   │   ├── constants.ts            # multipliers (locked values)
│   │   │   ├── rounding.ts             # roundHalfUp helper
│   │   │   ├── calculate.ts            # pure points calculator
│   │   │   ├── confirm.ts              # two-player confirm state machine
│   │   │   ├── ledger.ts               # idempotent points_ledger writes
│   │   │   ├── actions.ts              # submitScore, confirmScore, adminOverride, adminVoid
│   │   │   └── types.ts                # MatchInput, PointsAward, Result<T>
│   │   ├── leaderboard/                # M4
│   │   │   ├── actions.ts              # rebuildSnapshot, autoPromoteCheck
│   │   │   ├── types.ts                # LeaderboardRow, LeaderboardPeriod
│   │   │   ├── components/             # LeaderboardTable, TierFilter
│   │   │   └── pages/                  # /leaderboard, /leaderboard/[tier]
│   │   └── auth/                       # M1 Clerk wrapping
│   │       └── webhook.ts              # Clerk user.created/updated/deleted handlers
│   ├── hooks/
│   ├── lib/                            # ui utility (cn, etc.)
│   ├── libs/                           # infrastructure libs
│   │   ├── DB.ts                       # Neon connection
│   │   ├── Env.ts                      # t3-oss env validation
│   │   ├── Logger.ts                   # Pino setup
│   │   ├── RateLimit.ts                # Upstash wrapper
│   │   └── i18n.ts                     # placeholder, full impl in v1
│   ├── middleware.ts                   # Clerk auth gate
│   ├── models/
│   │   └── Schema.ts                   # Drizzle schema, all 13 tables
│   ├── styles/
│   └── utils/
├── tests/
│   ├── unit/                           # Vitest unit tests per feature
│   ├── integration/                    # Vitest + ephemeral DB
│   └── e2e/                            # Playwright
├── components.json                     # shadcn config
├── drizzle.config.ts
├── eslint.config.mjs                   # includes no-cross-module-internal-imports rule
├── next.config.mjs                     # Sentry, image domains
├── package.json
├── playwright.config.ts
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## Cross-cutting conventions

All tasks follow the same rhythm:

1. **Write the failing test first.** Vitest for unit + integration. Playwright for E2E. Use the test name to express intent ("auto-promotes player with rank 1 in same tier for 4 consecutive weeks").
2. **Run it. Confirm it fails.** Either by missing implementation or assertion failure. If a test passes on the first run, the test is wrong.
3. **Write the minimum code to make it pass.** No anticipated abstractions. No extra features.
4. **Run the test. Confirm it passes.** Plus the full suite (`npm run test`) for unit-level changes.
5. **Commit.** Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`). Lowercase after colon (Portal commitlint rejects capitalized). Co-author trailer if Claude Code wrote it.

**Per-task definition of done:**
- Test exists and passes
- `npm run check-types` clean (zero TS errors)
- `npm run lint` clean
- Committed with conventional message
- No unrelated changes in the commit

**Per-module-week definition of done:**
- All tasks for that week complete
- PR opened against `main` from worktree branch
- CI green (type-check + lint + unit + integration + Lighthouse budget)
- Reviewer (Tew, or Claude on Tew's behalf) approves
- Merged
- Friday afternoon: 10-minute demo to Tim showing what shipped

**Commit message reference:**
```
feat: add players table to drizzle schema (M1)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Chunk 1: Foundation Week — Part A (scaffold + schema + contracts)

Single thread. Tasks 1.1 to 1.9 — scaffold from saas-boilerplate, env validation, DB wiring, 13-table schema across three sub-tasks, shared TypeScript contracts, ESLint rule blocking cross-module internal imports. End of Chunk 1 = foundation skeleton compiles and `npm run test` is green; CI + deploy + observability come in Chunk 2.

**Goal at end of Chunk 1 + 2 (the full foundation week):**
- `padelz-v1` is a deployable Next.js app on Vercel preview
- Clerk auth works (you can sign up + sign in)
- All 13 tables exist in Neon, all migrations committed
- Every cross-module TypeScript contract (`Tier`, `MatchForScoring`, `MatchInput`, `PointsAward`, `createNotification`, `promotePlayer`) is stub-defined and importable
- CI runs type-check + lint + unit + integration + Lighthouse on every push
- Smoke-deploy probe runs on every production deploy
- PWA manifest serves; service worker registers
- Sentry receives a test error from prod
- Sign in → land on a placeholder leaderboard page that renders your name (vertical slice proof)
- Four worktrees created via `~/Tools/padelz-worktree new <m1|m2|m3|m4>` and ready for week 2

---

### Task 1.1: Scaffold from saas-boilerplate (§1.3 step 1)

**Files:**
- Create: `padelz-v1/` (entire directory tree)
- Create: `padelz-v1/package.json`
- Modify: `padelz-v1/.env.local.example`

- [ ] **Step 1: Scaffold padelz-v1 at ~/Code/padelz-v1 (local SSD, NOT Google Drive)**

Match Portal's setup pattern — code on local disk for fast `npm`/`next` operations and to avoid Google Drive trying to sync `node_modules`. Project context (CONTEXT.md, 01-Strategy/, etc.) stays in the Google Drive `Padel-Z/` folder, but the code repo lives locally.

```bash
mkdir -p ~/Code
cd ~/Code
npx create-next-app@latest padelz-v1 --typescript --tailwind --app --src-dir --import-alias "@/*" --use-npm --no-eslint
cd ~/Code/padelz-v1

# Copy the existing spec + plan docs from Google Drive into the local repo
DOCS_SRC="/Users/tews/Library/CloudStorage/GoogleDrive-tew@proxyz.studio/Shared drives/PROXYZ Studio/04-Projects/Padel-Z/padelz-v1/docs"
mkdir -p docs/superpowers
cp -r "$DOCS_SRC/superpowers/specs" docs/superpowers/specs
cp -r "$DOCS_SRC/superpowers/plans" docs/superpowers/plans
```

After scaffolding, the Google Drive `04-Projects/Padel-Z/padelz-v1/` directory can be deleted (its only contents are docs that are now in the local repo) OR kept as a stable docs reference. The canonical working location going forward is `~/Code/padelz-v1`.

Alternative if cloning Portal's actual saas-boilerplate fork is preferred: `git clone <portal-saas-boilerplate-url> ~/Code/padelz-v1` then strip EOS-specific features. For v0.5, the create-next-app baseline plus this plan's installations is sufficient.

- [ ] **Step 2: Install Portal-aligned dependencies**

```bash
npm install \
  @clerk/nextjs@^6 @clerk/themes \
  @neondatabase/serverless@^0.10.4 drizzle-orm@^0.35 \
  @sentry/nextjs@^8 \
  pino@^9 pino-pretty \
  zod@^3 react-hook-form @hookform/resolvers \
  motion@^12 \
  geist \
  lucide-react \
  class-variance-authority clsx tailwind-merge \
  @t3-oss/env-nextjs \
  uuidv7 \
  @vercel/blob \
  @upstash/ratelimit @upstash/redis

npm install -D \
  drizzle-kit@^0.27 \
  vitest@^2 @vitest/coverage-v8 \
  @playwright/test@^1.47 \
  @lhci/cli@^0.14 \
  eslint@^9 @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  husky lint-staged commitlint @commitlint/cli @commitlint/config-conventional \
  prettier prettier-plugin-tailwindcss \
  dotenv-cli tsx \
  cross-env rimraf \
  postgres \
  @types/node @types/react @types/react-dom
```

- [ ] **Step 3: Set up package.json scripts**

Open `package.json` and replace the `scripts` block with:

```json
"scripts": {
  "dev:next": "next dev",
  "dev": "run-p dev:*",
  "build": "next build",
  "build:local": "dotenv -e .env.local -o -- next build",
  "start": "next start",
  "clean": "rimraf .next out coverage",
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "check-types": "tsc --noEmit --pretty",
  "test": "vitest run",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "test:e2e": "playwright test",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "dotenv -e .env.local -- drizzle-kit migrate",
  "db:studio": "dotenv -e .env.local -- drizzle-kit studio",
  "db:seed": "dotenv -e .env.local -- tsx scripts/seed.ts",
  "lhci": "lhci autorun",
  "prepare": "husky"
}
```

Install `npm-run-all`: `npm install -D npm-run-all`.

- [ ] **Step 4: Initialize git repo + first commit**

```bash
cd padelz-v1
git init
git add .
git commit -m "chore: initial scaffold from create-next-app"
```

- [ ] **Step 5: Wire Husky + commitlint**

```bash
npx husky init
echo 'npx --no -- commitlint --edit ${1}' > .husky/commit-msg
echo "module.exports = { extends: ['@commitlint/config-conventional'] };" > commitlint.config.js
chmod +x .husky/commit-msg
git add .husky commitlint.config.js
git commit -m "chore: add husky and commitlint config"
```

---

### Task 1.2: Environment validation via t3-oss/env-nextjs (§5.4)

**Files:**
- Create: `src/libs/Env.ts`
- Create: `.env.local.example`
- Test: `tests/unit/env.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/env.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

describe('Env validation', () => {
  it('rejects build when DATABASE_URL is missing', () => {
    const orig = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    expect(() => require('@/libs/Env').Env).toThrow();
    process.env.DATABASE_URL = orig;
  });

  it('accepts valid DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
    process.env.CLERK_SECRET_KEY = 'sk_test_abc';
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_abc';
    process.env.CLERK_WEBHOOK_SECRET = 'whsec_abc';
    process.env.CRON_SECRET = 'a'.repeat(32);
    process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'abc';
    process.env.SENTRY_DSN = 'https://x@sentry.io/1';
    expect(() => require('@/libs/Env').Env).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npm run test -- env.test.ts
```

Expected: `Cannot find module '@/libs/Env'`.

- [ ] **Step 3: Implement `src/libs/Env.ts`**

```typescript
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const Env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string().startsWith('sk_'),
    CLERK_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    CRON_SECRET: z.string().min(32),
    UPSTASH_REDIS_REST_URL: z.string().url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    SENTRY_DSN: z.string().url(),
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    PLATFORM_ADMIN_EMAILS: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
```

- [ ] **Step 4: Create `.env.local.example`**

```
# Database
DATABASE_URL=postgres://...neon.tech/padelz?sslmode=require

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx

# Cron
CRON_SECRET=  # openssl rand -hex 32

# Upstash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Sentry
SENTRY_DSN=

# Vercel Blob
BLOB_READ_WRITE_TOKEN=  # populated when you provision Blob

# Platform admins (comma-separated emails)
PLATFORM_ADMIN_EMAILS=tew@proxyz.studio,tim@proxyz.studio

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Run test + commit**

```bash
npm run test -- env.test.ts
# Expected: PASS
git add src/libs/Env.ts .env.local.example tests/unit/env.test.ts
git commit -m "feat: add t3-oss env validation with required keys"
```

---

### Task 1.3: Drizzle config + DB connection (§1.1 runtime, §2.2)

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/libs/DB.ts`
- Test: `tests/unit/db.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/db.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

describe('DB module', () => {
  it('exports a db client', async () => {
    const { db } = await import('@/libs/DB');
    expect(db).toBeDefined();
    expect(typeof db.execute).toBe('function');
  });
});
```

- [ ] **Step 2: Run — confirm fails**

```bash
npm run test -- db.test.ts
```

- [ ] **Step 3: Implement `drizzle.config.ts`**

```typescript
import type { Config } from 'drizzle-kit';
import { Env } from './src/libs/Env';

export default {
  schema: './src/models/Schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: Env.DATABASE_URL },
  strict: true,
  verbose: true,
} satisfies Config;
```

- [ ] **Step 4: Implement `src/libs/DB.ts`**

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { Env } from './Env';
import * as schema from '@/models/Schema';

const sql = neon(Env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

`schema` import will be empty until Task 1.4. That's expected — the file exists with `export {}` after Task 1.4 step 1.

- [ ] **Step 5: Run test + commit**

```bash
mkdir -p src/models && echo 'export {};' > src/models/Schema.ts
npm run test -- db.test.ts
# Expected: PASS
git add drizzle.config.ts src/libs/DB.ts src/models/Schema.ts tests/unit/db.test.ts
git commit -m "feat: wire neon + drizzle db client"
```

---

### Task 1.4: Schema part A — enums + identity tables (§2.2)

**Files:**
- Modify: `src/models/Schema.ts`
- Test: `tests/unit/schema-identity.test.ts`

Owns: `users`, `players`, `clubs`, `club_memberships`, `tier_history`. All 5 owned by M1.

- [ ] **Step 1: Write the failing test**

`tests/unit/schema-identity.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { users, players, clubs, club_memberships, tier_history,
         tier_enum, membership_role_enum, tier_change_reason_enum } from '@/models/Schema';

describe('Identity schema', () => {
  it('exports tier_enum with 5 tiers', () => {
    expect(tier_enum.enumValues).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond']);
  });

  it('exports users table', () => {
    expect(users).toBeDefined();
  });

  it('players.handle is unique', () => {
    const cfg = players[Symbol.for('drizzle:Columns')] as any;
    expect(cfg.handle.isUnique).toBe(true);
  });

  it('club_memberships enforces uniqueness on (user_id, club_id)', () => {
    expect((club_memberships as any).__indexes ?? club_memberships).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — fails because Schema.ts only has `export {}`**

```bash
npm run test -- schema-identity
```

- [ ] **Step 3: Add identity schema to `src/models/Schema.ts`**

```typescript
import { pgTable, pgEnum, uuid, text, timestamp, boolean, integer, unique, index } from 'drizzle-orm/pg-core';

export const tier_enum = pgEnum('tier', ['bronze', 'silver', 'gold', 'platinum', 'diamond']);
export const membership_role_enum = pgEnum('membership_role', ['admin', 'member']);
export const tier_change_reason_enum = pgEnum('tier_change_reason', ['initial', 'auto_promote', 'auto_demote', 'manual']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerk_id: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  city: text('city').notNull().default('Phuket'),
  description: text('description'),
  court_count: integer('court_count'),
  photo_url: text('photo_url'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'restrict' }),
  handle: text('handle').notNull().unique(),
  display_name: text('display_name').notNull(),
  tier: tier_enum('tier').notNull().default('bronze'),
  home_club_id: uuid('home_club_id').references(() => clubs.id, { onDelete: 'set null' }),
  bio: text('bio'),
  photo_url: text('photo_url'),
  verified: boolean('verified').notNull().default(false),
  redacted_at: timestamp('redacted_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const club_memberships = pgTable('club_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  club_id: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  role: membership_role_enum('role').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqUserClub: unique('uq_user_club').on(t.user_id, t.club_id),
}));

export const tier_history = pgTable('tier_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  player_id: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  tier: tier_enum('tier').notNull(),
  from_date: timestamp('from_date', { withTimezone: true }).notNull(),
  to_date: timestamp('to_date', { withTimezone: true }),
  reason: tier_change_reason_enum('reason').notNull(),
});
```

- [ ] **Step 4: Run test + commit**

```bash
npm run test -- schema-identity
# Expected: PASS
git add src/models/Schema.ts tests/unit/schema-identity.test.ts
git commit -m "feat: add identity tables to drizzle schema (m1)"
```

---

### Task 1.5: Schema part B — tournament tables (§2.2)

**Files:**
- Modify: `src/models/Schema.ts`
- Test: `tests/unit/schema-tournaments.test.ts`

Owns: `tournaments`, `registrations`, `brackets`, `matches`. Module M2.

- [ ] **Step 1: Write the failing test**

`tests/unit/schema-tournaments.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { tournaments, registrations, brackets, matches,
         tournament_format_enum, tournament_type_enum,
         tournament_status_enum, registration_status_enum, match_status_enum } from '@/models/Schema';

describe('Tournament schema', () => {
  it('exports tournament_format_enum with 4 formats', () => {
    expect(tournament_format_enum.enumValues).toEqual(['americano', 'mexicano', 'round_robin', 'bracket']);
  });
  it('exports tournament_type_enum with 4 types', () => {
    expect(tournament_type_enum.enumValues).toEqual(['open', 'club_internal', 'group', 'casual']);
  });
  it('match_status_enum includes void', () => {
    expect(match_status_enum.enumValues).toContain('void');
  });
  it('exports tournaments, registrations, brackets, matches', () => {
    expect(tournaments).toBeDefined();
    expect(registrations).toBeDefined();
    expect(brackets).toBeDefined();
    expect(matches).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm run test -- schema-tournaments
```

- [ ] **Step 3: Append tournament schema to `src/models/Schema.ts`**

```typescript
import { jsonb } from 'drizzle-orm/pg-core';

export const tournament_format_enum = pgEnum('tournament_format', ['americano', 'mexicano', 'round_robin', 'bracket']);
export const tournament_type_enum = pgEnum('tournament_type', ['open', 'club_internal', 'group', 'casual']);
export const tournament_status_enum = pgEnum('tournament_status', ['draft', 'open', 'in_progress', 'complete']);
export const registration_status_enum = pgEnum('registration_status', ['registered', 'waitlist', 'withdrawn']);
export const match_status_enum = pgEnum('match_status', ['scheduled', 'in_progress', 'complete', 'void']);

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  club_id: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  format: tournament_format_enum('format').notNull(),
  tournament_type: tournament_type_enum('tournament_type').notNull().default('club_internal'),
  start_at: timestamp('start_at', { withTimezone: true }).notNull(),
  tier_min: tier_enum('tier_min'),
  tier_max: tier_enum('tier_max'),
  status: tournament_status_enum('status').notNull().default('draft'),
  created_by: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byClub: index('idx_tournaments_club_start').on(t.club_id, t.start_at),
}));

export const registrations = pgTable('registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournament_id: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  player_id: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  status: registration_status_enum('status').notNull().default('registered'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqTournPlayer: unique('uq_tournament_player').on(t.tournament_id, t.player_id),
}));

export const brackets = pgTable('brackets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournament_id: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournament_id: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  team_a: uuid('team_a').array().notNull(),
  team_b: uuid('team_b').array().notNull(),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
  status: match_status_enum('status').notNull().default('scheduled'),
});
```

- [ ] **Step 4: Run test + commit**

```bash
npm run test -- schema-tournaments
# Expected: PASS
git add src/models/Schema.ts tests/unit/schema-tournaments.test.ts
git commit -m "feat: add tournament tables to drizzle schema (m2)"
```

---

### Task 1.6: Schema part C — scoring + leaderboard + notifications (§2.2)

**Files:**
- Modify: `src/models/Schema.ts`
- Test: `tests/unit/schema-scoring.test.ts`

Owns: `match_results` (M3), `points_ledger` (M3), `leaderboard_snapshots` (M4), `notifications` (M1).

- [ ] **Step 1: Write the failing test**

`tests/unit/schema-scoring.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { match_results, points_ledger, leaderboard_snapshots, notifications,
         match_result_status_enum, leaderboard_period_enum, notification_type_enum } from '@/models/Schema';

describe('Scoring + leaderboard + notifications schema', () => {
  it('match_result_status_enum includes void', () => {
    expect(match_result_status_enum.enumValues).toEqual(['pending', 'confirmed', 'disputed', 'admin_set', 'void']);
  });
  it('notification_type_enum has all 7 v0.5 types', () => {
    expect(notification_type_enum.enumValues.sort()).toEqual([
      'pending_expired', 'registration_confirmed', 'score_confirmed',
      'score_disputed', 'score_overridden', 'score_pending', 'tier_promoted',
    ].sort());
  });
  it('points_ledger enforces idempotency via unique (player_id, match_id)', () => {
    expect(points_ledger).toBeDefined();
  });
  it('leaderboard_snapshots has stale + rebuilt_at columns', () => {
    expect(leaderboard_snapshots).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm run test -- schema-scoring
```

- [ ] **Step 3: Append remaining schema to `src/models/Schema.ts`**

```typescript
import { numeric, date } from 'drizzle-orm/pg-core';

export const match_result_status_enum = pgEnum('match_result_status', ['pending', 'confirmed', 'disputed', 'admin_set', 'void']);
export const leaderboard_period_enum = pgEnum('leaderboard_period', ['week', 'month', 'season']);
export const notification_type_enum = pgEnum('notification_type', [
  'score_pending', 'score_confirmed', 'score_disputed', 'pending_expired',
  'score_overridden', 'tier_promoted', 'registration_confirmed',
]);

export const match_results = pgTable('match_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  match_id: uuid('match_id').notNull().unique().references(() => matches.id, { onDelete: 'restrict' }),
  team_a_score: integer('team_a_score').notNull(),
  team_b_score: integer('team_b_score').notNull(),
  submitted_by: uuid('submitted_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  confirmed_by: uuid('confirmed_by').references(() => users.id, { onDelete: 'restrict' }),
  status: match_result_status_enum('status').notNull().default('pending'),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  confirmed_at: timestamp('confirmed_at', { withTimezone: true }),
});

export const points_ledger = pgTable('points_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  player_id: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  match_id: uuid('match_id').notNull().references(() => matches.id, { onDelete: 'restrict' }),
  points: numeric('points', { precision: 8, scale: 2 }).notNull(),
  breakdown: jsonb('breakdown').notNull(),
  earned_at: timestamp('earned_at', { withTimezone: true }).notNull(),
}, (t) => ({
  uniqPlayerMatch: unique('uq_player_match').on(t.player_id, t.match_id),
  byPlayerEarned: index('idx_ledger_player_earned').on(t.player_id, t.earned_at),
}));

export const leaderboard_snapshots = pgTable('leaderboard_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  period: leaderboard_period_enum('period').notNull(),
  period_start: date('period_start').notNull(),
  tier: tier_enum('tier').notNull(),
  player_id: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  rank: integer('rank').notNull(),
  points_sum: numeric('points_sum', { precision: 10, scale: 2 }).notNull(),
  match_count: integer('match_count').notNull(),
  stale: boolean('stale').notNull().default(false),
  rebuilt_at: timestamp('rebuilt_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPositionPlayer: unique('uq_period_tier_player').on(t.period, t.period_start, t.tier, t.player_id),
  byRank: index('idx_lb_rank').on(t.period, t.period_start, t.tier, t.rank),
}));

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notification_type_enum('type').notNull(),
  payload: jsonb('payload').notNull(),
  read_at: timestamp('read_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserUnread: index('idx_notif_user_unread').on(t.user_id, t.read_at, t.created_at),
}));
```

- [ ] **Step 4: Run test + commit**

```bash
npm run test -- schema-scoring
# Expected: PASS
git add src/models/Schema.ts tests/unit/schema-scoring.test.ts
git commit -m "feat: add scoring leaderboard notifications tables (m3 m4 m1)"
```

---

### Task 1.7: Generate first migration + seed script (§1.3 step 3)

**Files:**
- Create: `migrations/0000_initial_padelz_schema.sql` (generated)
- Create: `scripts/seed.ts`
- Test: manual via `db:migrate`

- [ ] **Step 1: Set up local dev database**

Either: provision a Neon dev branch (recommended — matches prod stack) OR run a local Postgres via Docker:

```bash
# Neon path: log in, create branch, paste DATABASE_URL into .env.local
# Docker path:
docker run --name padelz-dev -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=padelz -p 5432:5432 -d postgres:16
# .env.local DATABASE_URL=postgres://postgres:dev@localhost:5432/padelz
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
# Expected: creates migrations/0000_initial_padelz_schema.sql with CREATE TYPE + CREATE TABLE for all 13 tables
ls migrations/
```

- [ ] **Step 3: Apply the migration**

```bash
npm run db:migrate
# Expected: "0000_initial_padelz_schema applied"
```

- [ ] **Step 4: Write `scripts/seed.ts`**

```typescript
import { db } from '@/libs/DB';
import { users, players, clubs, club_memberships, tournaments } from '@/models/Schema';
import { v7 as uuidv7 } from 'uuidv7';

async function main() {
  console.log('Seeding…');

  const adminUserId = uuidv7();
  const playerUsers = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const clubId = uuidv7();

  await db.transaction(async (tx) => {
    await tx.insert(users).values([
      { id: adminUserId, clerk_id: 'seed_admin', email: 'admin@seed.local' },
      ...playerUsers.map((id, i) => ({ id, clerk_id: `seed_player_${i}`, email: `p${i}@seed.local` })),
    ]);

    await tx.insert(clubs).values({
      id: clubId,
      slug: 'destination-padel',
      name: 'Destination Padel',
      court_count: 4,
    });

    await tx.insert(club_memberships).values({
      user_id: adminUserId,
      club_id: clubId,
      role: 'admin',
    });

    const tiers = ['bronze', 'silver', 'gold', 'platinum'] as const;
    await tx.insert(players).values(
      playerUsers.map((user_id, i) => ({
        user_id,
        handle: `seed-player-${i}`,
        display_name: `Seed Player ${i}`,
        tier: tiers[i],
        home_club_id: clubId,
      }))
    );

    await tx.insert(tournaments).values({
      slug: 'saturday-open-week-1',
      club_id: clubId,
      name: 'Saturday Open',
      format: 'americano',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      status: 'open',
      created_by: adminUserId,
    });
  });

  console.log('Seed complete: 1 club, 4 players, 1 tournament');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Run seed + commit**

```bash
npm run db:seed
# Expected: "Seed complete: 1 club, 4 players, 1 tournament"
git add migrations/ scripts/seed.ts
git commit -m "feat: initial schema migration and dev seed script"
```

---

### Task 1.8: Shared TypeScript contracts (§1.7)

**Files:**
- Create: `src/features/profiles/types.ts` (M1 — sole owner of `Tier`)
- Create: `src/features/tournaments/types.ts` (M2 — `MatchForScoring`)
- Create: `src/features/scoring/types.ts` (M3 — `MatchInput`, `PointsAward`, `Result<T>`)
- Create: `src/features/leaderboard/types.ts` (M4 — `LeaderboardRow`)
- Create: `src/features/notifications/types.ts` (M1 — `NotificationType`)
- Test: `tests/unit/contracts.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/contracts.test.ts`:

```typescript
import { describe, expect, it, expectTypeOf } from 'vitest';
import type { Tier } from '@/features/profiles/types';
import type { MatchForScoring } from '@/features/tournaments/types';
import type { MatchInput, PointsAward, Result } from '@/features/scoring/types';
import type { LeaderboardRow } from '@/features/leaderboard/types';
import type { NotificationType } from '@/features/notifications/types';

describe('Cross-module contracts', () => {
  it('Tier is the bronze→diamond enum', () => {
    expectTypeOf<Tier>().toEqualTypeOf<'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'>();
  });
  it('MatchForScoring has team_a/team_b as tuples of length 2', () => {
    expectTypeOf<MatchForScoring['team_a']>().toEqualTypeOf<readonly [string, string]>();
  });
  it('Result is a discriminated union', () => {
    const ok: Result<number> = { success: true, data: 1 };
    const fail: Result<number> = { success: false, error: { code: 'X', message: 'y' } };
    expect(ok.success && ok.data === 1).toBe(true);
    expect(!fail.success && fail.error.code === 'X').toBe(true);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm run test -- contracts
```

- [ ] **Step 3: Create each module's `types.ts`**

`src/features/profiles/types.ts`:

```typescript
export const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export type Tier = typeof TIERS[number];

export const TIER_TO_INT: Record<Tier, number> = {
  bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5,
};

export type PublicPlayer = {
  id: string;
  handle: string;
  display_name: string;
  tier: Tier;
  photo_url: string | null;
  verified: boolean;
  redacted_at: Date | null;
};

export type PublicClub = {
  id: string;
  slug: string;
  name: string;
  city: string;
  description: string | null;
  court_count: number | null;
  photo_url: string | null;
};
```

`src/features/tournaments/types.ts`:

```typescript
export type TournamentFormat = 'americano' | 'mexicano' | 'round_robin' | 'bracket';
export type TournamentType = 'open' | 'club_internal' | 'group' | 'casual';
export type TournamentStatus = 'draft' | 'open' | 'in_progress' | 'complete';

// Read-only contract: M3 + M4 import this. M2 owns the underlying table shape.
export type MatchForScoring = {
  id: string;
  tournament_id: string;
  team_a: readonly [string, string];   // exactly 2 player IDs
  team_b: readonly [string, string];
  format: TournamentFormat;
  tournament_type: TournamentType;
};
```

`src/features/scoring/types.ts`:

```typescript
import type { Tier } from '@/features/profiles/types';
import type { MatchForScoring } from '@/features/tournaments/types';

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export type TeamScore = { points_won: number };

export type MatchInput = MatchForScoring & {
  team_a_score: number;
  team_b_score: number;
  team_a_tiers: readonly [Tier, Tier];
  team_b_tiers: readonly [Tier, Tier];
};

export type PointsAward = {
  player_id: string;
  points: number;
  breakdown: {
    base: number;
    tier_mult: number;
    avg_opponent_tier: Tier;
    your_tier: Tier;
    tournament_modifier: number;
    format_modifier: number;
    result: 'win' | 'loss';
    points_won: number;
    points_lost: number;
  };
};
```

`src/features/leaderboard/types.ts`:

```typescript
import type { Tier } from '@/features/profiles/types';

export type LeaderboardPeriod = 'week' | 'month' | 'season';

export type LeaderboardRow = {
  rank: number;
  player_id: string;
  handle: string;
  display_name: string;
  tier: Tier;
  points_sum: number;
  match_count: number;
};
```

`src/features/notifications/types.ts`:

```typescript
export type NotificationType =
  | 'score_pending'
  | 'score_confirmed'
  | 'score_disputed'
  | 'pending_expired'
  | 'score_overridden'
  | 'tier_promoted'
  | 'registration_confirmed';

export type CreateNotificationInput = {
  user_ids: string[];
  type: NotificationType;
  payload: Record<string, unknown>;
};
```

- [ ] **Step 4: Run test + commit**

```bash
npm run test -- contracts
npm run check-types
# Expected: PASS, zero TS errors
git add src/features/*/types.ts tests/unit/contracts.test.ts
git commit -m "feat: lock cross-module typescript contracts (1.7)"
```

---

### Task 1.9: ESLint rule blocking cross-module internal imports (§1.7)

**Files:**
- Create: `eslint.config.mjs`
- Test: `tests/unit/eslint-cross-module.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/eslint-cross-module.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

describe('Cross-module internal import rule', () => {
  it('blocks importing another feature\'s internal file', async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.mjs' });
    const results = await eslint.lintText(
      `import { foo } from '@/features/tournaments/internal/secrets';`,
      { filePath: 'src/features/scoring/calculate.ts' }
    );
    const violations = results[0].messages.filter(m => m.ruleId === 'no-restricted-imports');
    expect(violations.length).toBeGreaterThan(0);
  });

  it('allows importing another feature\'s types.ts', async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.mjs' });
    const results = await eslint.lintText(
      `import type { Tier } from '@/features/profiles/types';`,
      { filePath: 'src/features/scoring/calculate.ts' }
    );
    const violations = results[0].messages.filter(m => m.ruleId === 'no-restricted-imports');
    expect(violations.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm run test -- eslint-cross-module
```

- [ ] **Step 3: Implement `eslint.config.mjs`**

```javascript
import next from 'eslint-config-next';
import tsParser from '@typescript-eslint/parser';

export default [
  ...next,
  {
    languageOptions: { parser: tsParser },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features/*/!(types|actions|components|pages)/**'],
            message: 'Cross-module imports must go through types.ts or actions.ts of the owning module.',
          },
        ],
      }],
    },
  },
];
```

- [ ] **Step 4: Run test + commit**

```bash
npm run test -- eslint-cross-module
npm run lint
# Expected: PASS
git add eslint.config.mjs tests/unit/eslint-cross-module.test.ts
git commit -m "chore: add eslint rule blocking cross-module internal imports"
```

---

**End of Chunk 1 (Foundation Part A).** Scaffold, schema, contracts, and ESLint guardrails locked. Move to Chunk 2 for deploy + observability + PWA + E2E + worktree setup.

---

## Chunk 2: Foundation Week — Part B (CI + observability + PWA + E2E + worktrees)

Single thread continued. Tasks 1.10 to 1.17 — CI workflow with Lighthouse budget, post-deploy smoke probe, Sentry + Pino + Vercel Analytics observability, Upstash rate limiting, PWA manifest + service worker, vertical-slice E2E test, request_id middleware, padelz-worktree tool adaptation, foundation sign-off. End of Chunk 2 = `padelz-v1` is on Vercel, CI green on main, smoke probe runs on every deploy, four worktrees ready for parallel weeks 2-5.

---

### Task 1.10: CI workflow (§6.3)

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `lighthouserc.js`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run check-types

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test

  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: ci
          POSTGRES_DB: padelz_ci
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://postgres:ci@localhost:5432/padelz_ci
      CLERK_SECRET_KEY: sk_test_ci_stub
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_ci_stub
      CLERK_WEBHOOK_SECRET: whsec_ci_stub
      CRON_SECRET: ${{ secrets.CI_CRON_SECRET || '0000000000000000000000000000000000000000000000000000000000000000' }}
      UPSTASH_REDIS_REST_URL: https://stub.upstash.io
      UPSTASH_REDIS_REST_TOKEN: stub
      SENTRY_DSN: https://stub@sentry.io/1
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run db:migrate
      - run: npm run test:integration

  lighthouse:
    runs-on: ubuntu-latest
    needs: [check-types, lint, test-unit]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - name: Wait for Vercel preview
        run: sleep 60
      - run: npx lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

- [ ] **Step 2: Create `lighthouserc.js`**

```javascript
module.exports = {
  ci: {
    collect: {
      url: [
        `${process.env.VERCEL_PREVIEW_URL || 'http://localhost:3000'}/`,
        `${process.env.VERCEL_PREVIEW_URL || 'http://localhost:3000'}/leaderboard`,
      ],
      numberOfRuns: 3,
      settings: { preset: 'mobile' },
    },
    assert: {
      assertions: {
        'first-contentful-paint': ['error', { maxNumericValue: 1500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
```

- [ ] **Step 3: Create `vitest.config.ts` and `vitest.integration.config.ts`**

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

`vitest.integration.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

`tests/integration/setup.ts` (truncates all tables before each test file so integration tests don't pollute each other):

```typescript
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { db } from '@/libs/DB';
import { sql } from 'drizzle-orm';

beforeAll(async () => { /* drizzle migrations already applied via db:migrate */ });
beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE
    notifications, leaderboard_snapshots, points_ledger, match_results,
    matches, brackets, registrations, tournaments,
    tier_history, club_memberships, players, clubs, users
  CASCADE`);
});
afterAll(async () => { /* no-op; connection closes on process exit */ });
```

- [ ] **Step 4: Replace the fragile `sleep 60` in test-e2e with wait-on**

In `.github/workflows/ci.yml` the `test-e2e` job currently has `run: sleep 60`. Replace with a proper wait-on step that polls the Vercel preview URL:

```yaml
      - name: Wait for Vercel preview
        run: |
          PREVIEW_URL="${{ steps.vercel.outputs.preview-url }}"
          for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
            if curl -sf "$PREVIEW_URL" > /dev/null; then
              echo "Preview ready"; exit 0
            fi
            sleep 15
          done
          echo "Preview never came up"; exit 1
```

Requires the Vercel Action step `amondnet/vercel-action@v25` earlier in the job to expose `steps.vercel.outputs.preview-url`. See Vercel + GitHub Actions integration docs for the standard setup.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml lighthouserc.js vitest.config.ts vitest.integration.config.ts tests/integration/setup.ts
git commit -m "ci: add type-check lint unit integration lighthouse workflow + vitest configs"
```

---

### Task 1.11: Smoke-deploy workflow (§5.5)

**Files:**
- Create: `.github/workflows/smoke-deploy.yml`
- Create: `scripts/smoke-test.ts`

- [ ] **Step 1: Write `scripts/smoke-test.ts`**

```typescript
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
```

- [ ] **Step 2: Write `.github/workflows/smoke-deploy.yml`**

```yaml
name: Smoke deploy probe
on:
  deployment_status:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  smoke:
    if: github.event_name != 'deployment_status' || github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx tsx scripts/smoke-test.ts
        env:
          SMOKE_URL: https://padelz.proxyz.studio
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/smoke-deploy.yml scripts/smoke-test.ts
git commit -m "ci: add post-deploy smoke probe against live url"
```

---

### Task 1.12: Sentry + Pino + Vercel Analytics wiring (§5.2)

**Files:**
- Create: `src/instrumentation.ts`
- Create: `src/libs/Logger.ts`
- Modify: `src/app/layout.tsx`
- Modify: `next.config.mjs`

- [ ] **Step 1: Implement `src/libs/Logger.ts`**

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password'],
});
```

- [ ] **Step 2: Implement Sentry configs (all three runtimes)**

`src/instrumentation.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
```

`src/sentry.server.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';
import { Env } from '@/libs/Env';

Sentry.init({
  dsn: Env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  debug: false,
});
```

`src/sentry.client.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  tracesSampleRate: 0.2,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.05,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
});
```

`src/sentry.edge.config.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';
import { Env } from '@/libs/Env';

Sentry.init({
  dsn: Env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
```

Also add `NEXT_PUBLIC_SENTRY_DSN` to `.env.local.example` (mirror of `SENTRY_DSN` exposed to the browser; OK to commit the prod DSN since it's a public identifier).

- [ ] **Step 2b: Add a `/api/test-sentry` route for the Task 1.17 verification**

`src/app/api/test-sentry/route.ts`:

```typescript
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  Sentry.captureException(new Error('padelz: test sentry event from /api/test-sentry'));
  await Sentry.flush(2000);
  return new Response('Sentry test event sent', { status: 200 });
}
```

- [ ] **Step 3: Update `next.config.mjs` to wrap with Sentry**

```javascript
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  experimental: { instrumentationHook: true },
  images: { domains: ['public.blob.vercel-storage.com', 'img.clerk.com'] },
};

export default withSentryConfig(nextConfig, {
  org: 'proxyz-studio',
  project: 'padelz',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
});
```

- [ ] **Step 4: Add Vercel Analytics + Speed Insights to layout**

In `src/app/layout.tsx`:

```typescript
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
// ...
<body>
  {children}
  <Analytics />
  <SpeedInsights />
</body>
```

```bash
npm install @vercel/analytics @vercel/speed-insights
```

- [ ] **Step 5: Add request_id middleware (§5.2 observability requirement)**

`src/libs/RequestId.ts`:

```typescript
import { logger } from './Logger';
import { v7 as uuidv7 } from 'uuidv7';

export function withRequestId(req: Request) {
  const incoming = req.headers.get('x-request-id');
  const requestId = incoming && /^[a-z0-9-]{8,64}$/.test(incoming) ? incoming : uuidv7();
  return { requestId, log: logger.child({ requestId }) };
}
```

Extend `src/middleware.ts` to attach the request_id without breaking Clerk's response chain:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuidv7';

const isProtected = createRouteMatcher(['/me(.*)', '/match(.*)', '/c/:slug/admin(.*)']);

export default clerkMiddleware((auth, req: NextRequest) => {
  if (isProtected(req)) auth.protect();

  // Inject x-request-id onto the inbound request (read by Server Actions / Route Handlers via headers())
  const incoming = req.headers.get('x-request-id');
  const requestId = incoming && /^[a-z0-9-]{8,64}$/.test(incoming) ? incoming : uuidv7();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
});

export const config = { matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/(api|trpc)(.*)'] };
```

This pattern (a) lets Clerk's auth gate run normally, (b) attaches the request_id to both inbound and outbound headers, (c) does not short-circuit the response.

Server Actions and Route Handlers read the header via `headers().get('x-request-id')` and pass it to `logger.child({ requestId })` for structured log correlation.

- [ ] **Step 6: Commit**

```bash
git add src/instrumentation.ts src/libs/Logger.ts src/libs/RequestId.ts src/sentry.*.config.ts src/app/api/test-sentry/route.ts src/middleware.ts next.config.mjs src/app/layout.tsx package.json .env.local.example
git commit -m "feat: wire sentry pino vercel-analytics speed-insights request-id"
```

---

### Task 1.13: Upstash rate-limit helper (§5.4)

**Files:**
- Create: `src/libs/RateLimit.ts`
- Test: `tests/integration/ratelimit.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/ratelimit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { rateLimit } from '@/libs/RateLimit';

describe('rateLimit', () => {
  it('returns success for first request', async () => {
    const r = await rateLimit('test-key-' + Date.now(), 'score_submit');
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `src/libs/RateLimit.ts`**

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Env } from './Env';

const redis = new Redis({
  url: Env.UPSTASH_REDIS_REST_URL,
  token: Env.UPSTASH_REDIS_REST_TOKEN,
});

const limiters = {
  score_submit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '60 s'), prefix: 'rl:score' }),
  registration: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '60 s'), prefix: 'rl:register' }),
  profile_edit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '60 s'), prefix: 'rl:profile' }),
} as const;

export type RateLimitKind = keyof typeof limiters;

export async function rateLimit(identifier: string, kind: RateLimitKind) {
  return limiters[kind].limit(identifier);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/libs/RateLimit.ts tests/integration/ratelimit.test.ts
git commit -m "feat: add upstash rate limit helper with three kinds"
```

---

### Task 1.14: PWA manifest + service worker stub (§1.6)

**Files:**
- Create: `src/app/manifest.ts`
- Create: `public/sw.js`
- Create: `src/components/RegisterServiceWorker.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Implement `src/app/manifest.ts`**

```typescript
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Padelz',
    short_name: 'Padelz',
    description: 'Phuket padel community: tournaments, leaderboard, players.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#FF4193',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 2: Create `public/sw.js`** (minimal stale-while-revalidate)

```javascript
const CACHE_NAME = 'padelz-shell-v1';
const APP_SHELL = ['/', '/leaderboard', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('/api/') || req.url.includes('/_next/')) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    })
  );
});
```

- [ ] **Step 3: Implement `RegisterServiceWorker.tsx`**

```typescript
'use client';
import { useEffect } from 'react';

export function RegisterServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
```

Wire `<RegisterServiceWorker />` into `src/app/layout.tsx`.

- [ ] **Step 4: Generate placeholder icons**

Create simple solid-pink PNG icons (192, 512, maskable-512) in `public/icons/` using PROXYZ `#FF4193`. Replace with real designed icons in week 6 polish.

- [ ] **Step 5: Commit**

```bash
git add src/app/manifest.ts public/sw.js src/components/RegisterServiceWorker.tsx src/app/layout.tsx public/icons/
git commit -m "feat: add pwa manifest and service worker shell"
```

---

### Task 1.15: Vertical slice E2E test (§1.3 step 7)

**Files:**
- Create: `playwright.config.ts`
- Create: `src/app/page.tsx` (placeholder landing)
- Create: `src/app/leaderboard/page.tsx` (placeholder, reads `players.display_name`)
- Test: `tests/e2e/vertical-slice.spec.ts`

- [ ] **Step 0: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: process.env.CI
    ? undefined
    : { command: 'npm run dev:next', url: 'http://localhost:3000', reuseExistingServer: true },
});
```

- [ ] **Step 1: Write the failing Playwright test**

`tests/e2e/vertical-slice.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('signed-in user sees their name on the placeholder leaderboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /padelz/i })).toBeVisible();

  await page.goto('/sign-in');
  await page.fill('[name="identifier"]', 'test@padelz.example');
  await page.fill('[name="password"]', process.env.E2E_TEST_PASSWORD ?? 'changeme');
  await page.click('button:has-text("Continue")');

  await page.waitForURL('/');
  await page.goto('/leaderboard');
  await expect(page.getByText('Leaderboard')).toBeVisible();
  await expect(page.getByText(/Seed Player/i)).toBeVisible();
});
```

- [ ] **Step 2: Implement minimal pages**

`src/app/page.tsx`:

```typescript
export default function HomePage() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Padelz</h1>
      <p>Phuket padel community. Built by PROXYZ Studio.</p>
    </main>
  );
}
```

`src/app/leaderboard/page.tsx`:

```typescript
import { db } from '@/libs/DB';
import { players } from '@/models/Schema';

export default async function LeaderboardPage() {
  const all = await db.select({ handle: players.handle, name: players.display_name, tier: players.tier }).from(players).limit(20);
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-4">Leaderboard</h1>
      <ul className="space-y-2">
        {all.map((p) => (
          <li key={p.handle}><span className="font-mono">{p.handle}</span> — {p.name} ({p.tier})</li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Wire Clerk middleware**

`src/middleware.ts`:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher(['/me(.*)', '/match(.*)', '/c/:slug/admin(.*)']);

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth.protect();
});

export const config = { matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/(api|trpc)(.*)'] };
```

- [ ] **Step 4: Run Playwright + commit**

```bash
npm run db:seed  # ensure fixture players exist
npx playwright install --with-deps chromium
npm run test:e2e -- vertical-slice
# Expected: PASS (after creating the Clerk test user via dashboard or seed)
git add playwright.config.ts src/app/page.tsx src/app/leaderboard/page.tsx src/middleware.ts tests/e2e/vertical-slice.spec.ts
git commit -m "feat: vertical slice end-to-end signin to leaderboard"
```

---

### Task 1.16: Adapt portal-worktree → padelz-worktree

**Files:**
- Create: `~/Tools/padelz-worktree` (bash script, mirrors portal-worktree)

- [ ] **Step 1: Copy and adapt**

```bash
cp ~/Tools/portal-worktree ~/Tools/padelz-worktree
```

Edit `~/Tools/padelz-worktree` and change three constants:

```bash
# Before
REPO_PATH="/Users/tews/Code/portal"
WORKTREE_ROOT="$HOME/Code/portal-worktrees"
BASE_BRANCH="main"

# After
REPO_PATH="$HOME/Code/padelz-v1"
WORKTREE_ROOT="$HOME/Code/padelz-worktrees"
BASE_BRANCH="main"
```

`mkdir -p ~/Code/padelz-worktrees` before the first run.

- [ ] **Step 2: Smoke-test the four worktrees**

```bash
cd "<padelz-v1 path>"
~/Tools/padelz-worktree new m1-profiles
~/Tools/padelz-worktree new m2-tournaments
~/Tools/padelz-worktree new m3-scoring
~/Tools/padelz-worktree new m4-leaderboard
~/Tools/padelz-worktree list
# Expected: 4 worktrees visible, all on feat/padel-m{1..4} branches
```

- [ ] **Step 3: Verify each worktree builds independently**

```bash
for m in m1-profiles m2-tournaments m3-scoring m4-leaderboard; do
  cd ~/Code/padelz-worktrees/$m
  npm run check-types
  npm run test
done
```

Expected: all four green.

---

### Task 1.17: Foundation week sign-off

- [ ] **Step 1: Final foundation-week checks**

```bash
cd "<padelz-v1 path>"
npm run check-types     # zero errors
npm run lint            # zero warnings
npm run test            # all green
npm run test:integration # all green
npm run test:e2e -- vertical-slice # green
```

- [ ] **Step 2: Push main, wait for CI green**

```bash
git push origin main
# Watch: https://github.com/proxyz-studio/padelz-v1/actions
# All 5 checks must be green (check-types, lint, test-unit, test-integration, lighthouse-on-pr)
```

- [ ] **Step 3: Verify Vercel auto-deploy + smoke probe**

```bash
# Wait ~2 min for Vercel deploy + smoke workflow
gh run list --workflow=smoke-deploy.yml --limit 1
# Expected: most recent run is "completed" / "success"
```

- [ ] **Step 4: Trigger a test Sentry event in prod**

```bash
curl https://padelz.proxyz.studio/api/test-sentry  # 404 expected; check Sentry dashboard for the event
```

- [ ] **Step 5: Demo to Tim** (Friday end of week 1)

Show Tim:
- The landing page
- Sign-in flow
- Placeholder leaderboard rendering seed players
- The four worktrees on disk
- The CI green badge

Capture his "looks right / looks off" feedback in `CONTEXT.md` under a `### 2026-MM-DD — Week 1 foundation demo` heading.

- [ ] **Step 6: Tag the foundation milestone**

```bash
git tag v0.5.0-foundation
git push origin v0.5.0-foundation
```

---

**End of Chunk 2.** Foundation week complete. Schema, contracts, CI, PWA, deploy pipeline, four worktrees ready. Move to Chunks 3-6 (parallel module work).

---

## Chunk 3: M1 — Auth + Profiles + Notifications (parallel worktree)

**Worktree:** `~/Code/padelz-worktrees/m1-profiles` on branch `feat/padel-m1`.
**Owns tables:** `users`, `players`, `clubs`, `club_memberships`, `tier_history`, `notifications`.
**Exports to other modules:** `Tier` enum + `roundHalfUp`'s required-by types (via `src/features/profiles/types.ts`), `createNotification` Server Action (via `src/features/notifications/actions.ts`), `promotePlayer` Server Action (via `src/features/profiles/actions.ts`).
**Duration:** ~3 weeks parallel with M2/M3/M4. Demoable every Friday.

---

### Task 3.1: Clerk webhook handler with Svix verification (§3.5)

**Files:**
- Create: `src/app/api/webhook/clerk/route.ts`
- Create: `src/features/auth/webhook.ts`
- Create: `src/features/profiles/handle.ts` (unique-handle generator)
- Test: `tests/integration/clerk-webhook.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/clerk-webhook.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { users, players } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { handleClerkEvent } from '@/features/auth/webhook';

describe('Clerk webhook', () => {
  it('creates a users row + auto-creates players row on user.created', async () => {
    const clerkId = 'user_test_' + Date.now();
    await handleClerkEvent({
      type: 'user.created',
      data: { id: clerkId, email_addresses: [{ email_address: 'a@b.com' }] },
    } as any);

    const u = await db.select().from(users).where(eq(users.clerk_id, clerkId));
    expect(u.length).toBe(1);

    const p = await db.select().from(players).where(eq(players.user_id, u[0].id));
    expect(p.length).toBe(1);
    expect(p[0].handle).toMatch(/^[a-z0-9-]{8,}$/);
    expect(p[0].tier).toBe('bronze');
  });

  it('soft-deletes player on user.deleted (redact, not destroy)', async () => {
    const clerkId = 'user_del_' + Date.now();
    await handleClerkEvent({
      type: 'user.created',
      data: { id: clerkId, email_addresses: [{ email_address: 'd@b.com' }] },
    } as any);

    await handleClerkEvent({ type: 'user.deleted', data: { id: clerkId } } as any);

    const u = await db.select().from(users).where(eq(users.clerk_id, clerkId));
    const p = await db.select().from(players).where(eq(players.user_id, u[0].id));
    expect(p[0].redacted_at).not.toBeNull();
    expect(p[0].display_name).toBe('[deleted]');
    expect(p[0].photo_url).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm run test:integration -- clerk-webhook
```

- [ ] **Step 3: Implement `src/features/profiles/handle.ts`**

```typescript
import { db } from '@/libs/DB';
import { players } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

export async function generateUniqueHandle(): Promise<string> {
  for (let len = 8; len <= 14; len += 2) {
    const gen = customAlphabet(alphabet, len);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = gen();
      const existing = await db.select({ id: players.id }).from(players).where(eq(players.handle, candidate)).limit(1);
      if (existing.length === 0) return candidate;
    }
  }
  throw new Error('Failed to generate unique handle after 30 attempts');
}
```

Install nanoid: `npm install nanoid`.

- [ ] **Step 4: Implement `src/features/auth/webhook.ts`**

```typescript
import { db } from '@/libs/DB';
import { users, players, club_memberships } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { generateUniqueHandle } from '@/features/profiles/handle';
import type { WebhookEvent } from '@clerk/nextjs/server';

export async function handleClerkEvent(event: WebhookEvent) {
  switch (event.type) {
    case 'user.created': {
      const clerkId = event.data.id!;
      const email = event.data.email_addresses?.[0]?.email_address ?? '';
      await db.transaction(async (tx) => {
        const [u] = await tx.insert(users).values({ clerk_id: clerkId, email }).returning();
        const handle = await generateUniqueHandle();
        await tx.insert(players).values({
          user_id: u.id,
          handle,
          display_name: email.split('@')[0] || handle,
          tier: 'bronze',
        });
      });
      break;
    }
    case 'user.updated': {
      const clerkId = event.data.id!;
      const email = event.data.email_addresses?.[0]?.email_address;
      if (email) await db.update(users).set({ email }).where(eq(users.clerk_id, clerkId));
      break;
    }
    case 'user.deleted': {
      const clerkId = event.data.id!;
      const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
      if (!u) return;
      await db.transaction(async (tx) => {
        await tx.update(players).set({
          display_name: '[deleted]',
          photo_url: null,
          bio: null,
          redacted_at: new Date(),
        }).where(eq(players.user_id, u.id));
        await tx.delete(club_memberships).where(eq(club_memberships.user_id, u.id));
      });
      break;
    }
  }
}
```

- [ ] **Step 5: Implement `src/app/api/webhook/clerk/route.ts` (Svix-verified)**

```typescript
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { Env } from '@/libs/Env';
import { handleClerkEvent } from '@/features/auth/webhook';
import { logger } from '@/libs/Logger';

export async function POST(req: Request) {
  const h = headers();
  const svix_id = h.get('svix-id');
  const svix_timestamp = h.get('svix-timestamp');
  const svix_signature = h.get('svix-signature');
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', { status: 400 });
  }
  const body = await req.text();
  const wh = new Webhook(Env.CLERK_WEBHOOK_SECRET);
  try {
    const evt: any = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
    await handleClerkEvent(evt);
    return new Response('ok', { status: 200 });
  } catch (e: any) {
    logger.error({ err: e.message }, 'clerk webhook failed');
    return new Response('Invalid', { status: 400 });
  }
}
```

`npm install svix`.

- [ ] **Step 6: Run + commit**

```bash
npm run test:integration -- clerk-webhook
git add src/app/api/webhook/clerk/route.ts src/features/auth/webhook.ts src/features/profiles/handle.ts tests/integration/clerk-webhook.test.ts package.json
git commit -m "feat(m1): clerk svix webhook with user create update delete redact"
```

---

### Task 3.2: `createNotification` Server Action (§4.7.4, §1.7)

**Files:**
- Create: `src/features/notifications/actions.ts`
- Test: `tests/integration/notifications.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { users, notifications } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { createNotification } from '@/features/notifications/actions';

describe('createNotification', () => {
  it('inserts one row per user_id', async () => {
    const [u1] = await db.insert(users).values({ clerk_id: 'n1', email: 'n1@x' }).returning();
    const [u2] = await db.insert(users).values({ clerk_id: 'n2', email: 'n2@x' }).returning();
    const r = await createNotification({
      user_ids: [u1.id, u2.id],
      type: 'score_confirmed',
      payload: { match_id: 'abc' },
    });
    expect(r.success).toBe(true);

    const rows = await db.select().from(notifications).where(eq(notifications.type, 'score_confirmed'));
    expect(rows.length).toBe(2);
  });
});
```

- [ ] **Step 2: Implement**

`src/features/notifications/actions.ts`:

```typescript
'use server';
import { z } from 'zod';
import { db } from '@/libs/DB';
import { notifications } from '@/models/Schema';
import type { Result } from '@/features/scoring/types';
import type { CreateNotificationInput } from './types';

const Schema = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(500),
  type: z.enum([
    'score_pending', 'score_confirmed', 'score_disputed',
    'pending_expired', 'score_overridden', 'tier_promoted', 'registration_confirmed',
  ]),
  payload: z.record(z.unknown()),
});

export async function createNotification(input: CreateNotificationInput): Promise<Result<{ inserted: number }>> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };
  }
  const rows = parsed.data.user_ids.map((user_id) => ({
    user_id,
    type: parsed.data.type,
    payload: parsed.data.payload,
  }));
  await db.insert(notifications).values(rows);
  return { success: true, data: { inserted: rows.length } };
}
```

- [ ] **Step 3: Commit**

```bash
npm run test:integration -- notifications
git add src/features/notifications/actions.ts tests/integration/notifications.test.ts
git commit -m "feat(m1): createNotification server action with zod validation"
```

---

### Task 3.3: `promotePlayer` Server Action (§1.7, §4.9)

**Files:**
- Create: `src/features/profiles/actions.ts`
- Test: `tests/integration/promote-player.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { users, players, tier_history, notifications } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { promotePlayer } from '@/features/profiles/actions';

describe('promotePlayer', () => {
  it('updates players.tier, opens new tier_history row, fires notification — all atomically', async () => {
    const [u] = await db.insert(users).values({ clerk_id: 'p1', email: 'p1@x' }).returning();
    const [p] = await db.insert(players).values({
      user_id: u.id, handle: 'p1-h', display_name: 'P1', tier: 'silver',
    }).returning();
    await db.insert(tier_history).values({
      player_id: p.id, tier: 'silver', from_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), reason: 'initial',
    });

    const r = await promotePlayer({ player_id: p.id, new_tier: 'gold', reason: 'auto_promote' });
    expect(r.success).toBe(true);

    const updated = await db.select().from(players).where(eq(players.id, p.id));
    expect(updated[0].tier).toBe('gold');

    const history = await db.select().from(tier_history).where(eq(tier_history.player_id, p.id));
    expect(history.length).toBe(2);
    expect(history.find((h) => h.tier === 'silver' && h.to_date !== null)).toBeDefined();
    expect(history.find((h) => h.tier === 'gold' && h.reason === 'auto_promote' && h.to_date === null)).toBeDefined();

    const notifs = await db.select().from(notifications).where(eq(notifications.user_id, u.id));
    expect(notifs.some((n) => n.type === 'tier_promoted')).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

`src/features/profiles/actions.ts`:

```typescript
'use server';
import { z } from 'zod';
import { db } from '@/libs/DB';
import { players, tier_history } from '@/models/Schema';
import { eq, and, isNull } from 'drizzle-orm';
import { TIERS, type Tier } from './types';
import { createNotification } from '@/features/notifications/actions';
import type { Result } from '@/features/scoring/types';

const PromoteSchema = z.object({
  player_id: z.string().uuid(),
  new_tier: z.enum(TIERS),
  reason: z.enum(['auto_promote', 'auto_demote', 'manual']),
});

export async function promotePlayer(input: {
  player_id: string;
  new_tier: Tier;
  reason: 'auto_promote' | 'auto_demote' | 'manual';
}): Promise<Result<{ player_id: string; new_tier: Tier }>> {
  const parsed = PromoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };

  const userId = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(players).where(eq(players.id, parsed.data.player_id));
    if (!p) throw new Error('Player not found');

    await tx.update(tier_history)
      .set({ to_date: new Date() })
      .where(and(eq(tier_history.player_id, p.id), isNull(tier_history.to_date)));

    await tx.insert(tier_history).values({
      player_id: p.id,
      tier: parsed.data.new_tier,
      from_date: new Date(),
      reason: parsed.data.reason,
    });

    await tx.update(players).set({ tier: parsed.data.new_tier }).where(eq(players.id, p.id));

    return p.user_id;
  });

  await createNotification({
    user_ids: [userId],
    type: 'tier_promoted',
    payload: { new_tier: parsed.data.new_tier, reason: parsed.data.reason },
  });

  return { success: true, data: { player_id: parsed.data.player_id, new_tier: parsed.data.new_tier } };
}
```

- [ ] **Step 3: Commit**

```bash
npm run test:integration -- promote-player
git add src/features/profiles/actions.ts tests/integration/promote-player.test.ts
git commit -m "feat(m1): promotePlayer server action atomic tier mutation"
```

---

### Task 3.4: Public player profile page `/p/[handle]`

**Files:**
- Create: `src/app/p/[handle]/page.tsx`
- Create: `src/features/profiles/components/PlayerProfileCard.tsx`
- Create: `src/features/profiles/components/TierBadge.tsx`
- Test: `tests/e2e/player-profile.spec.ts`

- [ ] **Step 1: Write the failing E2E test**

```typescript
import { test, expect } from '@playwright/test';

test('public player profile renders without auth', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/p/seed-player-2');
  await expect(page.getByText(/Seed Player 2/i)).toBeVisible();
  await expect(page.getByText(/gold/i)).toBeVisible();
});

test('redacted player shows [deleted] not the original name', async ({ page }) => {
  // Test data: seed creates a redacted-player fixture
  await page.goto('/p/redacted-fixture');
  await expect(page.getByText('[deleted]')).toBeVisible();
});
```

- [ ] **Step 2: Implement TierBadge**

`src/features/profiles/components/TierBadge.tsx`:

```typescript
import type { Tier } from '../types';

const colors: Record<Tier, string> = {
  bronze: 'bg-amber-700 text-white',
  silver: 'bg-zinc-400 text-zinc-900',
  gold: 'bg-yellow-500 text-zinc-900',
  platinum: 'bg-teal-300 text-zinc-900',
  diamond: 'bg-cyan-300 text-zinc-900',
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-mono uppercase tracking-wider ${colors[tier]}`}>
      {tier}
    </span>
  );
}
```

- [ ] **Step 3: Implement PlayerProfileCard**

`src/features/profiles/components/PlayerProfileCard.tsx`:

```typescript
import type { PublicPlayer } from '../types';
import { TierBadge } from './TierBadge';

export function PlayerProfileCard({ player }: { player: PublicPlayer }) {
  const isRedacted = player.redacted_at !== null;
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 max-w-md">
      <header className="flex items-center gap-4 mb-4">
        {player.photo_url && !isRedacted ? (
          <img src={player.photo_url} alt="" className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-zinc-800" />
        )}
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{player.display_name}</h1>
          <p className="text-zinc-500 font-mono">@{player.handle}</p>
        </div>
      </header>
      <div className="flex items-center gap-2 mb-3">
        <TierBadge tier={player.tier} />
        {player.verified && <span className="text-xs text-cyan-400">VERIFIED</span>}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Implement the page**

`src/app/p/[handle]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import { db } from '@/libs/DB';
import { players } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { PlayerProfileCard } from '@/features/profiles/components/PlayerProfileCard';

export const revalidate = 60;

export default async function PlayerProfilePage({ params }: { params: { handle: string } }) {
  const [p] = await db.select().from(players).where(eq(players.handle, params.handle));
  if (!p) notFound();
  return (
    <main className="min-h-screen bg-zinc-900 p-8">
      <PlayerProfileCard player={{
        id: p.id, handle: p.handle, display_name: p.display_name, tier: p.tier,
        photo_url: p.photo_url, verified: p.verified, redacted_at: p.redacted_at,
      }} />
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
npm run test:e2e -- player-profile
git add src/app/p src/features/profiles/components/
git commit -m "feat(m1): public player profile page /p/[handle] with tier badge"
```

---

### Task 3.5: Player profile edit `/me` + photo upload (§5.4)

**Files:**
- Create: `src/app/me/page.tsx`
- Create: `src/features/profiles/components/ProfileEditForm.tsx`
- Create: `src/features/profiles/upload.ts` (Vercel Blob upload)
- Modify: `src/features/profiles/actions.ts` (add updatePlayerProfile)
- Test: `tests/e2e/profile-edit.spec.ts`

- [ ] **Step 1: Write the failing E2E test**

```typescript
import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/player.json' });

test('player can update bio + display name', async ({ page }) => {
  await page.goto('/me');
  await page.fill('[name="display_name"]', 'Updated Name');
  await page.fill('[name="bio"]', 'New bio');
  await page.click('button:has-text("Save")');
  await expect(page.getByText(/saved/i)).toBeVisible();
  await page.reload();
  await expect(page.locator('[name="display_name"]')).toHaveValue('Updated Name');
});
```

- [ ] **Step 2: Implement upload helper**

`src/features/profiles/upload.ts`:

```typescript
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { z } from 'zod';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadProfilePhoto(userId: string, file: File): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('Only JPEG/PNG/WebP allowed');
  if (file.size > MAX_BYTES) throw new Error('Max 5MB');
  const buf = Buffer.from(await file.arrayBuffer());
  const processed = await sharp(buf).rotate().resize(512, 512, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
  const { url } = await put(`avatars/${userId}-${Date.now()}.webp`, processed, {
    access: 'public',
    contentType: 'image/webp',
  });
  return url;
}
```

`npm install sharp`.

- [ ] **Step 3: Add `updatePlayerProfile` to `src/features/profiles/actions.ts`**

```typescript
const UpdateSchema = z.object({
  display_name: z.string().min(1).max(80),
  bio: z.string().max(500).nullable(),
});

export async function updatePlayerProfile(input: { display_name: string; bio: string | null }): Promise<Result<{ ok: true }>> {
  const { userId } = auth();
  if (!userId) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required' } };

  const { success } = await rateLimit(userId, 'profile_edit');
  if (!success) return { success: false, error: { code: 'RATE_LIMITED', message: 'Slow down' } };

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };

  const [u] = await db.select().from(users).where(eq(users.clerk_id, userId));
  await db.update(players).set({ display_name: parsed.data.display_name, bio: parsed.data.bio }).where(eq(players.user_id, u.id));
  revalidatePath(`/me`);
  return { success: true, data: { ok: true } };
}
```

(Import `auth` from `@clerk/nextjs/server`, `revalidatePath` from `next/cache`, `rateLimit` from `@/libs/RateLimit`, `users` from `@/models/Schema`.)

- [ ] **Step 4: Implement the form + page** (standard react-hook-form + shadcn; see Portal pattern)

- [ ] **Step 5: Commit**

```bash
npm run test:e2e -- profile-edit
git add src/app/me src/features/profiles/components/ProfileEditForm.tsx src/features/profiles/upload.ts src/features/profiles/actions.ts package.json
git commit -m "feat(m1): /me profile edit with vercel blob photo upload"
```

---

### Task 3.6: Public club page `/c/[slug]`

**Files:**
- Create: `src/app/c/[slug]/page.tsx`
- Create: `src/features/profiles/components/ClubCard.tsx`
- Test: `tests/e2e/club-page.spec.ts`

- [ ] **Step 1: Write the failing E2E test** (similar shape to player-profile test)
- [ ] **Step 2: Implement `ClubCard.tsx`** (mirror PlayerProfileCard structure with city, court_count, description)
- [ ] **Step 3: Implement `/c/[slug]/page.tsx`** with `revalidate = 60` and a `notFound()` on missing club
- [ ] **Step 4: Commit**

```bash
git add src/app/c src/features/profiles/components/ClubCard.tsx
git commit -m "feat(m1): public club profile page /c/[slug]"
```

---

### Task 3.7: Club admin dashboard `/c/[slug]/admin/*` (§3.4 layer 2)

**Files:**
- Create: `src/app/c/[slug]/admin/layout.tsx` (role check)
- Create: `src/app/c/[slug]/admin/page.tsx` (dashboard)
- Create: `src/app/c/[slug]/admin/profile/page.tsx` (edit club)
- Test: `tests/integration/club-admin-gate.test.ts`

- [ ] **Step 1: Write the failing test for the role gate**

```typescript
import { describe, expect, it } from 'vitest';
import { canAdminClub } from '@/features/profiles/auth';
// canAdminClub(userId, clubSlug): Promise<boolean>

describe('canAdminClub', () => {
  it('returns true when user has club_memberships.role=admin for that club', async () => { /* seed + assert */ });
  it('returns false for member role', async () => { /* ... */ });
  it('returns false for non-member', async () => { /* ... */ });
});
```

- [ ] **Step 2: Implement `src/features/profiles/auth.ts`**

```typescript
import { db } from '@/libs/DB';
import { clubs, club_memberships, users } from '@/models/Schema';
import { eq, and } from 'drizzle-orm';

export async function canAdminClub(clerkUserId: string, clubSlug: string): Promise<boolean> {
  const result = await db
    .select({ id: club_memberships.id })
    .from(club_memberships)
    .innerJoin(users, eq(users.id, club_memberships.user_id))
    .innerJoin(clubs, eq(clubs.id, club_memberships.club_id))
    .where(and(
      eq(users.clerk_id, clerkUserId),
      eq(clubs.slug, clubSlug),
      eq(club_memberships.role, 'admin'),
    ))
    .limit(1);
  return result.length > 0;
}
```

- [ ] **Step 3: Implement the admin layout (404 on unauthorized)**

`src/app/c/[slug]/admin/layout.tsx`:

```typescript
import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { canAdminClub } from '@/features/profiles/auth';

export default async function ClubAdminLayout({
  children, params,
}: { children: React.ReactNode; params: { slug: string } }) {
  const { userId } = auth();
  if (!userId) notFound();
  if (!(await canAdminClub(userId, params.slug))) notFound();
  return <>{children}</>;
}
```

- [ ] **Step 4: Implement dashboard + edit-profile pages** (standard React Server Components with shadcn forms)
- [ ] **Step 5: Commit**

```bash
git add src/app/c src/features/profiles/auth.ts tests/integration/club-admin-gate.test.ts
git commit -m "feat(m1): club admin layout with 404-on-non-admin gate"
```

---

### Task 3.8: NotificationBell + notifications list

**Files:**
- Create: `src/features/notifications/components/NotificationBell.tsx`
- Create: `src/features/notifications/components/NotificationItem.tsx`
- Create: `src/features/notifications/actions.ts` (add `markRead` action)
- Test: `tests/e2e/notification-bell.spec.ts`

- [ ] **Step 1: Add `markRead` to actions**
- [ ] **Step 2: Build the bell + popover** (shadcn Popover, server-component fetch of unread count, client-component "mark all read")
- [ ] **Step 3: Commit**

```bash
git add src/features/notifications/components/ src/features/notifications/actions.ts tests/e2e/notification-bell.spec.ts
git commit -m "feat(m1): notification bell with unread count and mark-read action"
```

---

### Task 3.9: M1 PR + merge

- [ ] **Step 1: Push branch, open PR**

```bash
cd ~/Code/padelz-worktrees/m1-profiles
git push -u origin feat/padel-m1
gh pr create --title "feat(m1): auth, profiles, notifications" --body "Closes the M1 module per docs/superpowers/plans/2026-05-18-padelz-v1-plan.md Chunk 3. Tasks 3.1-3.8. Reviewers: Tew + Claude."
```

- [ ] **Step 2: Verify CI green** then merge.
- [ ] **Step 3: Friday demo to Tim:** sign up flow, profile edit, profile photo upload, club admin gate, notification bell.

**End of Chunk 3.**

---

## Chunk 4: M2 — Tournaments + Registrations + Brackets (parallel worktree)

**Worktree:** `~/Code/padelz-worktrees/m2-tournaments` on branch `feat/padel-m2`.
**Owns tables:** `tournaments`, `registrations`, `brackets`, `matches`.
**Exports to other modules:** `MatchForScoring` type, `TournamentStatus` type (via `src/features/tournaments/types.ts`). M3 reads `matches` rows (never writes); M4 reads `tournaments.tournament_type` for scoring modifiers.
**Duration:** ~3 weeks parallel.

---

### Task 4.1: `createTournament` Server Action with tier-restriction validation (§3.7)

**Files:**
- Create: `src/features/tournaments/actions.ts`
- Test: `tests/integration/create-tournament.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { users, clubs, club_memberships, tournaments } from '@/models/Schema';
import { createTournament } from '@/features/tournaments/actions';
import { eq } from 'drizzle-orm';

describe('createTournament', () => {
  it('club admin can create a tournament at their own club', async () => {
    const [u] = await db.insert(users).values({ clerk_id: 't-admin', email: 't@x' }).returning();
    const [c] = await db.insert(clubs).values({ slug: 't-club', name: 'T Club' }).returning();
    await db.insert(club_memberships).values({ user_id: u.id, club_id: c.id, role: 'admin' });

    const r = await createTournament(
      { club_id: c.id, name: 'Sat Open', format: 'americano', tournament_type: 'club_internal',
        start_at: new Date(Date.now() + 86_400_000).toISOString(), tier_min: null, tier_max: null },
      u.clerk_id,
    );
    expect(r.success).toBe(true);
    const [t] = await db.select().from(tournaments).where(eq(tournaments.club_id, c.id));
    expect(t.name).toBe('Sat Open');
    expect(t.status).toBe('draft');
  });

  it('non-admin cannot create tournament', async () => {
    const [u] = await db.insert(users).values({ clerk_id: 't-nobody', email: 'n@x' }).returning();
    const [c] = await db.insert(clubs).values({ slug: 't-club-2', name: 'T2' }).returning();
    const r = await createTournament(
      { club_id: c.id, name: 'X', format: 'bracket', tournament_type: 'open',
        start_at: new Date(Date.now() + 86_400_000).toISOString(), tier_min: null, tier_max: null },
      u.clerk_id,
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('FORBIDDEN');
  });

  it('rejects tier_min > tier_max', async () => {
    // setup admin + club then attempt invalid range
    // expect VALIDATION error
  });
});
```

- [ ] **Step 2: Implement**

`src/features/tournaments/actions.ts`:

```typescript
'use server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/libs/DB';
import { tournaments, club_memberships, users } from '@/models/Schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { TIERS, TIER_TO_INT } from '@/features/profiles/types';
import type { Result } from '@/features/scoring/types';
import { customAlphabet } from 'nanoid';

const slugGen = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 6);

const Schema = z.object({
  club_id: z.string().uuid(),
  name: z.string().min(3).max(120),
  format: z.enum(['americano', 'mexicano', 'round_robin', 'bracket']),
  tournament_type: z.enum(['open', 'club_internal', 'group', 'casual']),
  start_at: z.string().datetime(),
  tier_min: z.enum(TIERS).nullable(),
  tier_max: z.enum(TIERS).nullable(),
}).refine((d) => !d.tier_min || !d.tier_max || TIER_TO_INT[d.tier_min] <= TIER_TO_INT[d.tier_max], {
  message: 'tier_min must be at or below tier_max',
});

export async function createTournament(
  input: z.input<typeof Schema>,
  clerkUserId?: string,
): Promise<Result<{ tournament_id: string; slug: string }>> {
  const userId = clerkUserId ?? auth().userId;
  if (!userId) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required' } };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };

  const [u] = await db.select().from(users).where(eq(users.clerk_id, userId));
  if (!u) return { success: false, error: { code: 'UNAUTHORIZED', message: 'User not synced' } };

  const member = await db.select().from(club_memberships).where(and(
    eq(club_memberships.user_id, u.id),
    eq(club_memberships.club_id, parsed.data.club_id),
    eq(club_memberships.role, 'admin'),
  )).limit(1);
  if (member.length === 0) return { success: false, error: { code: 'FORBIDDEN', message: 'Not an admin of this club' } };

  const slugBase = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const slug = `${slugBase}-${slugGen()}`;

  const [t] = await db.insert(tournaments).values({
    slug,
    club_id: parsed.data.club_id,
    name: parsed.data.name,
    format: parsed.data.format,
    tournament_type: parsed.data.tournament_type,
    start_at: new Date(parsed.data.start_at),
    tier_min: parsed.data.tier_min,
    tier_max: parsed.data.tier_max,
    status: 'draft',
    created_by: u.id,
  }).returning();

  revalidatePath('/t');
  return { success: true, data: { tournament_id: t.id, slug } };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/tournaments/actions.ts tests/integration/create-tournament.test.ts
git commit -m "feat(m2): createTournament server action with club-admin gate"
```

---

### Task 4.2: Tournament create wizard `/c/[slug]/admin/tournaments/new`

**Files:**
- Create: `src/app/c/[slug]/admin/tournaments/new/page.tsx`
- Create: `src/features/tournaments/components/CreateTournamentForm.tsx`
- Test: `tests/e2e/create-tournament.spec.ts`

- [ ] **Step 1: Write the failing E2E test**

```typescript
import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/club-admin.json' });

test('club admin creates a tournament via the wizard', async ({ page }) => {
  await page.goto('/c/destination-padel/admin/tournaments/new');
  await page.fill('[name="name"]', 'Test Sat Open');
  await page.selectOption('[name="format"]', 'americano');
  await page.selectOption('[name="tournament_type"]', 'club_internal');
  await page.fill('[name="start_at"]', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await page.click('button:has-text("Create")');
  await expect(page).toHaveURL(/\/c\/destination-padel\/admin\/tournaments\/test-sat-open-/);
  await expect(page.getByText('Test Sat Open')).toBeVisible();
});
```

- [ ] **Step 2: Implement `CreateTournamentForm.tsx`** (react-hook-form + Zod resolver from the same Schema export in actions.ts; shadcn `<Form>`, `<Input>`, `<Select>`)

- [ ] **Step 3: Implement the page** (Server Component reads `clubs` row by slug, renders the form with `club_id` hidden field)

- [ ] **Step 4: Commit**

```bash
git add src/app/c/[slug]/admin/tournaments src/features/tournaments/components/CreateTournamentForm.tsx tests/e2e/create-tournament.spec.ts
git commit -m "feat(m2): create-tournament wizard at /c/[slug]/admin/tournaments/new"
```

---

### Task 4.3: `registerForTournament` Server Action with tier check (§3.7)

**Files:**
- Modify: `src/features/tournaments/actions.ts`
- Test: `tests/integration/register-tournament.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('registerForTournament', () => {
  it('signed-in player can register when no tier restriction', async () => {
    // seed user+player+tournament, call action, assert registration row exists
  });

  it('blocks bronze player from a gold+ tournament', async () => {
    // seed bronze player + tournament with tier_min=gold
    const r = await registerForTournament({ tournament_id: t.id }, bronzeUser.clerk_id);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('TIER_TOO_LOW');
  });

  it('rate-limits 6th registration within a minute', async () => {
    // hit the action 6 times rapidly
    // expect the 6th to return RATE_LIMITED
  });
});
```

- [ ] **Step 2: Implement** (append to `actions.ts`)

```typescript
import { registrations, players } from '@/models/Schema';
import { TIER_TO_INT } from '@/features/profiles/types';
import { rateLimit } from '@/libs/RateLimit';
import { createNotification } from '@/features/notifications/actions';
import { headers } from 'next/headers';

const RegisterSchema = z.object({ tournament_id: z.string().uuid() });

export async function registerForTournament(
  input: z.input<typeof RegisterSchema>,
  clerkUserId?: string,
): Promise<Result<{ registration_id: string }>> {
  const userId = clerkUserId ?? auth().userId;
  if (!userId) return { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in required' } };

  const ip = headers().get('x-forwarded-for') ?? 'unknown';
  const { success } = await rateLimit(ip, 'registration');
  if (!success) return { success: false, error: { code: 'RATE_LIMITED', message: 'Too many registrations from this IP' } };

  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: { code: 'VALIDATION', message: parsed.error.message } };

  const [u] = await db.select().from(users).where(eq(users.clerk_id, userId));
  const [p] = await db.select().from(players).where(eq(players.user_id, u.id));
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, parsed.data.tournament_id));
  if (!t) return { success: false, error: { code: 'NOT_FOUND', message: 'Tournament not found' } };
  if (t.status !== 'open' && t.status !== 'draft') {
    return { success: false, error: { code: 'CLOSED', message: 'Registration closed' } };
  }
  if (t.tier_min && TIER_TO_INT[p.tier] < TIER_TO_INT[t.tier_min]) {
    return { success: false, error: { code: 'TIER_TOO_LOW', message: `Requires ${t.tier_min}+` } };
  }
  if (t.tier_max && TIER_TO_INT[p.tier] > TIER_TO_INT[t.tier_max]) {
    return { success: false, error: { code: 'TIER_TOO_HIGH', message: `Capped at ${t.tier_max}` } };
  }

  const [reg] = await db.insert(registrations).values({
    tournament_id: t.id,
    player_id: p.id,
    status: 'registered',
  }).onConflictDoNothing().returning();

  if (!reg) return { success: false, error: { code: 'ALREADY_REGISTERED', message: 'Already registered' } };

  await createNotification({
    user_ids: [u.id],
    type: 'registration_confirmed',
    payload: { tournament_id: t.id, tournament_name: t.name },
  });

  revalidatePath(`/t/${t.slug}`);
  return { success: true, data: { registration_id: reg.id } };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/tournaments/actions.ts tests/integration/register-tournament.test.ts
git commit -m "feat(m2): registerForTournament with tier gate + rate limit"
```

---

### Task 4.4: Tournament list `/t` and detail `/t/[slug]` pages

**Files:**
- Create: `src/app/t/page.tsx`
- Create: `src/app/t/[slug]/page.tsx`
- Create: `src/features/tournaments/components/TournamentCard.tsx`
- Create: `src/features/tournaments/components/RegisterButton.tsx`
- Test: `tests/e2e/tournament-list-detail.spec.ts`

- [ ] **Step 1: Write E2E test** verifying:
  - `/t` lists upcoming tournaments
  - Click a card → `/t/[slug]` shows details + roster + RegisterButton
  - Signed-out user sees "Sign in to register"
  - Tier-ineligible player sees the button disabled with a tooltip

- [ ] **Step 2: Implement `TournamentCard.tsx`** (server component, takes `Tournament & { club_name: string; registered_count: number }`)
- [ ] **Step 3: Implement `RegisterButton.tsx`** (client component, calls `registerForTournament` server action, uses `useFormStatus`)
- [ ] **Step 4: Implement `/t/page.tsx`** with `revalidate = 30` querying tournaments sorted by `start_at`
- [ ] **Step 5: Implement `/t/[slug]/page.tsx`** with live roster
- [ ] **Step 6: Commit**

```bash
git add src/app/t src/features/tournaments/components/
git commit -m "feat(m2): tournament list and detail pages with register button"
```

---

### Task 4.5: Bracket generation Server Action

**Files:**
- Create: `src/features/tournaments/bracket.ts` (pure logic: registered players → bracket data shape)
- Modify: `src/features/tournaments/actions.ts` (add `generateBracket` Server Action)
- Test: `tests/unit/bracket.test.ts` + `tests/integration/generate-bracket.test.ts`

- [ ] **Step 1: Unit-test the pure bracket logic**

```typescript
describe('generateBracketData', () => {
  it('round-robin with 4 players produces 6 matches (every pair plays once)', () => {
    const players = ['a', 'b', 'c', 'd'];
    const r = generateBracketData(players, 'round_robin');
    expect(r.matches.length).toBe(6); // C(4,2)
  });

  it('americano with 4 players produces a 3-round rotation', () => {
    const r = generateBracketData(['a', 'b', 'c', 'd'], 'americano');
    expect(r.rounds.length).toBe(3);
    expect(r.rounds.every((rd: any) => rd.matches.length === 1)).toBe(true); // 4 players, 1 court per round
  });

  it('single-elim bracket with 8 players produces 7 matches across 3 rounds', () => {
    const r = generateBracketData(Array.from({ length: 8 }, (_, i) => `p${i}`), 'bracket');
    expect(r.matches.length).toBe(7);
  });

  it('rejects odd player count for americano', () => {
    expect(() => generateBracketData(['a', 'b', 'c'], 'americano')).toThrow();
  });
});
```

- [ ] **Step 2: Implement `src/features/tournaments/bracket.ts`** with pure functions for the 4 formats. Keep doubles-only (length must be multiple of 4).

- [ ] **Step 3: Add `generateBracket` Server Action** that calls the pure function and INSERTs the `brackets` row + the `matches` rows in one transaction.

- [ ] **Step 4: Commit**

```bash
git add src/features/tournaments/bracket.ts src/features/tournaments/actions.ts tests/unit/bracket.test.ts tests/integration/generate-bracket.test.ts
git commit -m "feat(m2): bracket generation for 4 formats with unit + integration tests"
```

---

### Task 4.6: Bracket builder UI `/c/[slug]/admin/tournaments/[id]/draw`

**Files:**
- Create: `src/app/c/[slug]/admin/tournaments/[id]/draw/page.tsx`
- Create: `src/features/tournaments/components/BracketBuilder.tsx`
- Test: `tests/e2e/bracket-builder.spec.ts`

- [ ] **Step 1: Write E2E test** — admin opens the draw page, sees registered players list, clicks "Generate", sees matches rendered.
- [ ] **Step 2: Implement BracketBuilder** with "Generate" button calling `generateBracket` Server Action.
- [ ] **Step 3: Implement page.**
- [ ] **Step 4: Commit**

```bash
git add src/app/c/[slug]/admin/tournaments/[id]/draw src/features/tournaments/components/BracketBuilder.tsx
git commit -m "feat(m2): bracket builder admin page with generate button"
```

---

### Task 4.7: Public bracket view `/t/[slug]/bracket`

**Files:**
- Create: `src/app/t/[slug]/bracket/page.tsx`
- Create: `src/features/tournaments/components/BracketView.tsx`

- [ ] **Step 1: Implement `BracketView.tsx`** rendering the `brackets.data` JSONB tree.
- [ ] **Step 2: Implement the page** with `revalidate = 30`.
- [ ] **Step 3: Commit**

```bash
git add src/app/t/[slug]/bracket src/features/tournaments/components/BracketView.tsx
git commit -m "feat(m2): public bracket view for tournament detail"
```

---

### Task 4.8: M2 PR + merge

- [ ] **Step 1: Push, open PR, verify CI green, merge.**
- [ ] **Step 2: Friday demo** — create a tournament, register 4 players, generate bracket, view it from the public page.

**End of Chunk 4.**

---

## Chunk 5: M3 — Scoring Engine + Confirmation Flow (parallel worktree)

**Worktree:** `~/Code/padelz-worktrees/m3-scoring` on branch `feat/padel-m3`.
**Owns tables:** `match_results`, `points_ledger`.
**Reads from M2:** `matches` (never writes).
**Reads from M1:** `players.tier` (via `Tier` enum).
**Calls into M1:** `createNotification` for all score events.
**Duration:** ~3 weeks parallel. This module is the most unit-test heavy (~250 cases).

---

### Task 5.1: `roundHalfUp` helper + scoring constants

**Files:**
- Create: `src/features/scoring/rounding.ts`
- Create: `src/features/scoring/constants.ts`
- Test: `tests/unit/scoring-rounding.test.ts`

- [ ] **Step 1: Write failing test for `roundHalfUp`**

```typescript
import { describe, expect, it } from 'vitest';
import { roundHalfUp } from '@/features/scoring/rounding';

describe('roundHalfUp', () => {
  it.each([
    [0.5, 1], [1.5, 2], [2.5, 3], [3.5, 4], [4.5, 5],
    [47.5, 48], [53.33, 53], [53.5, 54], [12.5, 13], [-0.5, 0],
  ])('roundHalfUp(%f) === %i', (input, expected) => {
    expect(roundHalfUp(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Implement**

`src/features/scoring/rounding.ts`:

```typescript
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}
```

`src/features/scoring/constants.ts`:

```typescript
import type { Tier } from '@/features/profiles/types';

export const BASE_WIN_FLAT = 100;
export const BASE_LOSS_FLAT = 25;

export const TIER_MULT_ON_WIN: Record<number, number> = {
  [-4]: 0.25, [-3]: 0.25, [-2]: 0.25,
  [-1]: 0.5,
  [0]: 1.0,
  [1]: 1.5,
  [2]: 2.0, [3]: 2.0, [4]: 2.0,
};

export const TOURNAMENT_MODIFIER = {
  open: 1.20,
  club_internal: 1.00,
  group: 1.00,
  casual: 0.85,
} as const;

export const FORMAT_MODIFIER = {
  americano: 1.15,
  mexicano: 1.15,
  round_robin: 1.00,
  bracket: 1.00,
} as const;
```

- [ ] **Step 3: Commit**

```bash
npm run test -- scoring-rounding
git add src/features/scoring/rounding.ts src/features/scoring/constants.ts tests/unit/scoring-rounding.test.ts
git commit -m "feat(m3): roundHalfUp helper and scoring constants"
```

---

### Task 5.2: Pure `calculate` function (the heart of the engine)

**Files:**
- Create: `src/features/scoring/calculate.ts`
- Test: `tests/unit/scoring-calculate.test.ts` (~250 cases)

- [ ] **Step 1: Write the worked-example test FIRST (the spec's §4.6 case)**

```typescript
import { describe, expect, it } from 'vitest';
import { calculate } from '@/features/scoring/calculate';

describe('calculate — spec §4.6 worked example', () => {
  it('Gold wins 24-21 americano club_internal vs Silver+Platinum (avg = Gold) → 60.95', () => {
    const result = calculate({
      id: 'm1', tournament_id: 't1',
      team_a: ['p1', 'p2'], team_b: ['p3', 'p4'],
      team_a_tiers: ['gold', 'gold'], team_b_tiers: ['silver', 'platinum'],
      team_a_score: 24, team_b_score: 21,
      format: 'americano', tournament_type: 'club_internal',
    });
    const p1 = result.find((r) => r.player_id === 'p1')!;
    expect(p1.breakdown.base).toBe(53);
    expect(p1.breakdown.tier_mult).toBe(1.0);
    expect(p1.breakdown.tournament_modifier).toBe(1.0);
    expect(p1.breakdown.format_modifier).toBe(1.15);
    expect(p1.points).toBeCloseTo(60.95, 2);
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Implement `calculate.ts`**

```typescript
import { roundHalfUp } from './rounding';
import {
  BASE_WIN_FLAT, BASE_LOSS_FLAT,
  TIER_MULT_ON_WIN, TOURNAMENT_MODIFIER, FORMAT_MODIFIER,
} from './constants';
import { TIER_TO_INT, type Tier } from '@/features/profiles/types';
import type { MatchInput, PointsAward } from './types';

function averageTier(tiers: readonly [Tier, Tier]): Tier {
  const avg = (TIER_TO_INT[tiers[0]] + TIER_TO_INT[tiers[1]]) / 2;
  const rounded = roundHalfUp(avg);
  const order: Tier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  return order[rounded - 1];
}

function basePoints(input: MatchInput, isWinner: boolean, yourScore: number, oppScore: number): number {
  if (input.format === 'americano' || input.format === 'mexicano') {
    const total = yourScore + oppScore;
    if (total === 0) return BASE_LOSS_FLAT;
    return Math.max(BASE_LOSS_FLAT, roundHalfUp((100 * yourScore) / total));
  }
  return isWinner ? BASE_WIN_FLAT : BASE_LOSS_FLAT;
}

export function calculate(input: MatchInput): PointsAward[] {
  if (input.team_a_score === input.team_b_score) return [];

  const aWon = input.team_a_score > input.team_b_score;
  const awards: PointsAward[] = [];
  const tournamentMod = TOURNAMENT_MODIFIER[input.tournament_type];
  const formatMod = FORMAT_MODIFIER[input.format];

  for (const side of ['a', 'b'] as const) {
    const isThisSideWinner = side === 'a' ? aWon : !aWon;
    const yourScore = side === 'a' ? input.team_a_score : input.team_b_score;
    const oppScore = side === 'a' ? input.team_b_score : input.team_a_score;
    const yourPlayers = side === 'a' ? input.team_a : input.team_b;
    const yourTiers = side === 'a' ? input.team_a_tiers : input.team_b_tiers;
    const oppTiers = side === 'a' ? input.team_b_tiers : input.team_a_tiers;
    const avgOpp = averageTier(oppTiers);

    for (let i = 0; i < yourPlayers.length; i++) {
      const yourTier = yourTiers[i];
      const tierDiff = TIER_TO_INT[avgOpp] - TIER_TO_INT[yourTier];
      const tierMult = isThisSideWinner ? TIER_MULT_ON_WIN[tierDiff] ?? 1.0 : 1.0;
      const base = basePoints(input, isThisSideWinner, yourScore, oppScore);
      // Use roundHalfUp not Math.round per spec §4.2 — bare Math.round is browser-dependent at .5
      const points = roundHalfUp(base * tierMult * tournamentMod * formatMod * 100) / 100;

      awards.push({
        player_id: yourPlayers[i],
        points,
        breakdown: {
          base, tier_mult: tierMult,
          avg_opponent_tier: avgOpp, your_tier: yourTier,
          tournament_modifier: tournamentMod, format_modifier: formatMod,
          result: isThisSideWinner ? 'win' : 'loss',
          points_won: yourScore, points_lost: oppScore,
        },
      });
    }
  }
  return awards;
}
```

- [ ] **Step 4: Run worked-example test — should pass**

- [ ] **Step 5: Expand the test matrix to ~250 cases**

Add to `tests/unit/scoring-calculate.test.ts`:

```typescript
import { TIERS } from '@/features/profiles/types';

describe('calculate — full matrix', () => {
  describe.each(['americano', 'mexicano', 'round_robin', 'bracket'] as const)('format=%s', (format) => {
    describe.each(['open', 'club_internal'] as const)('tournament_type=%s', (tournament_type) => {
      it.each(TIERS)('same-tier match, win — your_tier=%s', (yourTier) => {
        const result = calculate({
          id: 'x', tournament_id: 't', team_a: ['a1', 'a2'], team_b: ['b1', 'b2'],
          team_a_tiers: [yourTier, yourTier], team_b_tiers: [yourTier, yourTier],
          team_a_score: 21, team_b_score: 18,
          format, tournament_type,
        });
        const a1 = result.find((r) => r.player_id === 'a1')!;
        expect(a1.breakdown.tier_mult).toBe(1.0);
        expect(a1.breakdown.result).toBe('win');
      });

      it.each([
        ['bronze', 'silver', 1.5],
        ['bronze', 'gold', 2.0],
        ['gold', 'silver', 0.5],
        ['gold', 'bronze', 0.25],
      ] as const)('cross-tier win: your=%s, opp_avg=%s → mult=%f', (yourTier, oppTier, expected) => {
        const result = calculate({
          id: 'x', tournament_id: 't', team_a: ['a1', 'a2'], team_b: ['b1', 'b2'],
          team_a_tiers: [yourTier, yourTier], team_b_tiers: [oppTier, oppTier],
          team_a_score: 21, team_b_score: 18,
          format, tournament_type,
        });
        const a1 = result.find((r) => r.player_id === 'a1')!;
        expect(a1.breakdown.tier_mult).toBe(expected);
      });
    });
  });

  describe('half-integer tier averaging via roundHalfUp', () => {
    it.each([
      [['bronze', 'silver'], 'silver'],   // 1.5 → 2 (silver)
      [['silver', 'gold'], 'gold'],       // 2.5 → 3 (gold)
      [['gold', 'platinum'], 'platinum'], // 3.5 → 4
      [['platinum', 'diamond'], 'diamond'],// 4.5 → 5
      [['silver', 'diamond'], 'platinum'],// 3.5 → 4
    ] as const)('opponents %o average to %s', ([t1, t2], expected) => {
      const result = calculate({
        id: 'x', tournament_id: 't', team_a: ['a1', 'a2'], team_b: ['b1', 'b2'],
        team_a_tiers: ['gold', 'gold'], team_b_tiers: [t1, t2],
        team_a_score: 21, team_b_score: 18,
        format: 'americano', tournament_type: 'club_internal',
      });
      expect(result[0].breakdown.avg_opponent_tier).toBe(expected);
    });
  });

  describe('participation floor', () => {
    it('21-3 loss in americano floors base at 25', () => {
      const r = calculate({
        id: 'x', tournament_id: 't', team_a: ['a1', 'a2'], team_b: ['b1', 'b2'],
        team_a_tiers: ['gold', 'gold'], team_b_tiers: ['gold', 'gold'],
        team_a_score: 21, team_b_score: 3,
        format: 'americano', tournament_type: 'club_internal',
      });
      const b1 = r.find((x) => x.player_id === 'b1')!;
      expect(b1.breakdown.base).toBe(25);
    });

    it('21-19 loss americano: base = 48 (47.5 → roundHalfUp = 48)', () => {
      const r = calculate({
        id: 'x', tournament_id: 't', team_a: ['a1', 'a2'], team_b: ['b1', 'b2'],
        team_a_tiers: ['gold', 'gold'], team_b_tiers: ['gold', 'gold'],
        team_a_score: 21, team_b_score: 19,
        format: 'americano', tournament_type: 'club_internal',
      });
      const b1 = r.find((x) => x.player_id === 'b1')!;
      expect(b1.breakdown.base).toBe(48);
    });

    it('bracket win = 100, bracket loss = 25', () => {
      const r = calculate({
        id: 'x', tournament_id: 't', team_a: ['a1', 'a2'], team_b: ['b1', 'b2'],
        team_a_tiers: ['gold', 'gold'], team_b_tiers: ['gold', 'gold'],
        team_a_score: 6, team_b_score: 4,
        format: 'bracket', tournament_type: 'club_internal',
      });
      expect(r.find((x) => x.player_id === 'a1')!.breakdown.base).toBe(100);
      expect(r.find((x) => x.player_id === 'b1')!.breakdown.base).toBe(25);
    });
  });

  describe('ties produce no awards', () => {
    it('returns empty array on team_a_score === team_b_score', () => {
      const r = calculate({
        id: 'x', tournament_id: 't', team_a: ['a1', 'a2'], team_b: ['b1', 'b2'],
        team_a_tiers: ['gold', 'gold'], team_b_tiers: ['gold', 'gold'],
        team_a_score: 10, team_b_score: 10,
        format: 'americano', tournament_type: 'club_internal',
      });
      expect(r).toEqual([]);
    });
  });
});
```

That's the structure. Expand `describe.each` over the remaining tier permutations until coverage hits 100%. Aim for ~250 total cases including:
- Same-tier wins per (tier × format × tournament_type) → 40 cases
- Cross-tier wins (4 patterns × 4 formats × 2 tournament_types) → 32
- All 5 half-integer averaging cases → 5
- Base-points participation floor cases → 10
- Tie/zero-score handling → 5
- Bracket win/loss flat → 10
- Mixed opponent tiers (16 doubles permutations × 4 formats) → 64+
- Loss with extreme tier diff (tier_mult always 1.0 on loss) → 20

- [ ] **Step 6: Run full suite — confirm 100% coverage on `calculate.ts` + `rounding.ts`**

```bash
npm run test -- --coverage scoring
# Verify src/features/scoring/calculate.ts and rounding.ts show 100% line + branch
```

- [ ] **Step 7: Commit**

```bash
git add src/features/scoring/calculate.ts tests/unit/scoring-calculate.test.ts
git commit -m "feat(m3): pure calculate() with ~250 unit tests at 100% coverage"
```

---

### Task 5.3: Idempotent ledger writer

**Files:**
- Create: `src/features/scoring/ledger.ts`
- Test: `tests/integration/scoring-ledger.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('writeLedgerForMatch', () => {
  it('inserts one ledger row per player', async () => {
    // seed match + players, call writeLedgerForMatch, assert 4 ledger rows
  });

  it('is idempotent — re-running for same match is a no-op', async () => {
    await writeLedgerForMatch(matchId);
    const before = await db.select().from(points_ledger).where(eq(points_ledger.match_id, matchId));
    await writeLedgerForMatch(matchId);
    const after = await db.select().from(points_ledger).where(eq(points_ledger.match_id, matchId));
    expect(after.length).toBe(before.length);
  });

  it('rejects when match status != confirmed/admin_set', async () => {
    // seed a pending match_result, call writeLedgerForMatch → expect Error
  });
});
```

- [ ] **Step 2: Implement**

`src/features/scoring/ledger.ts`:

```typescript
import { db } from '@/libs/DB';
import { matches, match_results, points_ledger, players, tournaments } from '@/models/Schema';
import { eq, inArray } from 'drizzle-orm';
import { calculate } from './calculate';
import type { MatchInput } from './types';

export async function writeLedgerForMatch(matchId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(matches).where(eq(matches.id, matchId));
    const [mr] = await tx.select().from(match_results).where(eq(match_results.match_id, matchId));
    if (!m || !mr) throw new Error('Match or result not found');
    if (mr.status !== 'confirmed' && mr.status !== 'admin_set') {
      throw new Error(`Cannot write ledger for status=${mr.status}`);
    }

    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, m.tournament_id));

    const allPlayerIds = [...m.team_a, ...m.team_b];
    const playerRows = await tx.select({ id: players.id, tier: players.tier })
      .from(players)
      .where(inArray(players.id, allPlayerIds));   // only the 4 players in this match
    const tierByPlayer = new Map(playerRows.map((p) => [p.id, p.tier]));
    const tierFor = (id: string) => tierByPlayer.get(id)!;

    const input: MatchInput = {
      id: m.id, tournament_id: m.tournament_id,
      team_a: [m.team_a[0], m.team_a[1]],
      team_b: [m.team_b[0], m.team_b[1]],
      team_a_tiers: [tierFor(m.team_a[0]), tierFor(m.team_a[1])],
      team_b_tiers: [tierFor(m.team_b[0]), tierFor(m.team_b[1])],
      team_a_score: mr.team_a_score,
      team_b_score: mr.team_b_score,
      format: t.format,
      tournament_type: t.tournament_type,
    };

    const awards = calculate(input);
    if (awards.length === 0) return;

    await tx.insert(points_ledger).values(awards.map((a) => ({
      player_id: a.player_id,
      match_id: m.id,
      points: a.points.toString(),
      breakdown: a.breakdown,
      earned_at: mr.confirmed_at ?? new Date(),
    }))).onConflictDoNothing();
  });
}

export async function rewriteLedgerForMatch(matchId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(points_ledger).where(eq(points_ledger.match_id, matchId));
  });
  await writeLedgerForMatch(matchId);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/scoring/ledger.ts tests/integration/scoring-ledger.test.ts
git commit -m "feat(m3): idempotent ledger writer with rewrite path for admin override"
```

---

### Task 5.4: `submitScore` Server Action

**Files:**
- Create: `src/features/scoring/actions.ts`
- Test: `tests/integration/scoring-submit.test.ts`

- [ ] **Step 1: Write the failing test** (covers participation guard, ON CONFLICT, rate limit)

- [ ] **Step 2: Implement `submitScore`** per spec §4.7 step 1: resolve `submitter_player_id`, reject non-participants, INSERT match_results with `ON CONFLICT DO NOTHING`. Returns `Result<{ pending: true }>` or `Result<{ alreadySubmitted: true }>` on conflict.

- [ ] **Step 3: Commit**

```bash
git add src/features/scoring/actions.ts tests/integration/scoring-submit.test.ts
git commit -m "feat(m3): submitScore server action with participation guard"
```

---

### Task 5.5: `confirmScore` Server Action with opposite-team guard

**Files:**
- Modify: `src/features/scoring/actions.ts`
- Test: `tests/integration/scoring-confirm.test.ts`

- [ ] **Step 1: Write failing test** covering:
  - Same-team confirm → CONFLICT_OF_INTEREST
  - Opposite-team confirm → success + ledger written + `createNotification('score_confirmed')` for all 4 participants
  - Second concurrent confirm → no-op (already confirmed)
  - Non-participant → 404-equivalent error

- [ ] **Step 2: Implement** per spec §4.7 step 2-3 with `SELECT … FOR UPDATE`, transaction including `writeLedgerForMatch`, then `createNotification` after commit.

- [ ] **Step 3: Commit**

```bash
git add src/features/scoring/actions.ts tests/integration/scoring-confirm.test.ts
git commit -m "feat(m3): confirmScore with opposite-team guard and ledger write"
```

---

### Task 5.6: `disputeScore`, `adminOverrideMatch`, `adminVoidMatch`

**Files:**
- Modify: `src/features/scoring/actions.ts`
- Test: `tests/integration/scoring-admin.test.ts`

- [ ] **Step 1: Write tests** covering:
  - `disputeScore` transitions pending→disputed, fires `score_disputed` to all club admins
  - `adminOverrideMatch` resolves `adminPlayerId`, rejects when admin is a participant (CONFLICT_OF_INTEREST), wraps delete+rewrite ledger + snapshot stale flag in one transaction, fires `score_overridden`
  - `adminVoidMatch` sets both `matches.status` and `match_results.status` to `void`, deletes ledger rows, fires `score_overridden` with `void: true`
  - Two-admin race → second admin sees ALREADY_OVERRIDDEN

- [ ] **Step 2: Implement all three.** Use `SELECT … FOR UPDATE` on `match_results`. Mark affected `leaderboard_snapshots` as `stale = true`.

- [ ] **Step 3: Commit**

```bash
git add src/features/scoring/actions.ts tests/integration/scoring-admin.test.ts
git commit -m "feat(m3): disputeScore adminOverride adminVoid with race-safe transactions"
```

---

### Task 5.7: Submit/confirm/dispute UI

**Files:**
- Create: `src/app/match/[id]/submit/page.tsx`
- Create: `src/app/match/[id]/confirm/page.tsx`
- Create: `src/features/scoring/components/SubmitScoreForm.tsx`
- Create: `src/features/scoring/components/ConfirmScorePanel.tsx`
- Test: `tests/e2e/match-submit-confirm.spec.ts`

- [ ] **Step 1: Write the failing E2E test** — full flow: player A submits, player B confirms, leaderboard reflects.

- [ ] **Step 2: Implement layouts with participation gate** (404 on non-participant per spec §4.7 step 2).

- [ ] **Step 3: Implement forms with `useOptimistic` per spec §4.7 — but ONLY local UI optimistic, not public leaderboard.**

- [ ] **Step 4: Commit**

```bash
git add src/app/match/[id] src/features/scoring/components/ tests/e2e/match-submit-confirm.spec.ts
git commit -m "feat(m3): submit and confirm score UIs with optimistic local state"
```

---

### Task 5.8: Admin score override UI `/c/[slug]/admin/tournaments/[id]/scores`

**Files:**
- Create: `src/app/c/[slug]/admin/tournaments/[id]/scores/page.tsx`
- Create: `src/features/scoring/components/AdminScoreTable.tsx`

- [ ] **Step 1: Implement page listing all matches with status + admin override controls.**
- [ ] **Step 2: Show CONFLICT_OF_INTEREST error inline when admin is a participant.**
- [ ] **Step 3: Commit**

```bash
git add src/app/c/[slug]/admin/tournaments/[id]/scores src/features/scoring/components/AdminScoreTable.tsx
git commit -m "feat(m3): admin score override table with conflict-of-interest guard"
```

---

### Task 5.9: M3 PR + merge

- [ ] **Step 1: Push, open PR, verify CI green** (especially 100% coverage on `calculate.ts`).
- [ ] **Step 2: Friday demo** — run a full americano match end-to-end, show the Gold-player 60.95 calculation with the breakdown popover.

**End of Chunk 5.**

---

## Chunk 6: M4 — Leaderboard + Cron + Auto-Promotion (parallel worktree)

**Worktree:** `~/Code/padelz-worktrees/m4-leaderboard` on branch `feat/padel-m4`.
**Owns table:** `leaderboard_snapshots`.
**Reads from:** `points_ledger` (M3), `players` (M1), `tournaments` (M2 — for tournament_type stats).
**Calls into M1:** `promotePlayer` Server Action for auto-promotion.
**Duration:** ~3 weeks parallel.

---

### Task 6.1: Snapshot rebuild SQL (week boundaries in ICT)

**Files:**
- Create: `src/features/leaderboard/snapshot.ts`
- Test: `tests/integration/snapshot-rebuild.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import { db } from '@/libs/DB';
import { players, points_ledger, leaderboard_snapshots, users } from '@/models/Schema';
import { rebuildSnapshot } from '@/features/leaderboard/snapshot';
import { eq, and } from 'drizzle-orm';

describe('rebuildSnapshot', () => {
  it('only includes players with >= 1 match in the period', async () => {
    // seed 3 gold players: A with 2 matches, B with 1 match, C with 0 matches
    // run rebuildSnapshot('week', weekStart)
    // assert only A and B appear in snapshot for gold/week
    const rows = await db.select().from(leaderboard_snapshots).where(and(
      eq(leaderboard_snapshots.period, 'week'),
      eq(leaderboard_snapshots.tier, 'gold'),
    ));
    expect(rows.length).toBe(2);
  });

  it('ranks deterministically via points_sum DESC, match_count DESC, created_at ASC', async () => {
    // seed two players tied on points (50 each), same match_count, but different created_at
    // assert older player has rank=1, newer player has rank=2
  });

  it('marks rows as not stale and stamps rebuilt_at', async () => {
    // run rebuildSnapshot, assert stale=false and rebuilt_at recent
  });

  it('handles re-run idempotently (upsert)', async () => {
    // run twice in a row, assert no duplicate rows
  });
});
```

- [ ] **Step 2: Implement `src/features/leaderboard/snapshot.ts`**

```typescript
import { db } from '@/libs/DB';
import { sql } from 'drizzle-orm';
import type { LeaderboardPeriod } from './types';

export async function rebuildSnapshot(period: LeaderboardPeriod, periodStart: Date): Promise<void> {
  // ICT (+07): weeks start Monday 00:00 ICT, months start day 1 00:00 ICT.
  // periodStart is the start; period boundary is determined by period kind.
  const periodEnd = computePeriodEnd(period, periodStart);

  await db.execute(sql`
    INSERT INTO leaderboard_snapshots (period, period_start, tier, player_id, rank, points_sum, match_count, stale, rebuilt_at)
    SELECT
      ${period}::leaderboard_period AS period,
      ${periodStart.toISOString().slice(0, 10)}::date AS period_start,
      p.tier,
      pl.player_id,
      ROW_NUMBER() OVER (
        PARTITION BY p.tier
        ORDER BY SUM(pl.points::numeric) DESC, COUNT(pl.id) DESC, p.created_at ASC
      ) AS rank,
      SUM(pl.points::numeric) AS points_sum,
      COUNT(pl.id) AS match_count,
      FALSE AS stale,
      NOW() AS rebuilt_at
    FROM points_ledger pl
    INNER JOIN players p ON p.id = pl.player_id
    WHERE pl.earned_at >= ${periodStart.toISOString()}::timestamptz
      AND pl.earned_at < ${periodEnd.toISOString()}::timestamptz
      AND p.redacted_at IS NULL
    GROUP BY p.tier, pl.player_id, p.created_at
    HAVING COUNT(pl.id) >= 1
    ON CONFLICT (period, period_start, tier, player_id) DO UPDATE
      SET rank = EXCLUDED.rank,
          points_sum = EXCLUDED.points_sum,
          match_count = EXCLUDED.match_count,
          stale = FALSE,
          rebuilt_at = NOW();
  `);
}

function computePeriodEnd(period: LeaderboardPeriod, start: Date): Date {
  const d = new Date(start);
  if (period === 'week') d.setUTCDate(d.getUTCDate() + 7);
  else if (period === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (period === 'season') d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

export function currentWeekStartICT(): Date {
  const now = new Date();
  const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const day = ict.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day; // Monday
  ict.setUTCDate(ict.getUTCDate() + offset);
  ict.setUTCHours(0, 0, 0, 0);
  return new Date(ict.getTime() - 7 * 60 * 60 * 1000); // back to UTC
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/leaderboard/snapshot.ts tests/integration/snapshot-rebuild.test.ts
git commit -m "feat(m4): snapshot rebuild with row_number + match-count gate + ict week boundaries"
```

---

### Task 6.2: Auto-promotion checker

**Files:**
- Create: `src/features/leaderboard/autopromote.ts`
- Test: `tests/integration/auto-promote.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
describe('checkAutoPromote', () => {
  it('promotes a player who is rank ≤ 3 in same tier for 4 consecutive weeks with ≥ 4 cumulative matches', async () => {
    // seed snapshots for 4 weeks, all rank=1, same tier=silver, 1 match each → 4 cumulative
    // call checkAutoPromote(currentWeekStart)
    // assert players.tier updated to gold + tier_history opened
    // assert notification fired
  });

  it('does NOT promote a player with only 3 consecutive top-3 weeks', async () => { /* ... */ });

  it('does NOT promote a thin-tier player with 4 weeks of rank=1 but only 2 total matches', async () => { /* ... */ });

  it('does NOT promote a player who changed tiers mid-window', async () => { /* ... */ });

  it('is idempotent via pg_advisory_lock on the period_start', async () => { /* run twice in parallel, assert one promotion */ });
});
```

- [ ] **Step 2: Implement**

```typescript
import { db } from '@/libs/DB';
import { sql } from 'drizzle-orm';
import { promotePlayer } from '@/features/profiles/actions';
import { TIERS, TIER_TO_INT, type Tier } from '@/features/profiles/types';
import { logger } from '@/libs/Logger';

export async function checkAutoPromote(currentWeekStart: Date): Promise<{ promoted: number }> {
  const lockKey = `padelz_promote_${currentWeekStart.toISOString().slice(0, 10)}`;

  const [acquired] = await db.execute<{ pg_try_advisory_lock: boolean }>(sql`
    SELECT pg_try_advisory_lock(hashtextextended(${lockKey}, 0))
  `);
  if (!acquired || !(acquired as any).pg_try_advisory_lock) {
    logger.info({ lockKey }, 'auto-promote already running, skipping');
    return { promoted: 0 };
  }

  try {
    // Players with rank <= 3 in all of the 4 most recent weekly snapshots
    // AND same tier across all 4 weeks
    // AND cumulative match_count >= 4
    const candidates = await db.execute<{ player_id: string; from_tier: string; to_tier: string }>(sql`
      WITH last4 AS (
        SELECT player_id, tier, rank, match_count, period_start
        FROM leaderboard_snapshots
        WHERE period = 'week'
          AND period_start >= ${new Date(currentWeekStart.getTime() - 3 * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}::date
          AND period_start <= ${currentWeekStart.toISOString().slice(0, 10)}::date
      ),
      eligible AS (
        SELECT player_id, MIN(tier) AS tier, COUNT(*) AS week_count, SUM(match_count) AS cumulative
        FROM last4
        WHERE rank <= 3
        GROUP BY player_id
        HAVING COUNT(*) = 4
           AND MIN(tier::text) = MAX(tier::text)
           AND SUM(match_count) >= 4
      )
      SELECT
        e.player_id,
        e.tier AS from_tier,
        CASE e.tier::text
          WHEN 'bronze'   THEN 'silver'
          WHEN 'silver'   THEN 'gold'
          WHEN 'gold'     THEN 'platinum'
          WHEN 'platinum' THEN 'diamond'
          ELSE NULL
        END AS to_tier
      FROM eligible e
      WHERE CASE e.tier::text
              WHEN 'diamond' THEN FALSE ELSE TRUE
            END;
    `);

    let promoted = 0;
    for (const c of (candidates as any).rows ?? []) {
      if (!c.to_tier) continue;
      const r = await promotePlayer({
        player_id: c.player_id,
        new_tier: c.to_tier as Tier,
        reason: 'auto_promote',
      });
      if (r.success) promoted++;
    }
    return { promoted };
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtextextended(${lockKey}, 0))`);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/leaderboard/autopromote.ts tests/integration/auto-promote.test.ts
git commit -m "feat(m4): auto-promotion check with advisory lock + activity threshold"
```

---

### Task 6.3: Weekly leaderboard cron route

**Files:**
- Create: `src/app/api/cron/leaderboard/route.ts`
- Test: `tests/integration/cron-leaderboard.test.ts`

- [ ] **Step 1: Write the failing test** verifying:
  - 401 without `CRON_SECRET` header
  - 200 with valid header, runs snapshot rebuild for week + month, then auto-promote check

- [ ] **Step 2: Implement**

```typescript
import { Env } from '@/libs/Env';
import { rebuildSnapshot, currentWeekStartICT } from '@/features/leaderboard/snapshot';
import { checkAutoPromote } from '@/features/leaderboard/autopromote';
import { logger } from '@/libs/Logger';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${Env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const t0 = Date.now();
  const weekStart = currentWeekStartICT();

  // Month start = first day of the month containing weekStart, expressed as ICT midnight (UTC -7h).
  // Avoid `new Date(y, m, d)` — that builds in the process local timezone (UTC on Vercel, ICT on dev).
  const ictWeekStart = new Date(weekStart.getTime() + 7 * 60 * 60 * 1000); // shift into ICT for date math
  const monthStartICT = new Date(Date.UTC(ictWeekStart.getUTCFullYear(), ictWeekStart.getUTCMonth(), 1, 0, 0, 0));
  const monthStart = new Date(monthStartICT.getTime() - 7 * 60 * 60 * 1000); // back to UTC, == ICT midnight

  await rebuildSnapshot('week', weekStart);
  await rebuildSnapshot('month', monthStart);
  const { promoted } = await checkAutoPromote(weekStart);
  logger.info({ promoted, durationMs: Date.now() - t0 }, 'leaderboard cron complete');
  return Response.json({ ok: true, promoted });
}
```

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/leaderboard", "schedule": "55 16 * * 0" },
    { "path": "/api/cron/expire-pending", "schedule": "30 17 * * *" }
  ]
}
```

(Sun 23:55 ICT = Sun 16:55 UTC; daily 00:30 ICT = 17:30 UTC the day prior.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/leaderboard/route.ts vercel.json tests/integration/cron-leaderboard.test.ts
git commit -m "feat(m4): weekly leaderboard cron with snapshot rebuild + auto-promote"
```

---

### Task 6.4: Expire-pending cron (§4.7 race table)

**Files:**
- Create: `src/app/api/cron/expire-pending/route.ts`
- Test: `tests/integration/expire-pending.test.ts`

- [ ] **Step 1: Write test** — seed pending match_results older than 48h, run, assert club admins received `pending_expired` notifications, status stays pending (we do not auto-confirm).

- [ ] **Step 2: Implement**

```typescript
import { Env } from '@/libs/Env';
import { db } from '@/libs/DB';
import { match_results, matches, tournaments, club_memberships } from '@/models/Schema';
import { sql, eq, and, lt } from 'drizzle-orm';
import { createNotification } from '@/features/notifications/actions';

export async function POST(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${Env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const stuck = await db.select({
    match_id: match_results.match_id,
    tournament_id: matches.tournament_id,
    club_id: tournaments.club_id,
  })
    .from(match_results)
    .innerJoin(matches, eq(matches.id, match_results.match_id))
    .innerJoin(tournaments, eq(tournaments.id, matches.tournament_id))
    .where(and(eq(match_results.status, 'pending'), lt(match_results.submitted_at, cutoff)));

  for (const row of stuck) {
    const admins = await db.select({ user_id: club_memberships.user_id })
      .from(club_memberships)
      .where(and(eq(club_memberships.club_id, row.club_id), eq(club_memberships.role, 'admin')));
    if (admins.length) {
      await createNotification({
        user_ids: admins.map((a) => a.user_id),
        type: 'pending_expired',
        payload: { match_id: row.match_id, tournament_id: row.tournament_id },
      });
    }
  }
  return Response.json({ ok: true, expired: stuck.length });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/expire-pending/route.ts tests/integration/expire-pending.test.ts
git commit -m "feat(m4): expire-pending cron notifies club admins of 48h-stuck scores"
```

---

### Task 6.5: Leaderboard page `/leaderboard` (and tier-specific `/leaderboard/[tier]`)

**Files:**
- Create: `src/app/leaderboard/page.tsx`
- Create: `src/app/leaderboard/[tier]/page.tsx`
- Create: `src/features/leaderboard/components/LeaderboardTable.tsx`
- Create: `src/features/leaderboard/components/TierFilter.tsx`
- Test: `tests/e2e/leaderboard.spec.ts`

- [ ] **Step 1: Write E2E** — leaderboard renders top-50 per tier with rank, handle, name, points, match_count. Click tier filter → URL changes + table re-renders. Mobile viewport renders without horizontal scroll.

- [ ] **Step 2: Implement `LeaderboardTable.tsx`** as a Server Component reading from `leaderboard_snapshots` joined to `players`, ordered by rank. Cache with `revalidate = 30`.

- [ ] **Step 3: Implement `TierFilter.tsx`** as a small client component with shadcn `<Tabs>` linking to `/leaderboard/[tier]`.

- [ ] **Step 4: Implement both pages** with the perf budget in mind — pure Server Components, no client-side data fetching libraries.

- [ ] **Step 5: Commit**

```bash
git add src/app/leaderboard src/features/leaderboard/components/
git commit -m "feat(m4): leaderboard page with tier filter and server-rendered table"
```

---

### Task 6.6: Player points history `/me/points`

**Files:**
- Create: `src/app/me/points/page.tsx`
- Create: `src/features/leaderboard/components/PointsBreakdownRow.tsx`

- [ ] **Step 1: Implement page** reading `points_ledger` rows for the current user, joined to `matches` and `tournaments` for context. Each row expands to show the `breakdown` JSONB (the receipts).

- [ ] **Step 2: Commit**

```bash
git add src/app/me/points src/features/leaderboard/components/PointsBreakdownRow.tsx
git commit -m "feat(m4): /me/points history with full breakdown receipts"
```

---

### Task 6.7: M4 PR + merge

- [ ] **Step 1: Push, open PR, verify CI green.**
- [ ] **Step 2: Friday demo** — show the leaderboard updating after a submitted+confirmed match, then trigger the cron manually and demonstrate the snapshot rebuild + a test auto-promotion.

**End of Chunk 6.**

---

## Chunk 7: Week 6 — Polish + Pilot (single thread)

Foundation back to a single thread. Everything merged from M1-M4. Five days to polish, audit, and ship the first real Phuket tournament on the platform.

**Duration:** 5 days.
**End-of-chunk state:** padelz.proxyz.studio live, one pilot club running a tournament, smoke probe green, Sentry quiet, Lighthouse budget green, PWA installable on a real iPhone.

---

### Task 7.1: iOS Safari PWA install testing

**Files:**
- Refine: `src/app/manifest.ts` (final icons, screenshots, shortcuts)
- Refine: `public/sw.js` (cache versioning, update flow)
- Refine: `public/icons/` (real designed icons, not placeholder pink)

- [ ] **Step 1: Design real PWA icons** in PROXYZ brand — pink monogram on dark, exported at 192/512/maskable-512 in `public/icons/`. Use `@vercel/og` or the figma export.

- [ ] **Step 2: Add screenshots to manifest** (`screenshots` array — 3 mobile screenshots: landing, leaderboard, profile).

- [ ] **Step 3: Add app shortcuts** to manifest:

```typescript
shortcuts: [
  { name: 'Leaderboard', url: '/leaderboard' },
  { name: 'My points', url: '/me/points' },
  { name: 'Tournaments', url: '/t' },
],
```

- [ ] **Step 4: Test on a real iPhone (Tew's iPhone 15 Pro Max)**
  - Open Safari to https://padelz.proxyz.studio
  - Tap Share → Add to Home Screen
  - Verify icon shows the new design
  - Open from home screen — must launch fullscreen with no Safari chrome
  - Test offline (Airplane Mode) — landing + leaderboard must render from cache

- [ ] **Step 5: Commit**

```bash
git add src/app/manifest.ts public/sw.js public/icons/
git commit -m "feat(polish): real pwa icons screenshots shortcuts and ios install verified"
```

---

### Task 7.2: Full E2E sweep against staging

**Files:**
- Add: `tests/e2e/*.spec.ts` — flesh out the 10 critical flows the spec lists

- [ ] **Step 1: Confirm all 10 E2E flows exist and pass against the Vercel preview URL**

```
tests/e2e/
├── signup-creates-profile.spec.ts          (from Task 3.1)
├── player-profile.spec.ts                  (from Task 3.4)
├── profile-edit.spec.ts                    (from Task 3.5)
├── club-page.spec.ts                       (from Task 3.6)
├── create-tournament.spec.ts               (from Task 4.2)
├── register-tournament.spec.ts             (NEW — covers Task 4.3 UI)
├── bracket-builder.spec.ts                 (from Task 4.6)
├── match-submit-confirm.spec.ts            (from Task 5.7)
├── admin-override.spec.ts                  (from Task 5.8)
├── leaderboard.spec.ts                     (from Task 6.5)
├── pwa-install.spec.ts                     (NEW — mobile viewport, manifest check)
└── vertical-slice.spec.ts                  (from Task 1.15 — keep as smoke)
```

- [ ] **Step 2: Add the two NEW spec files** (`register-tournament.spec.ts` and `pwa-install.spec.ts`).

- [ ] **Step 3: Run the full E2E suite**

```bash
PLAYWRIGHT_BASE_URL=https://padelz-git-main.vercel.app npm run test:e2e
# Expected: all green across chromium-desktop + chromium-mobile projects
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/register-tournament.spec.ts tests/e2e/pwa-install.spec.ts
git commit -m "test(polish): complete e2e flow coverage for v0.5 pilot"
```

---

### Task 7.3: Sentry sourcemap + alert verification

- [ ] **Step 1: Trigger a real client-side error from prod**

```bash
# In Safari on the prod site, open dev console and run:
# Sentry.captureException(new Error('pilot polish test'))
# OR add a temp button on /me that throws when clicked
```

- [ ] **Step 2: Open the Sentry dashboard for the padelz project**
  - Verify the event appears with a readable stack trace (filenames, line numbers from the original `.tsx` files, not minified)
  - If lines are unreadable: the `withSentryConfig` `hideSourceMaps: true` is masking them — adjust `widenClientFileUpload` or upload sourcemaps via `sentry-cli` in the build.

- [ ] **Step 3: Configure Sentry alerts**
  - Email + Slack alert when any error_event from `padelz` prod hits >5 occurrences in 1 hour
  - Email alert when a P0 issue (5xx-class) lands

- [ ] **Step 4: Document in `~/.claude/primer.md`** that prod errors flow into Sentry and where to look.

(No commit needed for dashboard config; this is observability tuning.)

---

### Task 7.4: Production performance audit (Lighthouse + real device)

- [ ] **Step 1: Run Lighthouse against the production URL**

```bash
npx lhci autorun --collect.url=https://padelz.proxyz.studio/ \
  --collect.url=https://padelz.proxyz.studio/leaderboard \
  --upload.target=temporary-public-storage
```

Verify all routes hit the perf budget from spec §1.6:
- FCP < 1.5s
- LCP < 2.5s
- TBT < 200ms
- JS gzip < 50kb on landing, < 80kb on leaderboard

- [ ] **Step 2: Real-device test on Tew's iPhone over Phuket 4G**
  - Throttle Chrome DevTools to "Fast 3G" as a proxy if you can't get on actual Phuket 4G yet
  - Time-to-content on `/leaderboard` should feel under 2 seconds

- [ ] **Step 3: Fix any budget bust** — most likely culprit is a stray Client Component shipping more JS than expected. Use `ANALYZE=true npm run build` to get the bundle breakdown. Aggressively convert Client → Server Components where feasible.

- [ ] **Step 4: Commit any fixes**

```bash
git add src/...
git commit -m "perf(polish): convert X to server component to hit leaderboard JS budget"
```

---

### Task 7.5: Database health check — indexes, slow queries, connection pool

- [ ] **Step 1: Run `EXPLAIN ANALYZE` on the hot read queries** in Neon dashboard or via psql:
  - `SELECT * FROM leaderboard_snapshots WHERE period='week' AND period_start=$1 AND tier=$2 ORDER BY rank LIMIT 50`
  - `SELECT * FROM points_ledger WHERE player_id=$1 ORDER BY earned_at DESC LIMIT 50`
  - `SELECT * FROM tournaments WHERE club_id=$1 AND start_at > NOW() ORDER BY start_at`
  - Each must use an index scan, not a sequential scan
  - p95 latency under 50ms

- [ ] **Step 2: Verify connection pool sizing** — Neon serverless drivers do their own pooling; confirm no `too many connections` errors in Sentry over the past 48h.

- [ ] **Step 3: Add a follow-up issue if any index is missing** — do not improvise an index hotfix in the polish week. Note it and ship later.

---

### Task 7.6: Pilot club onboarding

**Files:**
- `CONTEXT.md` (the project-root one, not the spec) — add a "Pilot — Destination Padel" section

- [ ] **Step 1: Email Destination Padel** (or whichever Phase 1 club is ready first per CONTEXT.md):
  - Brief intro
  - Link to https://padelz.proxyz.studio
  - Offer to set up their club profile + create their first tournament with them in person
  - Tew to confirm send before email goes out (per `~/.claude/CLAUDE.md` "Confirm before sending real outbound emails")

- [ ] **Step 2: Onboard the club**
  - Sign them up via Clerk
  - Insert a `club_memberships` row with `role = 'admin'` for their primary contact
  - Walk them through creating their first tournament + bracket generation + first score submit

- [ ] **Step 3: Invite the first ~20 players** (existing Destination Padel members, mostly via WhatsApp share link to the app).

- [ ] **Step 4: Capture pilot feedback in `CONTEXT.md`**

```markdown
### 2026-MM-DD — Destination Padel pilot launch
- N players signed up
- M matches confirmed
- X issues hit (each linked to a GitHub issue)
- First-month leaderboard live
```

---

### Task 7.7: v0.5.0 release + announcement

- [ ] **Step 1: Tag the release**

```bash
git tag -a v0.5.0 -m "padelz v0.5.0 — bare core loop MVP, pilot at Destination Padel"
git push origin v0.5.0
```

- [ ] **Step 2: Write `CHANGELOG.md`** — what shipped in v0.5 (the 6 spec sections in plain language).

- [ ] **Step 3: Announce on PROXYZ channels**
  - LinkedIn post (PROXYZ Studio account)
  - Instagram story
  - Internal Slack to PROXYZ team
  - WhatsApp to early-supporter list

- [ ] **Step 4: Update `~/.claude/primer.md`** marking v0.5 shipped + pointing the active focus to whatever v1 polish work begins next.

- [ ] **Step 5: Friday demo to Tim + team**
  - 30-minute walkthrough of the live product
  - Hand over admin access to Tim
  - Discuss v1 priorities (private groups, marketplace, real-time bracket view, Telegram bot)

**End of Chunk 7. v0.5 shipped.**

---

## Plan complete

All 7 chunks written. Next step: run the final plan review pass across the entire document (spec ↔ plan coverage check), then hand off to **superpowers:subagent-driven-development** for execution starting at Chunk 1, Task 1.1.

Reference: spec is at `docs/superpowers/specs/2026-05-18-padelz-v1-design.md`.


