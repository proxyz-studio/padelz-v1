'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function MobileNavToggle({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
          <Link href="/t" onClick={() => setOpen(false)} className="no-underline" style={{ display: 'block', padding: '12px 0', minHeight: 44 }}>Tournaments</Link>
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
