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

  // Auth — unauthed user redirects to sign-in, returning here after.
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

  // Participation gate — non-participants get 404 to avoid leaking match
  // existence (spec §4.7 step 2).
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

  // If a result already exists, route to /confirm instead.
  const [existing] = await db
    .select({ status: match_results.status })
    .from(match_results)
    .where(eq(match_results.match_id, id))
    .limit(1);
  if (existing) {
    redirect(`/match/${id}/confirm`);
  }

  // Build human labels for each team from player handles.
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
    <div className="mx-auto max-w-3xl px-6 pt-10 pb-24">
      <header className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        {t ? (
          <Link href={`/t/${t.slug}`} className="hover:text-[var(--color-fg)]">
            ← {t.name}
          </Link>
        ) : (
          <span>Padel-Z</span>
        )}
        <span>/match/{id.slice(0, 8)}…/submit</span>
      </header>

      <div className="mt-16">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--color-pink)] mb-4 font-mono">
          Score submission · pending opponent confirmation
        </p>
        <h1 className="text-4xl md:text-5xl font-light leading-tight tracking-tight mb-12">
          Submit final score
        </h1>

        <SubmitScoreForm
          matchId={id}
          teamALabel={teamALabel}
          teamBLabel={teamBLabel}
        />

        <p className="mt-12 text-xs text-[var(--color-fg-muted)] font-mono max-w-md">
          First submission wins. After you submit, the opposing team has
          48 hours to confirm or dispute — until then the leaderboard does
          not move.
        </p>
      </div>
    </div>
  );
}
