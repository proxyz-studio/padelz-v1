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

  try {
    await assertClubAdmin(u.id, club.id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }

  const [adminPlayer] = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.user_id, u.id))
    .limit(1);

  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.tournament_id, tournament.id));

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

  const pendingCount = resultRows.filter((r) => r.status === 'pending').length;
  const disputedCount = resultRows.filter((r) => r.status === 'disputed').length;

  return (
    <div className="px-4 pb-8">
      <p className="m-0 mute">
        Admin · /c/{club.slug}/admin/tournaments/{id.slice(0, 8)}…/scores ·{' '}
        <Link href={`/t/${tournament.slug}`}>← {tournament.name}</Link>
      </p>

      <p className="m-0 mt-12 max-w-[800px]">
        <span className="font-bold">{tournament.name}</span>{' '}
        <span className="mute">match results · hosted by {club.name}</span>
      </p>
      <p className="m-0 mt-2 max-w-[800px] mute">
        {String(matchRows.length).padStart(2, '0')} match
        {matchRows.length === 1 ? '' : 'es'}{' '}
        {pendingCount > 0 ? (
          <>
            · <span className="font-bold">{String(pendingCount).padStart(2, '0')}</span>{' '}
            pending
          </>
        ) : null}
        {disputedCount > 0 ? (
          <>
            · <span className="fn-red font-bold">{String(disputedCount).padStart(2, '0')}</span>{' '}
            disputed
          </>
        ) : null}
      </p>

      <div className="rule mt-20">
        <div className="grid grid-cols-[1fr_280px_160px_200px_56px] gap-6 mute pt-6 pb-3">
          <span>Match</span>
          <span>Status</span>
          <span>Score</span>
          <span>Action</span>
          <span></span>
        </div>
      </div>

      <AdminScoreTable rows={rows} />

      <p className="m-0 mt-12 max-w-[800px] mute">
        Overriding rewrites the ledger and marks affected tier snapshots
        stale — Sunday's cron rebuilds them. Voiding sets both the match
        and result to <span className="fn-red font-bold">void</span> and
        deletes the ledger rows. You cannot override or void a match you
        played in.
      </p>
    </div>
  );
}
