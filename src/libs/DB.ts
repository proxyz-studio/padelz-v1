import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { Env } from './Env';
import * as schema from '@/models/Schema';

const sql = neon(Env.DATABASE_URL);
export const db = drizzle(sql, { schema });
