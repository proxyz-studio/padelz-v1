import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { Env } from '@/libs/Env';
import { handleClerkEvent } from '@/features/auth/webhook';
import { logger } from '@/libs/Logger';
import { rateLimit } from '@/libs/RateLimit';

export async function POST(req: Request) {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
  const limit = await rateLimit(ip, 'webhook');
  if (!limit.success) {
    return new Response('rate limited', {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000))),
      },
    });
  }
  const svix_id = h.get('svix-id');
  const svix_timestamp = h.get('svix-timestamp');
  const svix_signature = h.get('svix-signature');
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', { status: 400 });
  }
  const body = await req.text();
  const wh = new Webhook(Env.CLERK_WEBHOOK_SECRET);
  try {
    const evt: any = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
    await handleClerkEvent(evt);
    return new Response('ok', { status: 200 });
  } catch (e: any) {
    logger.error({ err: e.message }, 'clerk webhook failed');
    return new Response('Invalid', { status: 400 });
  }
}
