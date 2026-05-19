'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitScore } from '../actions';

type Props = {
  matchId: string;
  teamALabel: string;
  teamBLabel: string;
};

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitted'; team_a_score: number; team_b_score: number }
  | { kind: 'error'; code: string; message: string };

export function SubmitScoreForm({ matchId, teamALabel, teamBLabel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [optimistic, setOptimistic] = useOptimistic<
    SubmitState,
    { team_a_score: number; team_b_score: number }
  >(state, (_, next) => ({
    kind: 'submitted',
    team_a_score: next.team_a_score,
    team_b_score: next.team_b_score,
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ai = Number.parseInt(a, 10);
    const bi = Number.parseInt(b, 10);
    if (!Number.isFinite(ai) || !Number.isFinite(bi)) {
      setState({ kind: 'error', code: 'INPUT', message: 'Enter both scores' });
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
    const a = state.team_a_score;
    const b = state.team_b_score;
    const aWon = a > b;
    return (
      <div>
        <p className="m-0">
          <span className="fn-green font-bold">Submitted</span>{' '}
          <span className="mute">· pending opponent confirmation</span>
        </p>
        <p className="m-0 mt-12 max-w-[800px]">
          <span className="mute">{teamALabel}</span>{' '}
          <span className={aWon ? 'fn-green font-bold' : ''}>{a}</span>
          <span className="mute"> – </span>
          <span className={!aWon && b > a ? 'fn-green font-bold' : ''}>{b}</span>{' '}
          <span className="mute">{teamBLabel}</span>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="m-0 max-w-[900px]">
        <span className="mute">{teamALabel}</span>{' '}
        <input
          className="score-input fn-blue"
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={a}
          onChange={(e) => setA(e.target.value)}
          placeholder="—"
          autoFocus
        />
        <span className="mute"> – </span>
        <input
          className="score-input fn-blue"
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={b}
          onChange={(e) => setB(e.target.value)}
          placeholder="—"
        />{' '}
        <span className="mute">{teamBLabel}</span>
      </p>

      <p className="m-0 mt-12">
        <button
          type="submit"
          disabled={pending}
          className="btn-link fn-green font-bold"
        >
          {pending ? 'Submitting…' : 'Submit score'}
        </button>{' '}
        <span className="fn-green font-bold">→</span>
        <span className="mute ml-8">·</span>{' '}
        <button
          type="button"
          className="btn-link fn-red font-bold"
          onClick={() => {
            setA('');
            setB('');
            setState({ kind: 'idle' });
          }}
        >
          Cancel
        </button>
      </p>

      {optimistic.kind === 'submitted' && pending ? (
        <p className="m-0 mt-3 mute">
          ● Sending {optimistic.team_a_score} – {optimistic.team_b_score} for
          confirmation
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p className="m-0 mt-3">
          <span className="fn-red font-bold">{state.code}</span>
          <span className="mute">: {state.message}</span>
        </p>
      ) : null}
    </form>
  );
}
