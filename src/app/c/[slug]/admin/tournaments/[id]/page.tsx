// src/app/c/[slug]/admin/tournaments/[id]/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/libs/DB';
import {
  clubs,
  matches,
  players,
  registrations,
  tournaments,
  users,
} from '@/models/Schema';
import { assertClubAdmin } from '@/libs/Authz';
import {
  publishTournament,
  deleteTournament,
} from '@/features/tournaments/actions';

export const dynamic = 'force-dynamic';

const FORMAT_LABEL: Record<string, string> = {
  americano: 'Americano',
  mexicano: 'Mexicano',
  round_robin: 'Round robin',
  bracket: 'Bracket',
};

const TYPE_LABEL: Record<string, string> = {
  open: 'Open',
  club_internal: 'Club internal',
  group: 'Group',
  casual: 'Casual',
};

type SearchParams = Promise<{ error?: string }>;

export default async function AdminTournamentDetailPage({
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

  const regs = await db
    .select({ player_id: registrations.player_id, handle: players.handle, display_name: players.display_name, tier: players.tier })
    .from(registrations)
    .innerJoin(players, eq(players.id, registrations.player_id))
    .where(and(eq(registrations.tournament_id, t.id), eq(registrations.status, 'registered')));

  const [{ value: matchCount }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.tournament_id, t.id));

  async function publishAction() {
    'use server';
    const r = await publishTournament({ tournament_id: t.id });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/${t.id}?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}/admin/tournaments/${t.id}`);
  }

  async function deleteAction() {
    'use server';
    const r = await deleteTournament({ tournament_id: t.id });
    if (!r.success) {
      redirect(`/c/${slug}/admin/tournaments/${t.id}?error=${encodeURIComponent(r.error.message)}`);
    }
    redirect(`/c/${slug}`);
  }

  return (
    <div className="px-4 pb-8">
      <p>
        <a href={`/c/${slug}`} className="mute">← {club.name}</a>
      </p>
      <p style={{ marginTop: '0.5em' }}>{t.name}</p>
      <p className="mute">
        {FORMAT_LABEL[t.format]} · {TYPE_LABEL[t.tournament_type]} · status: <span className={t.status === 'in_progress' ? 'fn-blue font-bold' : t.status === 'open' ? 'fn-green font-bold' : ''}>{t.status}</span>
      </p>

      {error ? <p className="fn-red font-bold" style={{ marginTop: '1em' }}>{error}</p> : null}

      {/* Action buttons */}
      <div style={{ marginTop: '2em' }}>
        {t.status === 'draft' && (
          <>
            <form action={publishAction} style={{ display: 'inline-block', marginRight: '1.5em' }}>
              <button type="submit" className="btn-link fn-green font-bold">Publish (open for registration) →</button>
            </form>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/edit`} className="btn-link" style={{ marginRight: '1.5em' }}>Edit →</a>
            <form action={deleteAction} style={{ display: 'inline-block' }}>
              <button type="submit" className="btn-link fn-red font-bold">Delete</button>
            </form>
          </>
        )}
        {t.status === 'open' && regs.length >= 2 && matchCount === 0 && (
          <>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/bracket/preview`} className="btn-link fn-blue font-bold" style={{ marginRight: '1.5em' }}>Generate bracket →</a>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/edit`} className="btn-link" style={{ marginRight: '1.5em' }}>Edit →</a>
            <form action={deleteAction} style={{ display: 'inline-block' }}>
              <button type="submit" className="btn-link fn-red font-bold">Delete</button>
            </form>
          </>
        )}
        {t.status === 'open' && regs.length < 2 && matchCount === 0 && (
          <>
            <p className="mute">Need at least 2 registered players to generate bracket</p>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/edit`} className="btn-link" style={{ marginRight: '1.5em', marginTop: '0.5em', display: 'inline-block' }}>Edit →</a>
            <form action={deleteAction} style={{ display: 'inline-block' }}>
              <button type="submit" className="btn-link fn-red font-bold">Delete</button>
            </form>
          </>
        )}
        {t.status === 'in_progress' && (
          <>
            <a href={`/t/${t.slug}`} className="btn-link" style={{ marginRight: '1.5em' }}>View bracket →</a>
            <a href={`/c/${slug}/admin/tournaments/${t.id}/scores`} className="btn-link fn-blue font-bold">Manage scores →</a>
          </>
        )}
        {t.status === 'complete' && (
          <p className="mute">Tournament complete</p>
        )}
        {/* Defensive fallback: an open tournament with matches recorded is architecturally impossible
            (generateBracket transitions status atomically) but if data drifts, surface a hint. */}
        {t.status === 'open' && matchCount > 0 && (
          <p className="mute">State inconsistency: tournament is open but matches exist. Contact support.</p>
        )}
      </div>

      <div className="rule" style={{ margin: '2em 0' }} />

      <p className="mute">{regs.length} registered player{regs.length === 1 ? '' : 's'}</p>
      {regs.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '1em' }}>
          {regs.map((r) => (
            <li key={r.player_id} className="rule-bottom" style={{ padding: '0.75em 0' }}>
              <a href={`/p/${r.handle}`}>{r.display_name}</a>{' '}
              <span className="mute">· {r.tier}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mute" style={{ marginTop: '1em' }}>No players registered yet.</p>
      )}
    </div>
  );
}
