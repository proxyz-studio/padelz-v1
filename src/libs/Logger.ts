import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.email',
    '*.phone',
    '*.userId',
    '*.user_id',
    '*.clerk_id',
  ],
});
