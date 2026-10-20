import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../activity.js';
import { query, queryOne } from '../db.js';
import { dateStr, HttpError, parse, uuid } from '../http.js';

const SELECT = `
  SELECT d.id, d.project_id, d.entry_date, d.text, d.created_at, d.updated_at,
         d.created_by, cu.name AS created_by_name, uu.name AS updated_by_name
  FROM diary_entries d
  LEFT JOIN users cu ON cu.id = d.created_by
  LEFT JOIN users uu ON uu.id = d.updated_by
`;

const fmt = (d: string) => d.split('-').reverse().join('/');

export async function diaryRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  app.get('/diary', auth, async (req) => {
    const q = parse(
      z.object({
        projectId: uuid,
        from: dateStr.optional(),
        to: dateStr.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(60),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
    );
    const where = ['d.project_id = $1'];
    const params: unknown[] = [q.projectId];
    if (q.from) {
      params.push(q.from);
      where.push(`d.entry_date >= $${params.length}`);
    }
    if (q.to) {
      params.push(q.to);
      where.push(`d.entry_date <= $${params.length}`);
    }
    params.push(q.limit, q.offset);
    const entries = await query(
      `${SELECT} WHERE ${where.join(' AND ')}
       ORDER BY d.entry_date DESC, d.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { entries };
  });

  app.post('/diary', auth, async (req) => {
    const body = parse(
      z.object({ projectId: uuid, entryDate: dateStr, text: z.string().trim().min(1, 'escreva o texto do diário').max(20000) }),
      req.body,
    );
    const project = await queryOne('SELECT 1 FROM projects WHERE id = $1', [body.projectId]);
    if (!project) throw new HttpError(404, 'Obra não encontrada.');
    const row = await queryOne<{ id: string }>(
      `INSERT INTO diary_entries (project_id, entry_date, text, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
      [body.projectId, body.entryDate, body.text, req.user.sub],
    );
    const [entry] = await query(`${SELECT} WHERE d.id = $1`, [row!.id]);
    await logActivity({
      userId: req.user.sub,
      action: 'diary.create',
      entityType: 'diary',
      entityId: row!.id,
      summary: `Escreveu no diário de ${fmt(body.entryDate)}: "${body.text.slice(0, 140)}"`,
    });
    return { entry };
  });

  app.patch('/diary/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({ entryDate: dateStr.optional(), text: z.string().trim().min(1).max(20000).optional() }),
      req.body,
    );
    const current = await queryOne<{ created_by: string; entry_date: string }>(
      'SELECT created_by, entry_date FROM diary_entries WHERE id = $1',
      [id],
    );
    if (!current) throw new HttpError(404, 'Registro não encontrado.');
    if (req.user.role !== 'admin' && current.created_by !== req.user.sub) {
      throw new HttpError(403, 'Você só pode editar o que você mesmo escreveu.');
    }
    const sets = ['updated_by = $1', 'updated_at = now()'];
    const params: unknown[] = [req.user.sub];
    if (body.entryDate !== undefined) {
      params.push(body.entryDate);
      sets.push(`entry_date = $${params.length}`);
    }
    if (body.text !== undefined) {
      params.push(body.text);
      sets.push(`text = $${params.length}`);
    }
    params.push(id);
    await query(`UPDATE diary_entries SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    const [entry] = await query(`${SELECT} WHERE d.id = $1`, [id]);
    await logActivity({
      userId: req.user.sub,
      action: 'diary.update',
      entityType: 'diary',
      entityId: id,
      summary: `Editou o diário de ${fmt(body.entryDate ?? current.entry_date)}${
        body.text ? `: "${body.text.slice(0, 140)}"` : ''
      }`,
    });
    return { entry };
  });

  app.delete('/diary/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const current = await queryOne<{ created_by: string; entry_date: string }>(
      'SELECT created_by, entry_date FROM diary_entries WHERE id = $1',
      [id],
    );
    if (!current) throw new HttpError(404, 'Registro não encontrado.');
    if (req.user.role !== 'admin' && current.created_by !== req.user.sub) {
      throw new HttpError(403, 'Você só pode excluir o que você mesmo escreveu.');
    }
    await query('DELETE FROM diary_entries WHERE id = $1', [id]);
    await logActivity({
      userId: req.user.sub,
      action: 'diary.delete',
      entityType: 'diary',
      entityId: id,
      summary: `Excluiu um registro do diário de ${fmt(current.entry_date)}`,
    });
    return { ok: true };
  });
}
