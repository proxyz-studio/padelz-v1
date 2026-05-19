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
  /** True when the calling user is on the same team as the submitter — confirm
   * button is hidden, dispute is the only path. */
  sameTeamAsSubmitter: boolean;
  /** True when status is already confirmed / admin_set / void. */
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6 border border-[var(--color-rule)] px-6 py-8">
        <Score label={teamALabel} value={teamAScore} />
        <Score label={teamBLabel} value={teamBScore} />
      </div>

      {alreadyResolved ? (
        <div className="border border-dashed border-[var(--color-rule)] px-6 py-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
            Result resolved · no action needed
          </p>
        </div>
      ) : state.kind === 'confirmed' ? (
        <div className="border border-[var(--color-pink)] bg-[var(--color-pink)]/5 px-6 py-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] font-mono">
            ● Score confirmed · ledger updated
          </p>
        </div>
      ) : state.kind === 'disputed' ? (
        <div className="border border-[var(--color-pink)]/40 px-6 py-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] font-mono">
            ● Disputed · club admin notified
          </p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-3">
          {!sameTeamAsSubmitter ? (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-[var(--color-pink)] bg-[var(--color-pink)] text-[var(--color-bg)] px-6 py-3 text-xs uppercase tracking-[0.18em] font-mono hover:bg-transparent hover:text-[var(--color-pink)] transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {pending ? (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
                  <span>Confirming…</span>
                </>
              ) : (
                <span>Confirm result</span>
              )}
            </button>
          ) : (
            <div className="flex-1 inline-flex items-center justify-center border border-[var(--color-fg-faint)] text-[var(--color-fg-muted)] px-6 py-3 text-xs uppercase tracking-[0.22em] font-mono cursor-not-allowed">
              Opposite team must confirm
            </div>
          )}
          <button
            type="button"
            onClick={handleDispute}
            disabled={pending}
            className="flex-1 inline-flex items-center justify-center border border-[var(--color-rule)] text-[var(--color-fg)] px-6 py-3 text-xs uppercase tracking-[0.18em] font-mono hover:border-[var(--color-pink)] hover:text-[var(--color-pink)] transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            Dispute
          </button>
        </div>
      )}

      {state.kind === 'error' ? (
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] font-mono">
          {state.code}: {state.message}
        </p>
      ) : null}
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        {label}
      </span>
      <span className="text-5xl font-light tabular-nums tracking-tight">
        {value}
      </span>
    </div>
  );
}
