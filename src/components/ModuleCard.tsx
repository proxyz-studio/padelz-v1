export function ModuleCard({
  index,
  title,
  status,
  lines,
  delay = 0,
}: {
  index: string;
  title: string;
  status: 'active' | 'queued';
  lines: string[];
  delay?: number;
}) {
  const isActive = status === 'active';

  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`anim-fade-up group relative bg-[var(--color-bg)] p-6 flex flex-col gap-4 min-h-[180px] transition-all duration-300 ease-out hover:-translate-y-1 ${
        isActive
          ? 'ring-1 ring-inset ring-[var(--color-pink)]/30 hover:ring-[var(--color-pink)]/60'
          : 'hover:ring-1 hover:ring-inset hover:ring-[var(--color-pink)]/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
          {index}
        </span>
        <span
          className={`text-[10px] uppercase tracking-[0.22em] font-mono inline-flex items-center gap-1.5 ${
            isActive ? 'text-[var(--color-pink)]' : 'text-[var(--color-fg-faint)]'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isActive
                ? 'bg-[var(--color-pink)] pulse-dot'
                : 'bg-[var(--color-fg-faint)]'
            }`}
            aria-hidden
          />
          {isActive ? 'Active' : 'Queued'}
        </span>
      </div>
      <h3 className="text-xl font-light tracking-tight">{title}</h3>
      <ul className="space-y-1 text-xs text-[var(--color-fg-muted)] leading-relaxed font-mono">
        {lines.map((l) => (
          <li key={l}>· {l}</li>
        ))}
      </ul>
    </div>
  );
}
