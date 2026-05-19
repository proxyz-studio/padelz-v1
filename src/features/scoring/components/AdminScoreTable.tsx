'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adminOverrideMatch, adminVoidMatch } from '../actions';

export type AdminMatchRow = {
  match_id: string;
  team_a_handles: string;
  team_b_handles: string;
  status: 'unscored' | 'pending' | 'confirmed' | 'disputed' | 'admin_set' | 'void';
  team_a_score: number | null;
  team_b_score: number | null;
  admin_is_participant: boolean;
};

const STATUS_LABEL: Record<AdminMatchRow['status'], string> = {
  unscored: 'No score',
  pending: 'Pending',
  confirmed: 'Confirmed',
  disputed: 'Disputed',
  admin_set: 'Admin set',
  void: 'Void',
};

const STATUS_CLS: Record<AdminMatchRow['status'], string> = {
  unscored: 'mute',
  pending: 'mute',
  confirmed: 'fn-green font-bold',
  disputed: 'fn-red font-bold',
  admin_set: 'fn-blue font-bold',
  void: 'fn-red font-bold',
};

type Props = {
  rows: AdminMatchRow[];
};

export function AdminScoreTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="px-3 py-12 mute">
        No matches scheduled yet — generate the bracket first.
      </div>
    );
  }
  return (
    <table className="table">
      <colgroup>
        <col />
        <col style={{ width: '280px' }} />
        <col style={{ width: '160px' }} />
        <col style={{ width: '200px' }} />
        <col className="arrow" />
      </colgroup>
      <tbody>
        {rows.map((row) => (
          <AdminRow key={row.match_id} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function AdminRow({ row }: { row: AdminMatchRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<string>(
    row.team_a_score !== null ? String(row.team_a_score) : '',
  );
  const [b, setB] = useState<string>(
    row.team_b_score !== null ? String(row.team_b_score) : '',
  );
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );

  const handleSave = () => {
    setError(null);
    const ai = Number.parseInt(a, 10);
    const bi = Number.parseInt(b, 10);
    if (!Number.isFinite(ai) || !Number.isFinite(bi)) {
      setError({ code: 'INPUT', message: 'Enter both scores' });
      return;
    }
    startTransition(async () => {
      const r = await adminOverrideMatch({
        match_id: row.match_id,
        team_a_score: ai,
        team_b_score: bi,
      });
      if (r.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError({ code: r.error.code, message: r.error.message });
      }
    });
  };

  const handleVoid = () => {
    setError(null);
    startTransition(async () => {
      const r = await adminVoidMatch({ match_id: row.match_id });
      if (r.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError({ code: r.error.code, message: r.error.message });
      }
    });
  };

  const isVoided = row.status === 'void';
  const isLockedIn =
    row.status === 'confirmed' || row.status === 'admin_set';
  const aScore = row.team_a_score;
  const bScore = row.team_b_score;
  const aWon = aScore !== null && bScore !== null && aScore > bScore;
  const bWon = aScore !== null && bScore !== null && bScore > aScore;

  return (
    <>
      <tr>
        <td>
          <span className="font-bold">{row.team_a_handles}</span>{' '}
          <span className="mute">vs</span>{' '}
          <span className="font-bold">{row.team_b_handles}</span>
        </td>
        <td className="mute">
          <span className={STATUS_CLS[row.status]}>
            {STATUS_LABEL[row.status]}
          </span>
        </td>
        <td className="score no-underline">
          {aScore !== null && bScore !== null ? (
            <>
              <span className={aWon ? 'fn-green font-bold' : ''}>{aScore}</span>
              <span className="mute"> – </span>
              <span className={bWon ? 'fn-green font-bold' : ''}>{bScore}</span>
            </>
          ) : (
            <span className="mute">—</span>
          )}
        </td>
        <td>
          {row.admin_is_participant ? (
            <span
              className="fn-red font-bold"
              title="You are a participant in this match — another admin must override."
            >
              Conflict of interest
            </span>
          ) : isVoided ? (
            <span className="mute">Voided · locked</span>
          ) : isLockedIn ? (
            <span className="fn-green font-bold">Locked in</span>
          ) : row.status === 'unscored' ? (
            <button
              type="button"
              className="btn-link fn-blue font-bold"
              onClick={() => setOpen(!open)}
              disabled={pending}
            >
              {open ? 'Cancel' : 'Set score'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-link fn-blue font-bold"
              onClick={() => setOpen(!open)}
              disabled={pending}
            >
              {open ? 'Cancel' : 'Override'}
            </button>
          )}
        </td>
        <td className="arrow no-underline">
          {row.admin_is_participant || isVoided || isLockedIn ? (
            <span className="mute">—</span>
          ) : (
            <button
              type="button"
              className="btn-link fn-blue font-bold"
              onClick={() => setOpen(!open)}
              disabled={pending}
            >
              →
            </button>
          )}
        </td>
      </tr>
      {open && !row.admin_is_participant && !isVoided && !isLockedIn ? (
        <tr>
          <td colSpan={5} style={{ background: '#fafafa' }}>
            <div className="flex flex-wrap items-baseline gap-8">
              <label>
                <span className="mute">{row.team_a_handles}</span>{' '}
                <input
                  className="score-input fn-blue"
                  type="number"
                  min={0}
                  max={99}
                  value={a}
                  onChange={(e) => setA(e.target.value)}
                />
              </label>
              <label>
                <span className="mute">{row.team_b_handles}</span>{' '}
                <input
                  className="score-input fn-blue"
                  type="number"
                  min={0}
                  max={99}
                  value={b}
                  onChange={(e) => setB(e.target.value)}
                />
              </label>
              <span className="ml-auto">
                <button
                  type="button"
                  className="btn-link fn-blue font-bold"
                  onClick={handleSave}
                  disabled={pending}
                >
                  {pending ? 'Saving…' : 'Save override'}
                </button>{' '}
                <span className="fn-blue font-bold">→</span>
                <span className="mute ml-8">·</span>{' '}
                <button
                  type="button"
                  className="btn-link fn-red font-bold"
                  onClick={handleVoid}
                  disabled={pending}
                >
                  Void match
                </button>
              </span>
            </div>
            <p className="m-0 mt-3 mute">
              Rewriting points for this match — affected tier snapshots will be flagged stale.
            </p>
            {error ? (
              <p className="m-0 mt-3">
                <span className="fn-red font-bold">{error.code}</span>
                <span className="mute">: {error.message}</span>
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
