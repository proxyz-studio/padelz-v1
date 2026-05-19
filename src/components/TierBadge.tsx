/**
 * Flat tier label. Color signals function (rare tier) only — bronze/silver/gold
 * stay neutral text since they're common. Platinum gets the brand pink, diamond
 * gets the data-entry blue.
 */
const TIER_COLOR: Record<string, string> = {
  platinum: 'pink font-bold',
  diamond: 'fn-blue font-bold',
};

export function TierBadge({ tier }: { tier: string }) {
  const cls = TIER_COLOR[tier] ?? '';
  return <span className={cls}>{tier}</span>;
}
