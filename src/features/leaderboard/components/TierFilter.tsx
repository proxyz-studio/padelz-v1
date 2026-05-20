import Link from 'next/link';
import type { Tier } from '@/features/profiles/types';

type Props = {
  currentTier: Tier | null;
  basePath: string;
};

const TIERS: Array<{ value: Tier; label: string }> = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'diamond', label: 'Diamond' },
];

export function TierFilter({ currentTier, basePath }: Props) {
  return (
    <nav style={{ marginBottom: '1.5em' }}>
      <Link
        href={basePath}
        className={currentTier === null ? 'btn-link fn-blue font-bold' : 'btn-link'}
        style={{ marginRight: '1em' }}
      >
        All
      </Link>
      {TIERS.map((t) => (
        <Link
          key={t.value}
          href={`${basePath}?tier=${t.value}`}
          className={currentTier === t.value ? 'btn-link fn-blue font-bold' : 'btn-link'}
          style={{ marginRight: '1em' }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
