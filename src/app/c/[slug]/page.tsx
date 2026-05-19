import { notFound } from 'next/navigation';
import { count, eq, and } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  club_memberships,
  clubs,
  tournaments,
} from '@/models/Schema';
import { ClubCard } from '@/features/profiles/components/ClubCard';

// Always render per-request — see /p/[handle] page for rationale.
export const dynamic = 'force-dynamic';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return {
    title: `${slug} · Padel-Z`,
  };
}

export default async function ClubPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;

  let row: typeof clubs.$inferSelect | undefined;
  let memberCount: number | undefined;
  let activeTournamentCount: number | undefined;
  let dbError: string | null = null;

  try {
    const [c] = await db
      .select()
      .from(clubs)
      .where(eq(clubs.slug, slug))
      .limit(1);
    row = c;

    if (c) {
      const [m] = await db
        .select({ n: count() })
        .from(club_memberships)
        .where(eq(club_memberships.club_id, c.id));
      memberCount = m?.n ?? 0;

      const [t] = await db
        .select({ n: count() })
        .from(tournaments)
        .where(
          and(eq(tournaments.club_id, c.id), eq(tournaments.status, 'open')),
        );
      activeTournamentCount = t?.n ?? 0;
    }
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  if (dbError) {
    return (
      <div className="mx-auto max-w-2xl px-6 pt-16 pb-24">
        <header className="border-b border-[var(--color-rule)] pb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
          § Club · /c/{slug}
        </header>
        <div className="mt-16 border border-dashed border-[var(--color-rule)] px-6 md:px-10 py-16 text-center">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] mb-5 font-mono">
            Database unavailable
          </p>
          <h2 className="text-2xl font-light mb-4 tracking-tight">
            Club page temporarily offline
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
        <span>§ Club</span>
        <span>/c/{row.slug}</span>
      </header>
      <div className="mt-12">
        <ClubCard
          club={{
            id: row.id,
            slug: row.slug,
            name: row.name,
            city: row.city,
            description: row.description,
            court_count: row.court_count,
            photo_url: row.photo_url,
          }}
          memberCount={memberCount}
          activeTournamentCount={activeTournamentCount}
          founded={row.created_at}
        />
      </div>
    </div>
  );
}
