const TIER_STYLES: Record<string, string> = {
  bronze:
    'border-[var(--color-tier-bronze)] text-[var(--color-tier-bronze)] hover:bg-[var(--color-tier-bronze)]/10',
  silver:
    'border-[var(--color-tier-silver)] text-[var(--color-tier-silver)] hover:bg-[var(--color-tier-silver)]/10',
  gold: 'border-[var(--color-tier-gold)] text-[var(--color-tier-gold)] hover:bg-[var(--color-tier-gold)]/10',
  platinum:
    'border-[var(--color-tier-platinum)] text-[var(--color-tier-platinum)] bg-[var(--color-tier-platinum)]/10 shimmer-platinum',
};

export function TierBadge({ tier }: { tier: string }) {
  const cls =
    TIER_STYLES[tier] ?? 'border-[var(--color-fg-faint)] text-[var(--color-fg-muted)]';
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.22em] transition-all duration-200 ${cls}`}
    >
      {tier}
    </span>
  );
}
