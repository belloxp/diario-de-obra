import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../activity.js';
import { query, queryOne } from '../db.js';
import { HttpError, parse, uuid } from '../http.js';

export async function categoryRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };
  const admin = { preHandler: [app.authenticate, app.requireAdmin] };

  app.get('/categories', auth, async () => ({
    categories: await query(
      `SELECT c.id, c.name, c.sort_order, (SELECT count(*)::int FROM photos p WHERE p.category_id = c.id) AS photos_count
       FROM photo_categories c ORDER BY c.sort_order, c.name`,
    ),
  }));

  app.post('/categories', admin, async (req) => {
    const body = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    const dup = await queryOne('SELECT 1 FROM photo_categories WHERE lower(name) = lower($1)', [body.name]);
    if (dup) throw new HttpError(409, 'Já existe uma categoria com esse nome.');
    const category = await queryOne(
      `INSERT INTO photo_categories (name, sort_order)
       VALUES ($1, COALESCE((SELECT max(sort_order) + 1 FROM photo_categories), 0))
       RETURNING id, name, sort_order`,
      [body.name],
    );
    await logActivity({
      userId: req.user.sub,
      action: 'category.create',
      entityType: 'category',
      entityId: category.id,
      summary: `Criou a categoria de fotos "${body.name}"`,
    });
    return { category };
  });

  app.patch('/categories/:id', admin, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    const dup = await queryOne('SELECT 1 FROM photo_categories WHERE lower(name) = lower($1) AND id <> $2', [
      body.name,
      id,
    ]);
    if (dup) throw new HttpError(409, 'Já existe uma categoria com esse nome.');
    const category = await queryOne(
      'UPDATE photo_categories SET name = $1 WHERE id = $2 RETURNING id, name, sort_order',
      [body.name, id],
    );
    if (!category) throw new HttpError(404, 'Categoria não encontrada.');
    await logActivity({
      userId: req.user.sub,
      action: 'category.update',
      entityType: 'category',
      entityId: id,
      summary: `Renomeou a categoria de fotos para "${body.name}"`,
    });
    return { category };
  });

  app.delete('/categories/:id', admin, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const category = await queryOne('DELETE FROM photo_categories WHERE id = $1 RETURNING name', [id]);
    if (!category) throw new HttpError(404, 'Categoria não encontrada.');
    await logActivity({
      userId: req.user.sub,
      action: 'category.delete',
      entityType: 'category',
      entityId: id,
      summary: `Excluiu a categoria de fotos "${category.name}" (as fotos ficam sem categoria)`,
    });
    return { ok: true };
  });
}
