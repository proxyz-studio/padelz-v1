export const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export type Tier = typeof TIERS[number];

export const TIER_TO_INT: Record<Tier, number> = {
  bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5,
};

export type PublicPlayer = {
  id: string;
  handle: string;
  display_name: string;
  tier: Tier;
  photo_url: string | null;
  verified: boolean;
  redacted_at: Date | null;
};

export type PublicClub = {
  id: string;
  slug: string;
  name: string;
  city: string;
  description: string | null;
  court_count: number | null;
  photo_url: string | null;
};
