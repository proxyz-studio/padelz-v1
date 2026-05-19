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
import { SubmitScoreForm } from '@/features/scoring/components/SubmitScoreForm';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return { title: `Submit score · ${id.slice(0, 8)} · Padel-Z` };
}

export default async function SubmitScorePage({
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
    redirect(`/sign-in?redirect_url=/match/${id}/submit`);
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

  const onTeamA = m.team_a.includes(me.id);
  const onTeamB = m.team_b.includes(me.id);
  if (!onTeamA && !onTeamB) notFound();

  const [existing] = await db
    .select({ status: match_results.status })
    .from(match_results)
    .where(eq(match_results.match_id, id))
    .limit(1);
  if (existing) redirect(`/match/${id}/confirm`);

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

  return (
    <div className="px-4 pb-8">
      <p className="m-0 mute">
        Submit · /match/{id.slice(0, 8)}…/submit
        {t ? (
          <>
            {' '}· <Link href={`/t/${t.slug}`}>← {t.name}</Link>
          </>
        ) : null}
      </p>

      <p className="m-0 mt-12 max-w-[800px]">
        <span className="font-bold">Final score</span>{' '}
        <span className="mute">
          · enter the result of this match · first submission wins
        </span>
      </p>

      <div className="mt-12">
        <SubmitScoreForm
          matchId={id}
          teamALabel={teamALabel}
          teamBLabel={teamBLabel}
        />
      </div>

      <p className="m-0 mt-20 max-w-[800px] mute">
        First submission wins. After you submit, the opposing team has
        48 hours to confirm or dispute — until then the leaderboard does
        not move.
      </p>
    </div>
  );
}
