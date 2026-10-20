import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { parse, uuid } from '../http.js';

export async function activityRoutes(app: FastifyInstance) {
  // Feed geral de atividades (administrador)
  app.get('/activity', { preHandler: [app.authenticate, app.requireAdmin] }, async (req) => {
    const q = parse(
      z.object({
        userId: uuid.optional(),
        entityType: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
    );
    const where: string[] = [`a.action <> 'auth.login'`];
    const params: unknown[] = [];
    if (q.userId) {
      params.push(q.userId);
      where.push(`a.user_id = $${params.length}`);
    }
    if (q.entityType) {
      params.push(q.entityType);
      where.push(`a.entity_type = $${params.length}`);
    }
    params.push(q.limit, q.offset);
    const items = await query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.summary, a.meta, a.created_at,
              a.user_id, u.name AS user_name
       FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { items };
  });
}
