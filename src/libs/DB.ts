import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { Env } from './Env';
import * as schema from '@/models/Schema';

// Single connection used by the Next.js Node runtime. Server Actions, Route
// Handlers, and cron jobs all share this client. Transactions are supported
// (unlike neon-http) which M3's scoring ledger requires.
const client = postgres(Env.DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
