export function Footer() {
  return (
    <footer className="border-t border-[var(--color-rule)] mt-32">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[var(--color-fg)]">PROXYZ STUDIO</span>
            <span className="text-[var(--color-fg-faint)]">·</span>
            <span>Padel-Z v0.5</span>
            <span className="text-[var(--color-fg-faint)]">·</span>
            <span>Phuket, TH</span>
            <span className="text-[var(--color-fg-faint)]">·</span>
            <span>2026</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/proxyz-studio/padelz-v1"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-fg)] transition-colors"
            >
              Source ↗
            </a>
            <a
              href="https://proxyz.studio"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-pink)] transition-colors"
            >
              proxyz.studio ↗
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
