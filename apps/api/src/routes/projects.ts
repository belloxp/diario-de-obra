import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../activity.js';
import { query, queryOne } from '../db.js';
import { HttpError, parse, uuid } from '../http.js';

export async function projectRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };
  const admin = { preHandler: [app.authenticate, app.requireAdmin] };

  app.get('/projects', auth, async () => ({
    projects: await query(
      `SELECT id, name, contract_number, location, active, created_at
       FROM projects ORDER BY active DESC, created_at DESC`,
    ),
  }));

  app.post('/projects', admin, async (req) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2),
        contractNumber: z.string().trim().optional(),
        location: z.string().trim().optional(),
      }),
      req.body,
    );
    const project = await queryOne(
      `INSERT INTO projects (name, contract_number, location) VALUES ($1, $2, $3)
       RETURNING id, name, contract_number, location, active, created_at`,
      [body.name, body.contractNumber || null, body.location || null],
    );
    await logActivity({
      userId: req.user.sub,
      action: 'project.create',
      entityType: 'project',
      entityId: project.id,
      summary: `Criou a obra "${body.name}"`,
    });
    return { project };
  });

  app.patch('/projects/:id', admin, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({
        name: z.string().trim().min(2).optional(),
        contractNumber: z.string().trim().nullable().optional(),
        location: z.string().trim().nullable().optional(),
        active: z.boolean().optional(),
      }),
      req.body,
    );
    const sets: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (body.name !== undefined) add('name', body.name);
    if (body.contractNumber !== undefined) add('contract_number', body.contractNumber || null);
    if (body.location !== undefined) add('location', body.location || null);
    if (body.active !== undefined) add('active', body.active);
    if (!sets.length) throw new HttpError(400, 'Nada para atualizar.');
    params.push(id);
    const project = await queryOne(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, contract_number, location, active, created_at`,
      params,
    );
    if (!project) throw new HttpError(404, 'Obra não encontrada.');
    await logActivity({
      userId: req.user.sub,
      action: 'project.update',
      entityType: 'project',
      entityId: id,
      summary: `Alterou a obra "${project.name}"`,
    });
    return { project };
  });
}
