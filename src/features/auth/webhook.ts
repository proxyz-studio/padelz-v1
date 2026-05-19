import { db } from '@/libs/DB';
import { users, players, club_memberships } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { generateUniqueHandle } from '@/features/profiles/handle';
import type { WebhookEvent } from '@clerk/nextjs/server';

export async function handleClerkEvent(event: WebhookEvent) {
  switch (event.type) {
    case 'user.created': {
      const clerkId = event.data.id!;
      const email = event.data.email_addresses?.[0]?.email_address ?? '';
      await db.transaction(async (tx) => {
        const [u] = await tx.insert(users).values({ clerk_id: clerkId, email }).returning();
        const handle = await generateUniqueHandle();
        await tx.insert(players).values({
          user_id: u.id,
          handle,
          display_name: email.split('@')[0] || handle,
          tier: 'bronze',
        });
      });
      break;
    }
    case 'user.updated': {
      const clerkId = event.data.id!;
      const email = event.data.email_addresses?.[0]?.email_address;
      if (email) await db.update(users).set({ email }).where(eq(users.clerk_id, clerkId));
      break;
    }
    case 'user.deleted': {
      const clerkId = event.data.id!;
      const [u] = await db.select().from(users).where(eq(users.clerk_id, clerkId)).limit(1);
      if (!u) return;
      await db.transaction(async (tx) => {
        await tx.update(players).set({
          display_name: '[deleted]',
          photo_url: null,
          bio: null,
          redacted_at: new Date(),
        }).where(eq(players.user_id, u.id));
        await tx.delete(club_memberships).where(eq(club_memberships.user_id, u.id));
      });
      break;
    }
  }
}
