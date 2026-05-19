'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmScore, disputeScore } from '../actions';

type Props = {
  matchId: string;
  teamALabel: string;
  teamBLabel: string;
  teamAScore: number;
  teamBScore: number;
  sameTeamAsSubmitter: boolean;
  alreadyResolved: boolean;
};

type ActionState =
  | { kind: 'idle' }
  | { kind: 'confirmed' }
  | { kind: 'disputed' }
  | { kind: 'error'; code: string; message: string };

export function ConfirmScorePanel({
  matchId,
  teamALabel,
  teamBLabel,
  teamAScore,
  teamBScore,
  sameTeamAsSubmitter,
  alreadyResolved,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  const aWon = teamAScore > teamBScore;
  const bWon = teamBScore > teamAScore;

  const scoreLine = (
    <p className="m-0 max-w-[900px]">
      <span className="mute">{teamALabel}</span>{' '}
      <span className={aWon ? 'fn-green font-bold' : ''}>{teamAScore}</span>
      <span className="mute"> – </span>
      <span className={bWon ? 'fn-green font-bold' : ''}>{teamBScore}</span>{' '}
      <span className="mute">{teamBLabel}</span>
    </p>
  );

  if (alreadyResolved) {
    return (
      <div>
        {scoreLine}
        <p className="m-0 mt-8 mute">
          Result resolved · no action needed.
        </p>
      </div>
    );
  }

  if (state.kind === 'confirmed') {
    return (
      <div>
        {scoreLine}
        <p className="m-0 mt-8">
          <span className="fn-green font-bold">Confirmed</span>{' '}
          <span className="mute">· ledger updated · leaderboard moves on next snapshot</span>
        </p>
      </div>
    );
  }

  if (state.kind === 'disputed') {
    return (
      <div>
        {scoreLine}
        <p className="m-0 mt-8">
          <span className="fn-red font-bold">Disputed</span>{' '}
          <span className="mute">· club admin notified · they can override or void</span>
        </p>
      </div>
    );
  }

  const handleConfirm = () => {
    startTransition(async () => {
      const r = await confirmScore({ match_id: matchId });
      if (r.success) {
        setState({ kind: 'confirmed' });
        router.refresh();
      } else {
        setState({
          kind: 'error',
          code: r.error.code,
          message: r.error.message,
        });
      }
    });
  };

  const handleDispute = () => {
    startTransition(async () => {
      const r = await disputeScore({ match_id: matchId });
      if (r.success) {
        setState({ kind: 'disputed' });
        router.refresh();
      } else {
        setState({
          kind: 'error',
          code: r.error.code,
          message: r.error.message,
        });
      }
    });
  };

  return (
    <div>
      {scoreLine}

      <p className="m-0 mt-12">
        {sameTeamAsSubmitter ? (
          <span className="mute">Opposite team must confirm</span>
        ) : (
          <>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="btn-link fn-green font-bold"
              style={{ minHeight: 44 }}
            >
              {pending && state.kind === 'idle' ? 'Confirming…' : 'Confirm'}
            </button>{' '}
            <span className="fn-green font-bold">→</span>
          </>
        )}
        <span className="mute ml-8">·</span>{' '}
        <button
          type="button"
          onClick={handleDispute}
          disabled={pending}
          className="btn-link fn-red font-bold"
          style={{ minHeight: 44 }}
        >
          Dispute
        </button>
      </p>

      {state.kind === 'error' ? (
        <p className="m-0 mt-3">
          <span className="fn-red font-bold">{state.code}</span>
          <span className="mute">: {state.message}</span>
        </p>
      ) : null}
    </div>
  );
}
