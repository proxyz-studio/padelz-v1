// src/app/me/points/page.tsx
import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';

import { getMyPointsHistory } from '@/features/profiles/actions';
import { PointsHistory } from '@/features/profiles/components/PointsHistory';
import { TierBadge } from '@/components/TierBadge';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My points · Padel-Z',
};

export default async function MyPointsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) notFound();

  const { entries, total, player_display_name, player_tier } = await getMyPointsHistory(clerkId, 50);

  if (!player_display_name) notFound();

  return (
    <div className="px-4 pb-8">
      <p>{player_display_name}</p>
      {player_tier ? <p style={{ marginTop: '0.5em' }}><TierBadge tier={player_tier} /></p> : null}
      <p className="mute" style={{ marginTop: '0.5em' }}>
        {total} total points · last 50 entries
      </p>
      <div className="rule" style={{ margin: '1.5em 0' }} />
      <PointsHistory entries={entries} />
    </div>
  );
}
