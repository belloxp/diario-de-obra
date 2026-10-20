import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../activity.js';
import { query, queryOne } from '../db.js';
import { dateStr, HttpError, parse, uuid } from '../http.js';
import { deleteObject, objectExists, presignDownload, presignUpload } from '../r2.js';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB por foto
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const SELECT = `
  SELECT p.id, p.project_id, p.category_id, c.name AS category_name, p.r2_key, p.original_name,
         p.mime_type, p.size_bytes, p.taken_at, p.note, p.created_at, p.updated_at,
         p.created_by, cu.name AS created_by_name, uu.name AS updated_by_name
  FROM photos p
  LEFT JOIN photo_categories c ON c.id = p.category_id
  LEFT JOIN users cu ON cu.id = p.created_by
  LEFT JOIN users uu ON uu.id = p.updated_by
`;

async function withUrls<T extends { r2_key: string }>(rows: T[]) {
  return Promise.all(rows.map(async (r) => ({ ...r, url: await presignDownload(r.r2_key) })));
}

export async function photoRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  // 1) Gera uma URL assinada para o navegador enviar a foto direto ao R2
  app.post('/photos/presign', auth, async (req) => {
    const body = parse(
      z.object({
        projectId: uuid,
        contentType: z.string(),
        size: z.number().int().positive().max(MAX_BYTES, 'a foto excede 20 MB'),
      }),
      req.body,
    );
    const ext = EXT[body.contentType.toLowerCase()];
    if (!ext) throw new HttpError(400, 'Formato não suportado. Use JPG, PNG, WEBP ou HEIC.');
    const project = await queryOne('SELECT 1 FROM projects WHERE id = $1', [body.projectId]);
    if (!project) throw new HttpError(404, 'Obra não encontrada.');

    const now = new Date();
    const key = `projects/${body.projectId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
    const uploadUrl = await presignUpload(key, body.contentType.toLowerCase());
    return { key, uploadUrl };
  });

  // 2) Registra a foto no banco depois que o upload terminou
  app.post('/photos', auth, async (req) => {
    const body = parse(
      z.object({
        projectId: uuid,
        categoryId: uuid.nullable().optional(),
        key: z.string().min(1),
        originalName: z.string().max(255).optional(),
        mimeType: z.string().optional(),
        takenAt: z.iso.datetime({ offset: true }).optional(),
        note: z.string().max(5000).default(''),
      }),
      req.body,
    );
    if (!body.key.startsWith(`projects/${body.projectId}/`)) throw new HttpError(400, 'Chave de arquivo inválida.');
    const head = await objectExists(body.key);
    if (!head.exists) throw new HttpError(400, 'O arquivo não foi encontrado no armazenamento. Tente enviar de novo.');

    const row = await queryOne<{ id: string }>(
      `INSERT INTO photos (project_id, category_id, r2_key, original_name, mime_type, size_bytes, taken_at, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8, $9)
       RETURNING id`,
      [
        body.projectId,
        body.categoryId ?? null,
        body.key,
        body.originalName ?? null,
        body.mimeType ?? null,
        head.size ?? null,
        body.takenAt ?? null,
        body.note,
        req.user.sub,
      ],
    );
    const [photo] = await withUrls(await query(`${SELECT} WHERE p.id = $1`, [row!.id]));
    await logActivity({
      userId: req.user.sub,
      action: 'photo.create',
      entityType: 'photo',
      entityId: row!.id,
      summary: `Enviou uma foto${(photo as any).category_name ? ` em "${(photo as any).category_name}"` : ''}${
        body.note ? `: "${body.note.slice(0, 140)}"` : ''
      }`,
      meta: { projectId: body.projectId },
    });
    return { photo };
  });

  app.get('/photos', auth, async (req) => {
    const q = parse(
      z.object({
        projectId: uuid,
        categoryId: z.union([uuid, z.literal('none')]).optional(),
        from: dateStr.optional(),
        to: dateStr.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(60),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
    );
    const where = ['p.project_id = $1'];
    const params: unknown[] = [q.projectId];
    if (q.categoryId === 'none') where.push('p.category_id IS NULL');
    else if (q.categoryId) {
      params.push(q.categoryId);
      where.push(`p.category_id = $${params.length}`);
    }
    // datas comparadas no fuso de Brasília
    if (q.from) {
      params.push(q.from);
      where.push(`(p.taken_at AT TIME ZONE 'America/Sao_Paulo')::date >= $${params.length}::date`);
    }
    if (q.to) {
      params.push(q.to);
      where.push(`(p.taken_at AT TIME ZONE 'America/Sao_Paulo')::date <= $${params.length}::date`);
    }
    const total = await queryOne<{ count: number }>(
      `SELECT count(*)::int AS count FROM photos p WHERE ${where.join(' AND ')}`,
      params,
    );
    params.push(q.limit, q.offset);
    const rows = await query(
      `${SELECT} WHERE ${where.join(' AND ')} ORDER BY p.taken_at DESC, p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { total: total?.count ?? 0, photos: await withUrls(rows) };
  });

  app.patch('/photos/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({
        categoryId: uuid.nullable().optional(),
        takenAt: z.iso.datetime({ offset: true }).optional(),
        note: z.string().max(5000).optional(),
      }),
      req.body,
    );
    const current = await queryOne<{ created_by: string }>('SELECT created_by FROM photos WHERE id = $1', [id]);
    if (!current) throw new HttpError(404, 'Foto não encontrada.');
    if (req.user.role !== 'admin' && current.created_by !== req.user.sub) {
      throw new HttpError(403, 'Você só pode editar as fotos que você enviou.');
    }

    const sets = ['updated_by = $1', 'updated_at = now()'];
    const params: unknown[] = [req.user.sub];
    const add = (col: string, val: unknown, cast = '') => {
      params.push(val);
      sets.push(`${col} = $${params.length}${cast}`);
    };
    if (body.categoryId !== undefined) add('category_id', body.categoryId);
    if (body.takenAt !== undefined) add('taken_at', body.takenAt, '::timestamptz');
    if (body.note !== undefined) add('note', body.note);
    params.push(id);
    await query(`UPDATE photos SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

    const [photo] = await withUrls(await query(`${SELECT} WHERE p.id = $1`, [id]));
    await logActivity({
      userId: req.user.sub,
      action: 'photo.update',
      entityType: 'photo',
      entityId: id,
      summary: `Editou uma foto${body.note !== undefined ? `: "${body.note.slice(0, 140)}"` : ''}`,
    });
    return { photo };
  });

  app.delete('/photos/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const photo = await queryOne<{ created_by: string; r2_key: string }>(
      'SELECT created_by, r2_key FROM photos WHERE id = $1',
      [id],
    );
    if (!photo) throw new HttpError(404, 'Foto não encontrada.');
    if (req.user.role !== 'admin' && photo.created_by !== req.user.sub) {
      throw new HttpError(403, 'Você só pode excluir as fotos que você enviou.');
    }
    await query('DELETE FROM photos WHERE id = $1', [id]);
    try {
      await deleteObject(photo.r2_key);
    } catch (err) {
      app.log.warn({ err, key: photo.r2_key }, 'Falha ao apagar objeto no R2');
    }
    await logActivity({ userId: req.user.sub, action: 'photo.delete', entityType: 'photo', entityId: id, summary: 'Excluiu uma foto' });
    return { ok: true };
  });
}
