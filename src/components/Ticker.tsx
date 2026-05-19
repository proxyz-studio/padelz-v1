const items = [
  'M1 active',
  '13 tables migrated',
  '04 players seeded',
  '07 notification types',
  '22 tests green',
  'Pilot Q3 2026',
  'Phuket',
  'Built lean by PROXYZ Studio',
];

export function Ticker() {
  // Two copies for seamless loop
  const stream = [...items, ...items];
  return (
    <div className="ticker border-b border-[var(--color-rule)] bg-[var(--color-bg)] overflow-hidden">
      <div className="ticker-track flex w-max py-2 text-[10px] uppercase tracking-[0.3em] text-[var(--color-fg-muted)] font-mono">
        {stream.map((s, i) => (
          <span key={i} className="flex items-center px-6 whitespace-nowrap">
            <span className="text-[var(--color-pink)] mr-3">●</span>
            <span>{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
