import { db } from '@/libs/DB';
import { players } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

export async function generateUniqueHandle(): Promise<string> {
  for (let len = 8; len <= 14; len += 2) {
    const gen = customAlphabet(alphabet, len);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = gen();
      const existing = await db.select({ id: players.id }).from(players).where(eq(players.handle, candidate)).limit(1);
      if (existing.length === 0) return candidate;
    }
  }
  throw new Error('Failed to generate unique handle after 30 attempts');
}
