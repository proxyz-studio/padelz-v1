import { notFound } from 'next/navigation';
import { count, eq, and } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { club_memberships, clubs, tournaments } from '@/models/Schema';
import { ClubCard } from '@/features/profiles/components/ClubCard';

export const dynamic = 'force-dynamic';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  return { title: `${slug} · Padel-Z` };
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
  let dbError = false;

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
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="px-4 pb-8">
        <p className="m-0 max-w-[640px] mute">
          Database unavailable for <span className="font-bold">/c/{slug}</span>.
          Foundation Week deployed the schema and read path; production
          credentials land before the Phuket pilot.
        </p>
      </div>
    );
  }

  if (!row) notFound();

  return (
    <div className="px-4 pb-8">
      <p className="m-0 mute">Club · /c/{row.slug}</p>
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
