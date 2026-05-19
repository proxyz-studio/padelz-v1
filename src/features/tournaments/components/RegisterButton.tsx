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
      <Link className="fn-green font-bold" href="/sign-in">
        Sign in to register <span className="mute">→</span>
      </Link>
    );
  }

  if (alreadyRegistered) {
    return (
      <span className="fn-green font-bold">
        Registered <span className="mute">· see you on court</span>
      </span>
    );
  }

  if (tournamentClosed) {
    return <span className="mute">Registration closed</span>;
  }

  if (!tierEligible) {
    return (
      <span
        className="fn-red font-bold"
        title={
          tierBandLabel ? `Tier band: ${tierBandLabel}` : 'Outside tier band'
        }
      >
        Outside tier band
      </span>
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
      <span className="fn-green font-bold">
        Registered <span className="mute">· see you on court</span>
      </span>
    );
  }

  return (
    <span>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="btn-link fn-green font-bold"
      >
        {pending ? 'Registering…' : 'Register for this tournament'}
      </button>{' '}
      <span className="mute">→</span>
      {result.kind === 'error' ? (
        <span className="fn-red font-bold ml-3">
          {result.code}: <span className="mute font-normal">{result.message}</span>
        </span>
      ) : null}
    </span>
  );
}
