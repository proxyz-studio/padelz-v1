import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { assertClubAdmin, ForbiddenError } from '@/libs/Authz';
import {
  clubs,
  match_results,
  matches,
  players,
  tournaments,
  users,
} from '@/models/Schema';
import {
  AdminScoreTable,
  type AdminMatchRow,
} from '@/features/scoring/components/AdminScoreTable';

export const dynamic = 'force-dynamic';

type Params = { slug: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug, id } = await params;
  return { title: `Scores · ${slug} · ${id.slice(0, 8)} · Padel-Z` };
}

export default async function AdminScoresPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug, id } = await params;

  let clerkUserId: string | null = null;
  try {
    const a = await auth();
    clerkUserId = a.userId;
  } catch {
    clerkUserId = null;
  }
  if (!clerkUserId) {
    redirect(`/sign-in?redirect_url=/c/${slug}/admin/tournaments/${id}/scores`);
  }

  const [club] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.slug, slug))
    .limit(1);
  if (!club) notFound();

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.id, id), eq(tournaments.club_id, club.id)))
    .limit(1);
  if (!tournament) notFound();

  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerk_id, clerkUserId))
    .limit(1);
  if (!u) notFound();

  // Admin guard: throw → 404 (don't leak admin-page existence to non-admins).
  try {
    await assertClubAdmin(u.id, club.id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }

  // Admin's own player_id, so we can flag rows where override would be a
  // conflict of interest (matches the server-side guard in adminOverrideMatch).
  const [adminPlayer] = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.user_id, u.id))
    .limit(1);

  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.tournament_id, tournament.id));

  // Fetch match_results in one shot.
  const resultRows = matchRows.length
    ? await db
        .select()
        .from(match_results)
        .where(
          inArray(
            match_results.match_id,
            matchRows.map((m) => m.id),
          ),
        )
    : [];
  const resultByMatch = new Map(resultRows.map((r) => [r.match_id, r]));

  // Player handles for label rendering.
  const allPlayerIds = Array.from(
    new Set(matchRows.flatMap((m) => [...m.team_a, ...m.team_b])),
  );
  const handleRows = allPlayerIds.length
    ? await db
        .select({ id: players.id, handle: players.handle })
        .from(players)
        .where(inArray(players.id, allPlayerIds))
    : [];
  const handleById = new Map(handleRows.map((p) => [p.id, p.handle]));
  const label = (ids: readonly string[]) =>
    `${handleById.get(ids[0]) ?? '?'} · ${handleById.get(ids[1]) ?? '?'}`;

  const rows: AdminMatchRow[] = matchRows.map((m) => {
    const mr = resultByMatch.get(m.id);
    const status: AdminMatchRow['status'] = mr
      ? (mr.status as AdminMatchRow['status'])
      : 'unscored';
    const adminIsParticipant =
      !!adminPlayer &&
      (m.team_a.includes(adminPlayer.id) || m.team_b.includes(adminPlayer.id));
    return {
      match_id: m.id,
      team_a_handles: label(m.team_a),
      team_b_handles: label(m.team_b),
      status,
      team_a_score: mr ? mr.team_a_score : null,
      team_b_score: mr ? mr.team_b_score : null,
      admin_is_participant: adminIsParticipant,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-6 pt-10 pb-24">
      <header className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        <Link
          href={`/t/${tournament.slug}`}
          className="hover:text-[var(--color-fg)]"
        >
          ← {tournament.name}
        </Link>
        <span>
          /c/{club.slug}/admin/tournaments/{id.slice(0, 8)}…/scores
        </span>
      </header>

      <div className="mt-12">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-pink)] mb-4 font-mono">
          Club admin · score override console
        </p>
        <h1 className="text-3xl md:text-4xl font-light leading-tight tracking-tight mb-3">
          {tournament.name} — match results
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)] font-mono">
          Hosted by {club.name} · {matchRows.length} match
          {matchRows.length === 1 ? '' : 'es'} ·{' '}
          {resultRows.filter((r) => r.status === 'pending').length} pending ·{' '}
          {resultRows.filter((r) => r.status === 'disputed').length} disputed
        </p>
      </div>

      <section className="mt-12">
        <AdminScoreTable rows={rows} />
        <p className="mt-8 text-xs text-[var(--color-fg-muted)] font-mono max-w-2xl leading-relaxed">
          Overriding rewrites the ledger and marks affected leaderboard snapshots
          stale (Sunday rebuild handles them). Voiding sets both the match and
          result to void and deletes ledger rows. You cannot override or void a
          match you played in.
        </p>
      </section>
    </div>
  );
}
