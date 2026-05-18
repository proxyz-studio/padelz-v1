import type { Config } from 'drizzle-kit';
import { Env } from './src/libs/Env';

export default {
  schema: './src/models/Schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: Env.DATABASE_URL },
  strict: true,
  verbose: true,
} satisfies Config;
