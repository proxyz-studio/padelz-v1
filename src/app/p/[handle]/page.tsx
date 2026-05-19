import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { clubs, players } from '@/models/Schema';
import { PlayerProfileCard } from '@/features/profiles/components/PlayerProfileCard';

// Always render per-request — schema bake-in at build time would hit the DB,
// which fails on stub DATABASE_URL. Once Neon lands, drop to ISR (revalidate = 60).
export const dynamic = 'force-dynamic';

type Params = { handle: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { handle } = await params;
  return {
    title: `@${handle} · Padel-Z`,
  };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { handle } = await params;

  let row: typeof players.$inferSelect | undefined;
  let club: { name: string } | undefined;
  let dbError: string | null = null;

  try {
    const [p] = await db
      .select()
      .from(players)
      .where(eq(players.handle, handle))
      .limit(1);
    row = p;
    if (p?.home_club_id) {
      const [c] = await db
        .select({ name: clubs.name })
        .from(clubs)
        .where(eq(clubs.id, p.home_club_id))
        .limit(1);
      club = c;
    }
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  if (dbError) {
    return (
      <div className="mx-auto max-w-2xl px-6 pt-16 pb-24">
        <header className="border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
          § Profile · @{handle}
        </header>
        <div className="mt-16 border border-dashed border-[var(--color-rule)] px-6 md:px-10 py-16 text-center">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] mb-5 font-mono">
            Database unavailable
          </p>
          <h2 className="text-2xl font-light mb-4 tracking-tight">
            Profile temporarily offline
          </h2>
          <p className="text-sm text-[var(--color-fg-muted)] max-w-md mx-auto leading-relaxed">
            The production database isn&apos;t wired yet. Foundation Week
            deployed the schema and read path; production credentials land
            before the Phuket pilot.
          </p>
        </div>
      </div>
    );
  }

  if (!row) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pt-10 pb-24">
      <header className="flex items-center justify-between border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        <span>§ Player profile</span>
        <span>@{row.handle}</span>
      </header>
      <div className="mt-12">
        <PlayerProfileCard
          player={{
            id: row.id,
            handle: row.handle,
            display_name: row.display_name,
            tier: row.tier,
            photo_url: row.photo_url,
            verified: row.verified,
            redacted_at: row.redacted_at,
          }}
          bio={row.bio}
          homeClubName={club?.name ?? null}
          memberSince={row.created_at}
        />
      </div>
    </div>
  );
}
