import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  Sentry.captureException(new Error('padelz: test sentry event from /api/test-sentry'));
  await Sentry.flush(2000);
  return new Response('Sentry test event sent', { status: 200 });
}
