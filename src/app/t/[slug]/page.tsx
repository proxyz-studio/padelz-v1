import { notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  brackets,
  clubs,
  matches,
  players,
  registrations,
  tournaments,
  users,
} from '@/models/Schema';
import { TierBadge } from '@/components/TierBadge';
import { RegisterButton } from '@/features/tournaments/components/RegisterButton';
import { BracketView } from '@/features/tournaments/components/BracketView';
import type { BracketData } from '@/features/tournaments/bracket';
import { TIER_TO_INT } from '@/features/profiles/types';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return { title: `${slug} · Padel-Z` };
}

const FORMAT_LABEL: Record<string, string> = {
  americano: 'Americano',
  mexicano: 'Mexicano',
  round_robin: 'Round-robin',
  bracket: 'Bracket',
};
const TYPE_LABEL: Record<string, string> = {
  open: 'Open',
  club_internal: 'Club',
  group: 'Group',
  casual: 'Casual',
};
const STATUS_CLS: Record<string, string> = {
  draft: 'mute',
  open: 'fn-green font-bold',
  in_progress: 'fn-blue font-bold',
  complete: 'mute',
};

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  let row:
    | (typeof tournaments.$inferSelect & {
        club_name: string;
        club_slug: string;
      })
    | undefined;
  let roster: Array<{
    player_id: string;
    handle: string;
    display_name: string;
    tier: string;
  }> = [];
  let dbError = false;
  let bracketData: BracketData | null = null;
  let playerMap: Map<string, { handle: string; display_name: string }> = new Map();
  let matchMap: Map<string, { id: string; team_a: string[]; team_b: string[]; result_status: 'pending'; score_a: null; score_b: null }> = new Map();
  let currentUserPlayerId: string | null = null;

  let clerkUserId: string | null = null;
  try {
    const a = await auth();
    clerkUserId = a.userId;
  } catch {
    clerkUserId = null;
  }

  let alreadyRegistered = false;
  let tierEligible = true;
  let currentPlayerTier: string | null = null;

  try {
    const [t] = await db
      .select({
        id: tournaments.id,
        slug: tournaments.slug,
        club_id: tournaments.club_id,
        name: tournaments.name,
        format: tournaments.format,
        tournament_type: tournaments.tournament_type,
        start_at: tournaments.start_at,
        tier_min: tournaments.tier_min,
        tier_max: tournaments.tier_max,
        status: tournaments.status,
        created_by: tournaments.created_by,
        created_at: tournaments.created_at,
        club_name: clubs.name,
        club_slug: clubs.slug,
      })
      .from(tournaments)
      .innerJoin(clubs, eq(clubs.id, tournaments.club_id))
      .where(eq(tournaments.slug, slug))
      .limit(1);

    if (t) {
      row = t;
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

      if (clerkUserId) {
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerk_id, clerkUserId))
          .limit(1);
        if (u) {
          const [p] = await db
            .select({ id: players.id, tier: players.tier })
            .from(players)
            .where(eq(players.user_id, u.id))
            .limit(1);
          if (p) {
            currentPlayerTier = p.tier;
            const playerInt = TIER_TO_INT[p.tier as keyof typeof TIER_TO_INT];
            if (t.tier_min && playerInt < TIER_TO_INT[t.tier_min]) tierEligible = false;
            if (t.tier_max && playerInt > TIER_TO_INT[t.tier_max]) tierEligible = false;
            const [reg] = await db
              .select({ id: registrations.id })
              .from(registrations)
              .where(
                and(
                  eq(registrations.tournament_id, t.id),
                  eq(registrations.player_id, p.id),
                  eq(registrations.status, 'registered'),
                ),
              )
              .limit(1);
            if (reg) alreadyRegistered = true;
          }
        }
      }

      const [bracketRow] = await db
        .select()
        .from(brackets)
        .where(eq(brackets.tournament_id, t.id))
        .limit(1);

      const matchRows = bracketRow
        ? await db.select().from(matches).where(eq(matches.tournament_id, t.id))
        : [];

      playerMap = new Map(
        roster.map((r) => [r.player_id, { handle: r.handle, display_name: r.display_name }]),
      );

      matchMap = new Map(
        matchRows.map((m) => [m.id, {
          id: m.id,
          team_a: m.team_a,
          team_b: m.team_b,
          result_status: 'pending' as const,
          score_a: null,
          score_b: null,
        }]),
      );

      if (clerkUserId) {
        const [pl] = await db
          .select({ id: players.id })
          .from(players)
          .innerJoin(users, eq(users.id, players.user_id))
          .where(eq(users.clerk_id, clerkUserId))
          .limit(1);
        currentUserPlayerId = pl?.id ?? null;
      }

      bracketData = bracketRow ? (bracketRow.data as BracketData) : null;
    }
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="px-4 pb-8">
        <p className="m-0 max-w-[640px] mute">
          Database unavailable for <span className="font-bold">/t/{slug}</span>.
        </p>
      </div>
    );
  }
  if (!row) notFound();

  const date = row.start_at.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = row.start_at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const tierBandLabel =
    row.tier_min || row.tier_max
      ? `${row.tier_min ?? 'any'} → ${row.tier_max ?? 'any'}`
      : null;
  const tierBandDisplay = tierBandLabel ?? 'All tiers';
  const tournamentClosed = row.status !== 'open' && row.status !== 'draft';
  const statusCls = STATUS_CLS[row.status] ?? '';

  return (
    <div className="px-4 pb-8">
      <p className="m-0 mute">Tournament · /t/{row.slug}</p>

      <p className="m-0 mt-12 max-w-[800px]">
        <span className="font-bold">{row.name}</span>{' '}
        <span className="mute">
          hosted by{' '}
          <Link href={`/c/${row.club_slug}`}>{row.club_name}</Link>
        </span>
      </p>
      <p className="m-0 mt-2 max-w-[800px] mute">
        {TYPE_LABEL[row.tournament_type] ?? row.tournament_type} ·{' '}
        {FORMAT_LABEL[row.format] ?? row.format} · {date} · {time} ·{' '}
        {tierBandDisplay} ·{' '}
        <span className={statusCls}>{row.status.replace('_', ' ')}</span>
      </p>

      <p className="m-0 mt-12">
        <RegisterButton
          tournamentId={row.id}
          signedIn={!!clerkUserId}
          alreadyRegistered={alreadyRegistered}
          tournamentClosed={tournamentClosed}
          tierEligible={tierEligible}
          tierBandLabel={tierBandLabel}
        />
        {currentPlayerTier && tierBandLabel ? (
          <span className="mute ml-3">
            · band {tierBandLabel} · your tier {currentPlayerTier}
          </span>
        ) : null}
      </p>

      <div className="rule mt-20">
        <div className="grid grid-cols-[60px_1fr_280px_56px] gap-6 mute pt-6 pb-3">
          <span>#</span>
          <span>Player</span>
          <span>Tier</span>
          <span></span>
        </div>
      </div>

      {roster.length === 0 ? (
        <div className="px-3 py-12 mute">
          No players registered yet — be the first.
        </div>
      ) : (
        <table className="table">
          <colgroup>
            <col style={{ width: '60px' }} />
            <col />
            <col style={{ width: '280px' }} />
            <col className="arrow" />
          </colgroup>
          <tbody>
            {roster.map((p, i) => (
              <tr key={p.handle}>
                <td className="mute tabular-nums no-underline">
                  {String(i + 1).padStart(2, '0')}
                </td>
                <td>
                  <Link href={`/p/${p.handle}`} className="no-underline">
                    <span className="font-bold">{p.display_name}</span>{' '}
                    <span className="mute">@{p.handle}</span>
                  </Link>
                </td>
                <td className="mute">
                  <TierBadge tier={p.tier} />
                </td>
                <td className="arrow no-underline">
                  <Link href={`/p/${p.handle}`}>→</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="m-0 mt-8 mute tabular-nums">
        {String(roster.length).padStart(2, '0')} player
        {roster.length === 1 ? '' : 's'} registered
      </p>

      {bracketData ? (
        <section style={{ marginTop: '2em' }}>
          <p className="mute">Bracket</p>
          <BracketView
            bracket={bracketData}
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
    </div>
  );
}
