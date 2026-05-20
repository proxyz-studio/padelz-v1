// src/app/c/[slug]/admin/tournaments/new/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/libs/DB';
import { clubs, users } from '@/models/Schema';
import { assertClubAdmin } from '@/libs/Authz';
import { createTournament } from '@/features/tournaments/actions';
import { TournamentForm } from '@/features/tournaments/components/TournamentForm';

// All admin pages must be request-dynamic — auth() reads cookies + headers
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string }>;

export default async function NewTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const { userId: clerkId } = await auth();
  if (!clerkId) notFound();

  const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
  if (!u) notFound();

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) notFound();

  try {
    await assertClubAdmin(u.id, club.id);
  } catch {
    notFound();
  }

  async function action(formData: FormData) {
    'use server';
    const r = await createTournament({
      club_id: club.id,
      name: String(formData.get('name')),
      format: String(formData.get('format')) as 'americano' | 'mexicano' | 'round_robin' | 'bracket',
      tournament_type: String(formData.get('tournament_type')) as 'open' | 'club_internal' | 'group' | 'casual',
      start_at: new Date(String(formData.get('start_at'))).toISOString(),
      tier_min: (String(formData.get('tier_min') ?? '') || null) as 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | null,
      tier_max: (String(formData.get('tier_max') ?? '') || null) as 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | null,
    });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/new?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}/admin/tournaments/${r.data.tournament_id}`);
  }

  return (
    <div className="px-4 pb-8">
      <p>
        <a href={`/c/${slug}`} className="mute">← {club.name}</a>
      </p>
      <p style={{ marginTop: '0.5em' }}>New tournament</p>
      <p className="mute">Lands as draft. Publish from the next screen.</p>
      <hr className="rule" style={{ margin: '1.5em 0' }} />
      <TournamentForm mode="create" action={action} clubId={club.id} error={error} />
    </div>
  );
}
