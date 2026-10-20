import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../activity.js';
import { query, queryOne } from '../db.js';
import { HttpError, parse, uuid } from '../http.js';

const LIST_SQL = `
  SELECT u.id, u.name, u.email, u.role, u.active, u.last_login_at, u.created_at,
         la.created_at AS last_activity_at,
         la.summary    AS last_activity_summary,
         (SELECT count(*)::int FROM activity_log a WHERE a.user_id = u.id AND a.action <> 'auth.login') AS actions_count
  FROM users u
  LEFT JOIN LATERAL (
    SELECT created_at, summary FROM activity_log
    WHERE user_id = u.id AND action <> 'auth.login'
    ORDER BY created_at DESC LIMIT 1
  ) la ON true
  ORDER BY u.active DESC, u.name
`;

export async function userRoutes(app: FastifyInstance) {
  const admin = { preHandler: [app.authenticate, app.requireAdmin] };

  app.get('/users', admin, async () => ({ users: await query(LIST_SQL) }));

  app.post('/users', admin, async (req) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2),
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(8, 'mínimo de 8 caracteres'),
        role: z.enum(['admin', 'member']).default('member'),
      }),
      req.body,
    );
    const exists = await queryOne('SELECT 1 FROM users WHERE email = $1', [body.email]);
    if (exists) throw new HttpError(409, 'Já existe um usuário com esse e-mail.');

    const user = await queryOne(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, active, created_at`,
      [body.name, body.email, await bcrypt.hash(body.password, 12), body.role],
    );
    await logActivity({
      userId: req.user.sub,
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      summary: `Criou o usuário ${body.name} (${body.role === 'admin' ? 'administrador' : 'funcionário'})`,
    });
    return { user };
  });

  app.patch('/users/:id', admin, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({
        name: z.string().trim().min(2).optional(),
        role: z.enum(['admin', 'member']).optional(),
        active: z.boolean().optional(),
        password: z.string().min(8, 'mínimo de 8 caracteres').optional(),
      }),
      req.body,
    );
    if (id === req.user.sub && (body.active === false || body.role === 'member')) {
      throw new HttpError(400, 'Você não pode desativar ou rebaixar a si mesmo.');
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (body.name !== undefined) add('name', body.name);
    if (body.role !== undefined) add('role', body.role);
    if (body.active !== undefined) add('active', body.active);
    if (body.password !== undefined) add('password_hash', await bcrypt.hash(body.password, 12));
    if (!sets.length) throw new HttpError(400, 'Nada para atualizar.');

    params.push(id);
    const user = await queryOne(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, email, role, active`,
      params,
    );
    if (!user) throw new HttpError(404, 'Usuário não encontrado.');

    const changes = [
      body.name !== undefined && 'nome',
      body.role !== undefined && 'perfil',
      body.active !== undefined && (body.active ? 'reativação' : 'desativação'),
      body.password !== undefined && 'senha',
    ].filter(Boolean);
    await logActivity({
      userId: req.user.sub,
      action: 'user.update',
      entityType: 'user',
      entityId: id,
      summary: `Alterou o usuário ${user.name} (${changes.join(', ')})`,
    });
    return { user };
  });

  // Histórico completo de um usuário
  app.get('/users/:id/activity', admin, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const q = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
    );
    const user = await queryOne(
      'SELECT id, name, email, role, active, last_login_at, created_at FROM users WHERE id = $1',
      [id],
    );
    if (!user) throw new HttpError(404, 'Usuário não encontrado.');
    const items = await query(
      `SELECT id, action, entity_type, entity_id, summary, meta, created_at
       FROM activity_log WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [id, q.limit, q.offset],
    );
    return { user, items };
  });
}
