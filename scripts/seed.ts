import { uuidv7 } from 'uuidv7';
import { db } from '@/libs/DB';
import {
  clubs,
  club_memberships,
  players,
  tournaments,
  users,
} from '@/models/Schema';

async function main() {
  console.log('Seeding…');

  const adminUserId = uuidv7();
  const playerUsers = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const clubId = uuidv7();

  await db.transaction(async (tx) => {
    await tx.insert(users).values([
      { id: adminUserId, clerk_id: 'seed_admin', email: 'admin@seed.local' },
      ...playerUsers.map((id, i) => ({
        id,
        clerk_id: `seed_player_${i}`,
        email: `p${i}@seed.local`,
      })),
    ]);

    await tx.insert(clubs).values({
      id: clubId,
      slug: 'destination-padel',
      name: 'Destination Padel',
      court_count: 4,
    });

    await tx.insert(club_memberships).values({
      user_id: adminUserId,
      club_id: clubId,
      role: 'admin',
    });

    const tiers = ['bronze', 'silver', 'gold', 'platinum'] as const;
    await tx.insert(players).values(
      playerUsers.map((user_id, i) => ({
        user_id,
        handle: `seed-player-${i}`,
        display_name: `Seed Player ${i}`,
        tier: tiers[i],
        home_club_id: clubId,
      })),
    );

    await tx.insert(tournaments).values({
      slug: 'saturday-open-week-1',
      club_id: clubId,
      name: 'Saturday Open',
      format: 'americano',
      tournament_type: 'club_internal',
      start_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      status: 'open',
      created_by: adminUserId,
    });
  });

  console.log('Seed complete: 1 club, 4 players, 1 tournament');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
