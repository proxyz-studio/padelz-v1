'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 transition-all duration-300 ${
        scrolled
          ? 'border-b border-[var(--color-rule)] bg-[var(--color-bg)]/85 backdrop-blur-md'
          : 'border-b border-transparent bg-[var(--color-bg)]/50 backdrop-blur-sm'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="group flex items-baseline gap-2 font-mono">
          <span className="text-base font-semibold tracking-tight">
            PADEL<span className="text-[var(--color-pink)] inline-block transition-transform group-hover:scale-125">-</span>Z
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] group-hover:text-[var(--color-pink)] transition-colors">
            v0.5
          </span>
        </Link>
        <nav className="flex items-center gap-6 md:gap-10 text-[11px] uppercase tracking-[0.2em] font-mono">
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
            className="group inline-flex items-center gap-1 text-[var(--color-pink)] hover:opacity-80 transition-opacity"
          >
            <span>Sign in</span>
            <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
