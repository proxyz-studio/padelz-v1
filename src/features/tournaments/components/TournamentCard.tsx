import Link from 'next/link';

export type TournamentCardData = {
  slug: string;
  name: string;
  format: string;
  tournament_type: string;
  start_at: Date;
  status: string;
  tier_min: string | null;
  tier_max: string | null;
  club_name: string;
  club_slug: string;
  registered_count: number;
};

const FORMAT_LABEL: Record<string, string> = {
  americano: 'Americano',
  mexicano: 'Mexicano',
  round_robin: 'Round-robin',
  bracket: 'Bracket',
};
const TYPE_LABEL: Record<string, string> = {
  open: 'Open',
  club_internal: 'Club',
  group: 'Group',
  casual: 'Casual',
};
const STATUS_CLS: Record<string, string> = {
  draft: 'mute',
  open: 'fn-green font-bold',
  in_progress: 'fn-blue font-bold',
  complete: 'mute',
};

/**
 * Tournament row, flat single-spec data layout. Replaces the prior
 * grid-card visual. Used by /t list and any other tournament index.
 */
export function TournamentCard({ t }: { t: TournamentCardData }) {
  const date = t.start_at.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const tierBand =
    t.tier_min || t.tier_max
      ? `${t.tier_min ?? 'any'} → ${t.tier_max ?? 'any'}`
      : 'All tiers';
  const statusCls = STATUS_CLS[t.status] ?? '';
  const year = t.start_at.getUTCFullYear();

  return (
    <tr>
      <td className="no-underline">{year}</td>
      <td>
        <Link href={`/t/${t.slug}`} className="no-underline">
          <span className="font-bold">{t.name}</span>
        </Link>
      </td>
      <td className="mute">
        {date} · {FORMAT_LABEL[t.format] ?? t.format} ·{' '}
        {TYPE_LABEL[t.tournament_type] ?? t.tournament_type} ·{' '}
        <span className={statusCls}>
          {t.status.replace('_', ' ')}
        </span>{' '}
        · {tierBand}
      </td>
      <td>
        <Link href={`/c/${t.club_slug}`} className="mute no-underline">
          {t.club_name}
        </Link>
      </td>
      <td className="mute tabular-nums no-underline">
        {String(t.registered_count).padStart(2, '0')}
      </td>
      <td className="arrow no-underline">
        <Link href={`/t/${t.slug}`}>→</Link>
      </td>
    </tr>
  );
}
