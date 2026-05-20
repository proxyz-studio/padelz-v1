import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@clerk/nextjs/server', async () => {
  const actual = await vi.importActual<typeof import('@clerk/nextjs/server')>('@clerk/nextjs/server');
  return {
    ...actual,
    clerkMiddleware: (handler: (auth: () => Promise<{ userId: string | null }>, req: NextRequest) => Promise<NextResponse | void>) => {
      return async (req: NextRequest) => {
        const stubAuth = Object.assign(
          async () => ({ userId: null }),
          { protect: async () => {} },
        );
        const r = await handler(stubAuth as never, req);
        return r ?? NextResponse.next();
      };
    },
  };
});

describe('middleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects anonymous visitors at / to /coming-soon when NEXT_PUBLIC_BETA_OPEN=false', async () => {
    vi.stubEnv('NEXT_PUBLIC_BETA_OPEN', 'false');
    const { default: middleware } = await import('@/proxy');
    const req = new NextRequest('http://localhost/');
    const res = await middleware(req, {} as never);
    expect(res!.status).toBe(307);
    expect(res!.headers.get('location')).toContain('/coming-soon');
  });

  it('allows anonymous visitors through at / when NEXT_PUBLIC_BETA_OPEN=true', async () => {
    vi.stubEnv('NEXT_PUBLIC_BETA_OPEN', 'true');
    const { default: middleware } = await import('@/proxy');
    const req = new NextRequest('http://localhost/');
    const res = await middleware(req, {} as never);
    expect(res!.status).toBe(200);
    expect(res!.headers.get('location')).toBeNull();
  });

  it('lets public routes pass even when gate is off', async () => {
    vi.stubEnv('NEXT_PUBLIC_BETA_OPEN', 'false');
    const { default: middleware } = await import('@/proxy');
    for (const path of ['/leaderboard', '/t', '/t/saturday-open', '/p/somebody', '/sign-in', '/coming-soon']) {
      const req = new NextRequest(`http://localhost${path}`);
      const res = await middleware(req, {} as never);
      expect(res!.status).toBe(200);
      expect(res!.headers.get('location')).toBeNull();
    }
  });
});
