/**
 * Ledger writer — connects the pure calculate() output to the DB.
 *
 * writeLedgerInTx: core logic, takes a transaction handle. Callers that
 * already own a transaction (confirmScore, adminOverrideMatch) use this
 * variant to keep status-flip + ledger-insert atomic.
 *
 * writeLedgerForMatch: convenience wrapper that opens its own transaction.
 * Idempotent via the uq_player_match unique constraint + onConflictDoNothing.
 *
 * rewriteLedgerForMatch: deletes existing ledger rows for the match then
 * re-writes. Used by admin override paths in M3 Task 5.6.
 */

import { eq, inArray } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { db } from '@/libs/DB';
import * as schema from '@/models/Schema';
import {
  match_results,
  matches,
  players,
  points_ledger,
  tournaments,
} from '@/models/Schema';
import { calculate } from './calculate';
import type { MatchInput } from './types';

type Schema = typeof schema;
export type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

export class LedgerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'LedgerError';
  }
}

export async function writeLedgerInTx(
  tx: Tx,
  matchId: string,
): Promise<{ inserted: number; skipped: number }> {
  const [m] = await tx
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!m) throw new LedgerError('NOT_FOUND', 'match not found');

  const [mr] = await tx
    .select()
    .from(match_results)
    .where(eq(match_results.match_id, matchId))
    .limit(1);
  if (!mr) throw new LedgerError('NOT_FOUND', 'match_result not found');

  if (mr.status !== 'confirmed' && mr.status !== 'admin_set') {
    throw new LedgerError(
      'WRONG_STATUS',
      `cannot write ledger for match_result.status=${mr.status}`,
    );
  }

  const [t] = await tx
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, m.tournament_id))
    .limit(1);
  if (!t) throw new LedgerError('NOT_FOUND', 'tournament not found');

  if (m.team_a.length !== 2 || m.team_b.length !== 2) {
    throw new LedgerError(
      'BAD_SHAPE',
      `expected 2v2 teams, got ${m.team_a.length}v${m.team_b.length}`,
    );
  }

  const allPlayerIds = [...m.team_a, ...m.team_b];
  const playerRows = await tx
    .select({ id: players.id, tier: players.tier })
    .from(players)
    .where(inArray(players.id, allPlayerIds));
  const tierByPlayer = new Map(playerRows.map((p) => [p.id, p.tier]));
  if (tierByPlayer.size !== 4) {
    throw new LedgerError(
      'MISSING_PLAYERS',
      `expected 4 players, found ${tierByPlayer.size}`,
    );
  }

  const tierFor = (id: string) => {
    const tier = tierByPlayer.get(id);
    if (!tier) throw new LedgerError('MISSING_PLAYERS', `tier missing for ${id}`);
    return tier;
  };

  const input: MatchInput = {
    id: m.id,
    tournament_id: m.tournament_id,
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
  if (awards.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const rows = awards.map((a) => ({
    player_id: a.player_id,
    match_id: m.id,
    // numeric(8,2) — store as string per Drizzle's numeric convention.
    points: a.points.toFixed(2),
    breakdown: a.breakdown,
    earned_at: mr.confirmed_at ?? new Date(),
  }));

  const inserted = await tx
    .insert(points_ledger)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: points_ledger.id });

  return {
    inserted: inserted.length,
    skipped: rows.length - inserted.length,
  };
}

export async function writeLedgerForMatch(matchId: string): Promise<{
  inserted: number;
  skipped: number;
}> {
  return db.transaction((tx) => writeLedgerInTx(tx as Tx, matchId));
}

export async function rewriteLedgerForMatch(matchId: string): Promise<{
  inserted: number;
}> {
  await db.transaction(async (tx) => {
    await tx
      .delete(points_ledger)
      .where(eq(points_ledger.match_id, matchId));
  });
  const r = await writeLedgerForMatch(matchId);
  return { inserted: r.inserted };
}
