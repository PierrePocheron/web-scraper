import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import * as schema from './schema';

// Singleton : Next.js recharge les modules en dev, on accroche l'instance au global.
const globalForDb = globalThis as unknown as { __pfDb?: ReturnType<typeof createDb> };

function createDb() {
  const sqlite = new Database(path.join(process.cwd(), 'prospects.db'));
  sqlite.pragma('journal_mode = WAL');
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.__pfDb ?? (globalForDb.__pfDb = createDb());
export { schema };
