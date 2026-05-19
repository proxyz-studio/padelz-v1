'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitScore } from '../actions';

type Props = {
  matchId: string;
  teamALabel: string;
  teamBLabel: string;
};

type OptimisticState =
  | { kind: 'idle' }
  | { kind: 'submitting'; team_a_score: number; team_b_score: number }
  | { kind: 'submitted'; team_a_score: number; team_b_score: number }
  | { kind: 'error'; code: string; message: string };

/**
 * Local-only optimistic UI per spec §4.7: the submitter sees their score
 * immediately while the server insert lands. Public leaderboards do not
 * change until the opposing team confirms.
 */
export function SubmitScoreForm({ matchId, teamALabel, teamBLabel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [state, setState] = useState<OptimisticState>({ kind: 'idle' });
  const [optimistic, setOptimistic] = useOptimistic<
    OptimisticState,
    { team_a_score: number; team_b_score: number }
  >(state, (_, next) => ({
    kind: 'submitting',
    team_a_score: next.team_a_score,
    team_b_score: next.team_b_score,
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ai = Number.parseInt(a, 10);
    const bi = Number.parseInt(b, 10);
    if (!Number.isFinite(ai) || !Number.isFinite(bi)) {
      setState({
        kind: 'error',
        code: 'INPUT',
        message: 'Enter both scores',
      });
      return;
    }
    startTransition(async () => {
      setOptimistic({ team_a_score: ai, team_b_score: bi });
      const r = await submitScore({
        match_id: matchId,
        team_a_score: ai,
        team_b_score: bi,
      });
      if (r.success) {
        setState({ kind: 'submitted', team_a_score: ai, team_b_score: bi });
        // Move them to the confirm screen so they see the waiting state.
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

  if (state.kind === 'submitted') {
    return (
      <div className="border border-[var(--color-pink)] bg-[var(--color-pink)]/5 px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] font-mono mb-3">
          Score pending opponent confirmation
        </p>
        <p className="text-3xl font-light tabular-nums tracking-tight">
          {state.team_a_score} <span className="text-[var(--color-fg-muted)] font-mono text-base">vs</span> {state.team_b_score}
        </p>
        <p className="mt-6 text-xs text-[var(--color-fg-muted)] font-mono">
          Notified the opposing team. They'll confirm or dispute from /match/{matchId.slice(0, 8)}…/confirm.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid grid-cols-2 gap-6">
        <ScoreField
          label={teamALabel}
          value={a}
          onChange={setA}
          autoFocus
        />
        <ScoreField label={teamBLabel} value={b} onChange={setB} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full md:w-auto inline-flex items-center justify-center gap-2 border border-[var(--color-pink)] bg-[var(--color-pink)] text-[var(--color-bg)] px-6 py-3 text-xs uppercase tracking-[0.18em] font-mono hover:bg-transparent hover:text-[var(--color-pink)] transition-colors disabled:opacity-50 disabled:cursor-wait"
      >
        {pending ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
            <span>Submitting…</span>
          </>
        ) : (
          <>
            <span>Submit score</span>
            <span aria-hidden>→</span>
          </>
        )}
      </button>

      {optimistic.kind === 'submitting' ? (
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
          ● Sending {optimistic.team_a_score} – {optimistic.team_b_score} for confirmation
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] font-mono">
          {state.code}: {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ScoreField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="bg-transparent border border-[var(--color-rule)] focus:border-[var(--color-pink)] outline-none px-4 py-4 text-3xl font-light tabular-nums tracking-tight transition-colors"
        placeholder="—"
      />
    </label>
  );
}
