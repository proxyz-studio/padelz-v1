import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  match_results,
  matches,
  players,
  tournaments,
  users,
} from '@/models/Schema';
import { ConfirmScorePanel } from '@/features/scoring/components/ConfirmScorePanel';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return { title: `Confirm score · ${id.slice(0, 8)} · Padel-Z` };
}

export default async function ConfirmScorePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;

  let clerkUserId: string | null = null;
  try {
    const a = await auth();
    clerkUserId = a.userId;
  } catch {
    clerkUserId = null;
  }
  if (!clerkUserId) {
    redirect(`/sign-in?redirect_url=/match/${id}/confirm`);
  }

  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, id))
    .limit(1);
  if (!m) notFound();

  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerk_id, clerkUserId))
    .limit(1);
  if (!u) notFound();

  const [me] = await db
    .select()
    .from(players)
    .where(eq(players.user_id, u.id))
    .limit(1);
  if (!me) notFound();

  const meOnA = m.team_a.includes(me.id);
  const meOnB = m.team_b.includes(me.id);
  if (!meOnA && !meOnB) notFound();

  const [mr] = await db
    .select()
    .from(match_results)
    .where(eq(match_results.match_id, id))
    .limit(1);
  if (!mr) redirect(`/match/${id}/submit`);

  const [submitterPlayer] = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.user_id, mr.submitted_by))
    .limit(1);
  const submitterOnA = submitterPlayer
    ? m.team_a.includes(submitterPlayer.id)
    : false;
  const sameTeamAsSubmitter = submitterOnA === meOnA;

  const allPlayerIds = [...m.team_a, ...m.team_b];
  const playerRows = await db
    .select({ id: players.id, handle: players.handle })
    .from(players)
    .where(inArray(players.id, allPlayerIds));
  const byId = new Map(playerRows.map((p) => [p.id, p.handle]));
  const teamALabel = `${byId.get(m.team_a[0]) ?? '?'} · ${byId.get(m.team_a[1]) ?? '?'}`;
  const teamBLabel = `${byId.get(m.team_b[0]) ?? '?'} · ${byId.get(m.team_b[1]) ?? '?'}`;

  const [t] = await db
    .select({ slug: tournaments.slug, name: tournaments.name })
    .from(tournaments)
    .where(eq(tournaments.id, m.tournament_id))
    .limit(1);

  const alreadyResolved =
    mr.status === 'confirmed' || mr.status === 'admin_set' || mr.status === 'void';

  const statusCls =
    mr.status === 'pending'
      ? 'fn-blue font-bold'
      : mr.status === 'disputed'
        ? 'fn-red font-bold'
        : mr.status === 'void'
          ? 'fn-red font-bold'
          : mr.status === 'admin_set'
            ? 'fn-blue font-bold'
            : 'fn-green font-bold';

  return (
    <div className="px-4 pb-8">
      <p className="m-0 mute">
        Confirm · /match/{id.slice(0, 8)}…/confirm
        {t ? (
          <>
            {' '}· <Link href={`/t/${t.slug}`}>← {t.name}</Link>
          </>
        ) : null}
      </p>

      <p className="m-0 mt-12 max-w-[800px]">
        <span className="font-bold">
          {mr.status === 'pending'
            ? 'Pending score'
            : mr.status === 'disputed'
              ? 'Disputed result'
              : mr.status === 'void'
                ? 'Match voided'
                : 'Result resolved'}
        </span>{' '}
        <span className="mute">·</span>{' '}
        <span className={statusCls}>{mr.status.replace('_', ' ')}</span>
      </p>

      <div className="mt-12">
        <ConfirmScorePanel
          matchId={id}
          teamALabel={teamALabel}
          teamBLabel={teamBLabel}
          teamAScore={mr.team_a_score}
          teamBScore={mr.team_b_score}
          sameTeamAsSubmitter={sameTeamAsSubmitter}
          alreadyResolved={alreadyResolved}
        />
      </div>

      <p className="m-0 mt-20 max-w-[800px] mute">
        {sameTeamAsSubmitter
          ? 'Your teammate already submitted. Only the opposing team can confirm. You can still dispute if the score is wrong.'
          : 'Confirming writes points to the leaderboard. Disputing escalates to a club admin.'}
      </p>
    </div>
  );
}
