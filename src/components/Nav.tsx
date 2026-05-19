import Link from 'next/link';

export function Nav() {
  return (
    <header className="border-b border-[var(--color-rule)] bg-[var(--color-bg)]/85 backdrop-blur-sm sticky top-0">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">
            PADEL<span className="text-[var(--color-pink)]">-</span>Z
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] group-hover:text-[var(--color-pink)] transition-colors">
            v0.5
          </span>
        </Link>
        <nav className="flex items-center gap-6 md:gap-10 text-[11px] uppercase tracking-[0.2em]">
          <Link
            href="/leaderboard"
            className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
          >
            Leaderboard
          </Link>
          <span
            className="text-[var(--color-fg-faint)] cursor-not-allowed hidden sm:inline"
            title="Wires in milestone M2"
          >
            Tournaments
          </span>
          <Link
            href="/sign-in"
            className="text-[var(--color-pink)] hover:opacity-70 transition-opacity"
          >
            Sign in →
          </Link>
        </nav>
      </div>
    </header>
  );
}
