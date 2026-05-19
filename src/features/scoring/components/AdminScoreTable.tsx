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

type Props = {
  rows: AdminMatchRow[];
};

const STATUS_LABEL: Record<AdminMatchRow['status'], string> = {
  unscored: 'No score',
  pending: 'Pending',
  confirmed: 'Confirmed',
  disputed: 'Disputed',
  admin_set: 'Admin set',
  void: 'Void',
};

const STATUS_COLOR: Record<AdminMatchRow['status'], string> = {
  unscored: 'text-[var(--color-fg-muted)]',
  pending: 'text-[var(--color-pink)]',
  confirmed: 'text-[var(--color-tier-gold)]',
  disputed: 'text-[var(--color-pink)]',
  admin_set: 'text-[var(--color-fg)]',
  void: 'text-[var(--color-fg-faint)]',
};

export function AdminScoreTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-rule)] px-6 py-12 text-center">
        <p className="text-sm text-[var(--color-fg-muted)] leading-relaxed">
          No matches scheduled yet — generate the bracket first.
        </p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono border-b border-[var(--color-rule)]">
          <th className="py-3 pr-4 font-normal">Team A</th>
          <th className="py-3 pr-4 font-normal">Team B</th>
          <th className="py-3 pr-4 font-normal w-20">Score</th>
          <th className="py-3 pr-4 font-normal w-28">Status</th>
          <th className="py-3 pr-4 font-normal w-48">Actions</th>
        </tr>
      </thead>
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

  return (
    <>
      <tr className="border-b border-[var(--color-rule)] hover:bg-white/[0.02] transition-colors">
        <td className="py-3 pr-4 font-mono text-xs">{row.team_a_handles}</td>
        <td className="py-3 pr-4 font-mono text-xs">{row.team_b_handles}</td>
        <td className="py-3 pr-4 tabular-nums font-mono">
          {row.team_a_score !== null && row.team_b_score !== null
            ? `${row.team_a_score} – ${row.team_b_score}`
            : '—'}
        </td>
        <td className="py-3 pr-4">
          <span
            className={`text-[10px] uppercase tracking-[0.22em] font-mono ${STATUS_COLOR[row.status]}`}
          >
            ● {STATUS_LABEL[row.status]}
          </span>
        </td>
        <td className="py-3 pr-4">
          {row.admin_is_participant ? (
            <span
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono cursor-not-allowed"
              title="You are a participant in this match — another admin must override."
            >
              Conflict of interest
            </span>
          ) : isVoided ? (
            <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-faint)] font-mono">
              Voided · locked
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              disabled={pending}
              className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] font-mono hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
            >
              {open ? 'Cancel' : row.status === 'unscored' ? 'Set score' : 'Override'}
            </button>
          )}
        </td>
      </tr>
      {open && !row.admin_is_participant && !isVoided ? (
        <tr className="border-b border-[var(--color-rule)] bg-white/[0.02]">
          <td colSpan={5} className="py-4 px-4">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
                  {row.team_a_handles}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={a}
                  onChange={(e) => setA(e.target.value)}
                  className="bg-transparent border border-[var(--color-rule)] focus:border-[var(--color-pink)] outline-none px-3 py-2 text-xl font-light tabular-nums w-20"
                  placeholder="—"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)] font-mono">
                  {row.team_b_handles}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  value={b}
                  onChange={(e) => setB(e.target.value)}
                  className="bg-transparent border border-[var(--color-rule)] focus:border-[var(--color-pink)] outline-none px-3 py-2 text-xl font-light tabular-nums w-20"
                  placeholder="—"
                />
              </label>
              <div className="flex gap-2 md:ml-auto">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={pending}
                  className="border border-[var(--color-pink)] bg-[var(--color-pink)] text-[var(--color-bg)] px-4 py-2 text-[10px] uppercase tracking-[0.22em] font-mono hover:bg-transparent hover:text-[var(--color-pink)] transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  {pending ? 'Saving…' : 'Save override'}
                </button>
                <button
                  type="button"
                  onClick={handleVoid}
                  disabled={pending}
                  className="border border-[var(--color-rule)] text-[var(--color-fg)] px-4 py-2 text-[10px] uppercase tracking-[0.22em] font-mono hover:border-[var(--color-pink)] hover:text-[var(--color-pink)] transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  Void match
                </button>
              </div>
            </div>
            {error ? (
              <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--color-pink)] font-mono">
                {error.code}: {error.message}
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
