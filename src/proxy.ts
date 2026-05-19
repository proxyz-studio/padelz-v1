import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { uuidv7 } from 'uuidv7';
import { rateLimit, type RateLimitKind } from '@/libs/RateLimit';

const isProtected = createRouteMatcher([
  '/me(.*)',
  '/match(.*)',
  '/c/:slug/admin(.*)',
]);

// Rate-limit rules — first match wins. Tight on public abuse vectors, loose on
// reads. Authenticated endpoints will be keyed by user-id once M1 ships actual
// API routes; for now everything is keyed by source IP.
const RATE_RULES: { match: (path: string) => boolean; kind: RateLimitKind }[] = [
  { match: (p) => p === '/api/webhook/clerk', kind: 'webhook' },
  { match: (p) => p.startsWith('/api/auth') || p === '/sign-in', kind: 'auth' },
  { match: (p) => p.startsWith('/api/score'), kind: 'score_submit' },
  { match: (p) => p.startsWith('/api/registration'), kind: 'registration' },
  { match: (p) => p.startsWith('/api/profile'), kind: 'profile_edit' },
];

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'anon';
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  const path = req.nextUrl.pathname;

  // 1. Rate-limit BEFORE auth. A flood of unauthenticated traffic shouldn't
  // get to spend Clerk's auth-check CPU. Returns 429 + Retry-After on bust.
  const rule = RATE_RULES.find((r) => r.match(path));
  if (rule) {
    const ip = clientIp(req);
    const result = await rateLimit(ip, rule.kind);
    if (!result.success) {
      const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
      return new NextResponse('Too many requests', {
        status: 429,
        headers: {
          'retry-after': String(retryAfterSec),
          'x-ratelimit-limit': String(result.limit),
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(result.reset),
        },
      });
    }
  }

  // 2. Clerk auth gate
  if (isProtected(req)) auth.protect();

  // 3. Request-id propagation for log correlation
  const incoming = req.headers.get('x-request-id');
  const requestId =
    incoming && /^[a-z0-9-]{8,64}$/.test(incoming) ? incoming : uuidv7();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/(api|trpc)(.*)'],
};
