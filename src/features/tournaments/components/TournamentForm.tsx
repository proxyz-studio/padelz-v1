// src/features/tournaments/components/TournamentForm.tsx
import { TIERS, type Tier } from '@/features/profiles/types';

type Mode = 'create' | 'edit';

type Props = {
  mode: Mode;
  action: (formData: FormData) => Promise<void> | void;
  initial?: {
    name: string;
    format: 'americano' | 'mexicano' | 'round_robin' | 'bracket';
    tournament_type: 'open' | 'club_internal' | 'group' | 'casual';
    start_at: string; // ISO; render as datetime-local
    tier_min: Tier | null;
    tier_max: Tier | null;
  };
  clubId?: string; // required when mode='create'
  tournamentId?: string; // required when mode='edit'
  error?: string;
};

function isoToLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TournamentForm({ mode, action, initial, clubId, tournamentId, error }: Props) {
  return (
    <form action={action}>
      {clubId ? <input type="hidden" name="club_id" value={clubId} /> : null}
      {tournamentId ? <input type="hidden" name="tournament_id" value={tournamentId} /> : null}

      {error ? <p className="fn-red font-bold" style={{ marginBottom: '1em' }}>{error}</p> : null}

      <p className="mute">Name</p>
      <input
        className="form-input"
        type="text"
        name="name"
        defaultValue={initial?.name ?? ''}
        required
        minLength={3}
        maxLength={120}
      />

      <p className="mute" style={{ marginTop: '1em' }}>Format</p>
      <select className="form-input" name="format" defaultValue={initial?.format ?? 'round_robin'} required>
        <option value="round_robin">round robin</option>
        <option value="americano">americano</option>
        <option value="mexicano">mexicano</option>
        <option value="bracket">bracket</option>
      </select>

      <p className="mute" style={{ marginTop: '1em' }}>Type</p>
      <select className="form-input" name="tournament_type" defaultValue={initial?.tournament_type ?? 'open'} required>
        <option value="open">open</option>
        <option value="club_internal">club internal</option>
        <option value="group">group</option>
        <option value="casual">casual</option>
      </select>

      <p className="mute" style={{ marginTop: '1em' }}>Start</p>
      <input
        className="form-input"
        type="datetime-local"
        name="start_at"
        defaultValue={initial ? isoToLocal(initial.start_at) : ''}
        required
      />

      <p className="mute" style={{ marginTop: '1em' }}>Tier min (optional)</p>
      <select className="form-input" name="tier_min" defaultValue={initial?.tier_min ?? ''}>
        <option value="">any</option>
        {TIERS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <p className="mute" style={{ marginTop: '1em' }}>Tier max (optional)</p>
      <select className="form-input" name="tier_max" defaultValue={initial?.tier_max ?? ''}>
        <option value="">any</option>
        {TIERS.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <div style={{ marginTop: '2em' }}>
        <button type="submit" className="btn-link fn-green font-bold">
          {mode === 'create' ? 'Create →' : 'Save →'}
        </button>
      </div>
    </form>
  );
}
