// src/app/c/[slug]/admin/tournaments/[id]/edit/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/libs/DB';
import { clubs, matches, tournaments, users } from '@/models/Schema';
import { assertClubAdmin } from '@/libs/Authz';
import { updateTournament } from '@/features/tournaments/actions';
import { TournamentForm } from '@/features/tournaments/components/TournamentForm';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string }>;

export default async function EditTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: SearchParams;
}) {
  const { slug, id } = await params;
  const { error } = await searchParams;

  const { userId: clerkId } = await auth();
  if (!clerkId) notFound();
  const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
  if (!u) notFound();
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) notFound();
  try { await assertClubAdmin(u.id, club.id); } catch { notFound(); }

  const [t] = await db.select().from(tournaments).where(and(eq(tournaments.id, id), eq(tournaments.club_id, club.id))).limit(1);
  if (!t) notFound();

  // Edit allowed only for draft|open with no matches
  if (t.status !== 'draft' && t.status !== 'open') notFound();
  const [{ value: matchCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.tournament_id, t.id));
  if (matchCount > 0) notFound();

  async function action(formData: FormData) {
    'use server';
    const r = await updateTournament({
      tournament_id: t.id,
      name: String(formData.get('name')),
      format: String(formData.get('format')) as 'americano' | 'mexicano' | 'round_robin' | 'bracket',
      tournament_type: String(formData.get('tournament_type')) as 'open' | 'club_internal' | 'group' | 'casual',
      start_at: (() => {
        const v = formData.get('start_at');
        if (!v || typeof v !== 'string') return '';
        const d = new Date(v);
        return isNaN(d.getTime()) ? '' : d.toISOString();
      })(),
      tier_min: (String(formData.get('tier_min') ?? '') || null) as never,
      tier_max: (String(formData.get('tier_max') ?? '') || null) as never,
    });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/${t.id}/edit?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}/admin/tournaments/${t.id}`);
  }

  return (
    <div className="px-4 pb-8">
      <p>
        <a href={`/c/${slug}/admin/tournaments/${t.id}`} className="mute">← {t.name}</a>
      </p>
      <p style={{ marginTop: '0.5em' }}>Edit tournament</p>
      <div className="rule" style={{ margin: '1.5em 0' }} />
      <TournamentForm
        mode="edit"
        action={action}
        tournamentId={t.id}
        error={error}
        initial={{
          name: t.name,
          format: t.format as 'americano' | 'mexicano' | 'round_robin' | 'bracket',
          tournament_type: t.tournament_type as 'open' | 'club_internal' | 'group' | 'casual',
          start_at: t.start_at.toISOString(),
          tier_min: t.tier_min as never,
          tier_max: t.tier_max as never,
        }}
      />
    </div>
  );
}
