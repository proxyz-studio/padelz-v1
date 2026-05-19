import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Env } from './Env';
import { logger } from './Logger';

// Detect stub credentials so dev / foundation-week environments don't crash on
// every request. Production env vars replace the placeholder and limits activate
// automatically with no code change.
const isConfigured =
  !Env.UPSTASH_REDIS_REST_URL.includes('placeholder') &&
  Env.UPSTASH_REDIS_REST_TOKEN !== 'placeholder_token';

const redis = isConfigured
  ? new Redis({
      url: Env.UPSTASH_REDIS_REST_URL,
      token: Env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const limiters = redis
  ? ({
      score_submit: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '60 s'),
        prefix: 'rl:score',
      }),
      registration: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        prefix: 'rl:register',
      }),
      profile_edit: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'),
        prefix: 'rl:profile',
      }),
      webhook: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, '60 s'),
        prefix: 'rl:webhook',
      }),
      auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '600 s'),
        prefix: 'rl:auth',
      }),
    } as const)
  : null;

export type RateLimitKind =
  | 'score_submit'
  | 'registration'
  | 'profile_edit'
  | 'webhook'
  | 'auth';

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

/**
 * Returns success=true if Upstash is not configured (e.g. foundation-week
 * stubs in `.env.local`). Once real Upstash creds land in Vercel env, real
 * enforcement activates with no caller-side change.
 *
 * Also fail-open if Upstash itself errors at runtime: prefer to serve over to
 * break. Sentry will capture the error; ops can investigate.
 */
export async function rateLimit(
  identifier: string,
  kind: RateLimitKind,
): Promise<RateLimitResult> {
  if (!limiters) {
    return { success: true, limit: 0, remaining: 0, reset: Date.now() };
  }
  try {
    const result = await limiters[kind].limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : String(e), kind, identifier },
      'rate-limit backend failed; allowing request',
    );
    return { success: true, limit: 0, remaining: 0, reset: Date.now() };
  }
}
