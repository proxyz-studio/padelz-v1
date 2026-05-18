import { pgEnum, pgTable, boolean, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

// ── Enums (M1) ────────────────────────────────────────────────────────────────

export const tier_enum = pgEnum('tier', ['bronze', 'silver', 'gold', 'platinum', 'diamond']);
export const membership_role_enum = pgEnum('membership_role', ['admin', 'member']);
export const tier_change_reason_enum = pgEnum('tier_change_reason', ['initial', 'auto_promote', 'auto_demote', 'manual']);

// ── Identity tables (M1) ──────────────────────────────────────────────────────

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

// ── Tasks 1.5 and 1.6 will append tournament + match + scoring tables below ──
