import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TierFilter } from '@/features/leaderboard/components/TierFilter';

describe('TierFilter', () => {
  it('renders six links (all + 5 tiers) when no tier is selected', () => {
    const html = renderToStaticMarkup(<TierFilter currentTier={null} basePath="/leaderboard" />);
    expect(html).toContain('href="/leaderboard"');
    expect(html).toContain('href="/leaderboard?tier=bronze"');
    expect(html).toContain('href="/leaderboard?tier=silver"');
    expect(html).toContain('href="/leaderboard?tier=gold"');
    expect(html).toContain('href="/leaderboard?tier=platinum"');
    expect(html).toContain('href="/leaderboard?tier=diamond"');
  });

  it('marks the selected tier with .fn-blue.font-bold', () => {
    const html = renderToStaticMarkup(<TierFilter currentTier="silver" basePath="/leaderboard" />);
    expect(html).toMatch(/href="\/leaderboard\?tier=silver"[^>]*fn-blue[^>]*font-bold|fn-blue font-bold[^>]*href="\/leaderboard\?tier=silver"/);
  });

  it('marks "All" as selected when currentTier is null', () => {
    const html = renderToStaticMarkup(<TierFilter currentTier={null} basePath="/leaderboard" />);
    expect(html).toMatch(/href="\/leaderboard"[^>]*fn-blue[^>]*font-bold|fn-blue font-bold[^>]*href="\/leaderboard"/);
  });
});
