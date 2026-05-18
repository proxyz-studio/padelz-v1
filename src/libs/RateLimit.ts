import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Env } from './Env';

const redis = new Redis({
  url: Env.UPSTASH_REDIS_REST_URL,
  token: Env.UPSTASH_REDIS_REST_TOKEN,
});

const limiters = {
  score_submit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '60 s'), prefix: 'rl:score' }),
  registration: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '60 s'), prefix: 'rl:register' }),
  profile_edit: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '60 s'), prefix: 'rl:profile' }),
} as const;

export type RateLimitKind = keyof typeof limiters;

export async function rateLimit(identifier: string, kind: RateLimitKind) {
  return limiters[kind].limit(identifier);
}
