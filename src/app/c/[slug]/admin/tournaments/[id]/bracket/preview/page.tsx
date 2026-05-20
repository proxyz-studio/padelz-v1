// src/app/c/[slug]/admin/tournaments/[id]/bracket/preview/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { db } from '@/libs/DB';
import {
  brackets,
  clubs,
  players,
  registrations,
  tournaments,
  users,
} from '@/models/Schema';
import { assertClubAdmin } from '@/libs/Authz';
import { generateBracket } from '@/features/tournaments/actions';
import { generateBracketData } from '@/features/tournaments/bracket';
import type { BracketData } from '@/features/tournaments/bracket';
import { BracketView } from '@/features/tournaments/components/BracketView';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ error?: string }>;

export default async function BracketPreviewPage({
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
  if (t.status !== 'open') notFound();

  // Bracket already exists: bounce back to the admin detail page
  const [existingBracket] = await db.select({ id: brackets.id }).from(brackets).where(eq(brackets.tournament_id, t.id)).limit(1);
  if (existingBracket) {
    redirect(`/c/${slug}/admin/tournaments/${t.id}`);
  }

  // Registered players
  const regs = await db
    .select({ player_id: registrations.player_id, handle: players.handle, display_name: players.display_name })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.player_id))
    .where(and(eq(registrations.tournament_id, t.id), eq(registrations.status, 'registered')));

  if (regs.length < 2) notFound();

  // Read-only bracket generation. Deterministic per bracket.ts (no randomness).
  let previewData: BracketData | undefined;
  try {
    previewData = generateBracketData(regs.map((r) => r.player_id), t.format);
  } catch (e) {
    redirect(`/c/${slug}/admin/tournaments/${t.id}?error=${encodeURIComponent(e instanceof Error ? e.message : 'Bracket generation failed')}`);
  }

  const playerMap = new Map(regs.map((r) => [r.player_id, { handle: r.handle, display_name: r.display_name }]));

  async function confirmAction() {
    'use server';
    // generateBracket falls back to auth().userId when called without an explicit clerkId.
    // Since this server action runs in a request context with the signed-in admin's session,
    // the fallback resolves correctly. No need to pass clerkId.
    const r = await generateBracket({ tournament_id: t.id });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/${t.id}/bracket/preview?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}/admin/tournaments/${t.id}`);
  }

  return (
    <div className="px-4 pb-8">
      <p>
        <a href={`/c/${slug}/admin/tournaments/${t.id}`} className="mute">← {t.name}</a>
      </p>
      <p style={{ marginTop: '0.5em' }}>Preview bracket</p>
      <p className="mute">
        This is what {regs.length} registered players will see. Bracket generation is deterministic. Confirm to commit.
      </p>

      {error ? <p className="fn-red font-bold" style={{ marginTop: '1em' }}>{error}</p> : null}

      <div className="rule" style={{ margin: '1.5em 0' }} />

      <BracketView
        bracket={previewData!}
        matches={new Map()}
        players={playerMap}
        currentUserPlayerId={null}
      />

      <div style={{ marginTop: '2em' }}>
        <a href={`/c/${slug}/admin/tournaments/${t.id}`} className="btn-link" style={{ marginRight: '1.5em' }}>← Cancel</a>
        <form action={confirmAction} style={{ display: 'inline-block' }}>
          <button type="submit" className="btn-link fn-green font-bold">Confirm and lock tournament →</button>
        </form>
      </div>
    </div>
  );
}
