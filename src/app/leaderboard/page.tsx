import { db } from '@/libs/DB';
import { players } from '@/models/Schema';

export default async function LeaderboardPage() {
  const all = await db.select({ handle: players.handle, name: players.display_name, tier: players.tier }).from(players).limit(20);
  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-4">Leaderboard</h1>
      <ul className="space-y-2">
        {all.map((p) => (
          <li key={p.handle}><span className="font-mono">{p.handle}</span> — {p.name} ({p.tier})</li>
        ))}
      </ul>
    </main>
  );
}
