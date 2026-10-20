import { migrate } from './bootstrap.js';
import { pool } from './db.js';

migrate()
  .then(() => console.log('Migração concluída.'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
