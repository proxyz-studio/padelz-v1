'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { registerForTournament } from '../actions';

type Props = {
  tournamentId: string;
  signedIn: boolean;
  alreadyRegistered: boolean;
  tournamentClosed: boolean;
  tierEligible: boolean;
  tierBandLabel: string | null;
};

export function RegisterButton({
  tournamentId,
  signedIn,
  alreadyRegistered,
  tournamentClosed,
  tierEligible,
  tierBandLabel,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { kind: 'idle' }
    | { kind: 'success' }
    | { kind: 'error'; code: string; message: string }
  >({ kind: 'idle' });

  if (!signedIn) {
    return (
      <Link
        href="/sign-in"
        className="inline-flex items-center gap-2 border border-[var(--color-pink)] bg-[var(--color-pink)] text-[var(--color-bg)] px-5 py-3 text-xs uppercase tracking-[0.18em] font-mono hover:bg-transparent hover:text-[var(--color-pink)] transition-colors"
      >
        Sign in to register →
      </Link>
    );
  }

  if (alreadyRegistered) {
    return (
      <div className="inline-flex items-center gap-2 border border-[var(--color-tier-gold)] text-[var(--color-tier-gold)] px-5 py-3 text-xs uppercase tracking-[0.18em] font-mono">
        ● Registered
      </div>
    );
  }

  if (tournamentClosed) {
    return (
      <div className="inline-flex items-center gap-2 border border-[var(--color-fg-faint)] text-[var(--color-fg-faint)] px-5 py-3 text-xs uppercase tracking-[0.18em] font-mono cursor-not-allowed">
        Registration closed
      </div>
    );
  }

  if (!tierEligible) {
    return (
      <div
        className="inline-flex items-center gap-2 border border-[var(--color-fg-faint)] text-[var(--color-fg-muted)] px-5 py-3 text-xs uppercase tracking-[0.18em] font-mono cursor-not-allowed"
        title={
          tierBandLabel ? `Tier band: ${tierBandLabel}` : 'Outside tier band'
        }
      >
        Outside tier band
      </div>
    );
  }

  const handleClick = () => {
    setResult({ kind: 'idle' });
    startTransition(async () => {
      const r = await registerForTournament({ tournament_id: tournamentId });
      if (r.success) {
        setResult({ kind: 'success' });
      } else {
        setResult({
          kind: 'error',
          code: r.error.code,
          message: r.error.message,
        });
      }
    });
  };

  if (result.kind === 'success') {
    return (
      <div className="inline-flex items-center gap-2 border border-[var(--color-pink)] bg-[var(--color-pink)]/10 text-[var(--color-pink)] px-5 py-3 text-xs uppercase tracking-[0.18em] font-mono">
        ● Registered — see you on court
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 border border-[var(--color-pink)] bg-[var(--color-pink)] text-[var(--color-bg)] px-5 py-3 text-xs uppercase tracking-[0.18em] font-mono hover:bg-transparent hover:text-[var(--color-pink)] transition-colors disabled:opacity-50 disabled:cursor-wait"
      >
        {pending ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
            <span>Registering…</span>
          </>
        ) : (
          <>
            <span>Register for this tournament</span>
            <span aria-hidden>→</span>
          </>
        )}
      </button>
      {result.kind === 'error' ? (
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] font-mono">
          {result.code}: {result.message}
        </p>
      ) : null}
    </div>
  );
}
