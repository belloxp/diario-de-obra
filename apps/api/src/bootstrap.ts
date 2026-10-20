import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { pool, query, queryOne } from './db.js';
import { DEFAULT_CATEGORIES, SCHEMA_SQL } from './schema.js';

export async function migrate() {
  await pool.query(SCHEMA_SQL);

  const existing = await queryOne<{ count: string }>('SELECT count(*)::text AS count FROM photo_categories');
  if (existing && Number(existing.count) === 0) {
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      await query('INSERT INTO photo_categories (name, sort_order) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
        DEFAULT_CATEGORIES[i],
        i,
      ]);
    }
  }
}

export async function seedAdmin(log: { info: (m: string) => void; warn: (m: string) => void }) {
  const row = await queryOne<{ count: string }>('SELECT count(*)::text AS count FROM users');
  if (row && Number(row.count) > 0) return;

  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME } = config;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    log.warn('Nenhum usuário cadastrado. Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD para criar o administrador inicial.');
    return;
  }
  const hash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 12);
  await query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)', [
    SEED_ADMIN_NAME || 'Administrador',
    SEED_ADMIN_EMAIL.toLowerCase(),
    hash,
    'admin',
  ]);
  log.info(`Administrador inicial criado: ${SEED_ADMIN_EMAIL}`);
}
