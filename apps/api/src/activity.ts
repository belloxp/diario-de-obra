import { query } from './db.js';

export type ActivityInput = {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
  meta?: Record<string, unknown>;
};

/** Registra uma ação no histórico. Nunca derruba a requisição se falhar. */
export async function logActivity(input: ActivityInput) {
  try {
    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, summary, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.userId,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.summary,
        JSON.stringify(input.meta ?? {}),
      ],
    );
  } catch (err) {
    console.error('Falha ao registrar atividade', err);
  }
}
