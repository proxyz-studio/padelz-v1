const TIER_STYLES: Record<string, string> = {
  bronze: 'border-[var(--color-tier-bronze)] text-[var(--color-tier-bronze)]',
  silver: 'border-[var(--color-tier-silver)] text-[var(--color-tier-silver)]',
  gold: 'border-[var(--color-tier-gold)] text-[var(--color-tier-gold)]',
  platinum:
    'border-[var(--color-tier-platinum)] text-[var(--color-tier-platinum)] bg-[var(--color-tier-platinum)]/10',
};

export function TierBadge({ tier }: { tier: string }) {
  const cls =
    TIER_STYLES[tier] ?? 'border-[var(--color-fg-faint)] text-[var(--color-fg-muted)]';
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${cls}`}
    >
      {tier}
    </span>
  );
}
