'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function MobileNavToggle({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLElement | null>(null);
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  // Escape closes, outside-click closes, focus first link on open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const overlay = overlayRef.current;
      const target = e.target as Node | null;
      if (!overlay || !target) return;
      // Ignore clicks inside the overlay itself. The toggle button is a
      // sibling — its own handler flips state, so we only need to close on
      // truly-outside clicks.
      if (overlay.contains(target)) return;
      // Also ignore the toggle button itself (it has its own handler).
      const btn = (e.target as HTMLElement | null)?.closest?.('[aria-controls="mobile-nav-overlay"]');
      if (btn) return;
      setOpen(false);
    };
    // Defer focus to next tick so the overlay is in the DOM
    const focusTimer = window.setTimeout(() => firstLinkRef.current?.focus(), 0);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-overlay"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="md:hidden"
        style={{
          minWidth: 44,
          minHeight: 44,
          padding: 0,
          background: 'transparent',
          border: 0,
          fontSize: 24,
          lineHeight: 1,
          color: 'var(--color-fg)',
          cursor: 'pointer',
        }}
      >
        {open ? '×' : '☰'}
      </button>
      {open ? (
        <nav
          ref={overlayRef as React.RefObject<HTMLElement>}
          id="mobile-nav-overlay"
          aria-label="Mobile primary"
          className="md:hidden"
          style={{
            position: 'fixed',
            top: 64,
            left: 0,
            right: 0,
            background: 'var(--color-bg)',
            borderBottom: `1px solid var(--color-rule)`,
            padding: '12px 16px 24px',
            zIndex: 50,
          }}
        >
          <Link
            href="/t"
            onClick={() => setOpen(false)}
            ref={firstLinkRef}
            className="no-underline"
            style={{ display: 'block', padding: '12px 0', minHeight: 44 }}
          >
            Tournaments
          </Link>
          <Link href="/leaderboard" onClick={() => setOpen(false)} className="no-underline" style={{ display: 'block', padding: '12px 0', minHeight: 44 }}>Leaderboard</Link>
          <div style={{ borderTop: `1px solid var(--color-rule)`, marginTop: 8, paddingTop: 8 }}>
            <Link href="/sign-in" onClick={() => setOpen(false)} className="no-underline" style={{ display: 'block', padding: '12px 0', minHeight: 44 }}>Sign in →</Link>
          </div>
          {children}
        </nav>
      ) : null}
    </>
  );
}
