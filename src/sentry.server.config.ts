import * as Sentry from '@sentry/nextjs';
import { Env } from '@/libs/Env';

Sentry.init({
  dsn: Env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  debug: false,
});
