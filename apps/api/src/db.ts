import pg from 'pg';
import { config } from './config.js';

// numeric (OID 1700) volta como número em vez de string
pg.types.setTypeParser(1700, (v) => parseFloat(v));
// date (OID 1082) volta como 'YYYY-MM-DD', sem conversão de fuso
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: /sslmode=require/.test(config.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
