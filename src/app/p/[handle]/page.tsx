import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { clubs, players } from '@/models/Schema';
import { PlayerProfileCard } from '@/features/profiles/components/PlayerProfileCard';

export const dynamic = 'force-dynamic';

type Params = { handle: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { handle } = await params;
  return { title: `@${handle} · Padel-Z` };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { handle } = await params;

  let row: typeof players.$inferSelect | undefined;
  let club: { name: string } | undefined;
  let dbError = false;

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
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="px-4 pb-8">
        <p className="m-0 max-w-[640px] mute">
          Database unavailable for <span className="font-bold">@{handle}</span>.
          Foundation Week deployed the schema and read path; production
          credentials land before the Phuket pilot.
        </p>
      </div>
    );
  }

  if (!row) notFound();

  return (
    <div className="px-4 pb-8">
      <p className="m-0 mute">Player · @{row.handle}</p>
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
