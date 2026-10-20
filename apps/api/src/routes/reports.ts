import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../activity.js';
import { config } from '../config.js';
import { query, queryOne } from '../db.js';
import { dateStr, HttpError, parse, uuid } from '../http.js';
import { generateReportPdf, type ReportData, type ReportPhoto } from '../pdf.js';
import { getDocStatus, mapStatus, sendForSignature } from '../zapsign.js';

const SELECT = `
  SELECT r.id, r.project_id, r.number, r.title, r.contract_number, r.period_from, r.period_to,
         r.show_state, r.status, r.zapsign_sign_url, r.signed_at, r.created_at, r.created_by,
         u.name AS created_by_name, pr.name AS project_name,
         (SELECT count(*)::int FROM photos p
          WHERE p.project_id = r.project_id
            AND (p.taken_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN r.period_from AND r.period_to) AS photos_count
  FROM reports r
  LEFT JOIN users u ON u.id = r.created_by
  LEFT JOIN projects pr ON pr.id = r.project_id
`;

type Row = {
  id: string;
  project_id: string;
  number: number;
  title: string;
  contract_number: string | null;
  period_from: string;
  period_to: string;
  show_state: boolean;
  status: string;
  signed_at: string | null;
  project_name: string;
};

async function reportPhotos(r: Row): Promise<ReportPhoto[]> {
  return query<ReportPhoto>(
    `SELECT c.name AS category_name, p.taken_at, p.note, p.r2_key, p.mime_type
     FROM photos p LEFT JOIN photo_categories c ON c.id = p.category_id
     WHERE p.project_id = $1
       AND (p.taken_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2::date AND $3::date
     ORDER BY (c.sort_order IS NULL), c.sort_order, c.name, p.taken_at`,
    [r.project_id, r.period_from, r.period_to],
  );
}

function toReportData(r: Row): ReportData {
  return {
    number: r.number,
    title: r.title,
    contract_number: r.contract_number,
    period_from: r.period_from,
    period_to: r.period_to,
    show_state: r.show_state,
    project_name: r.project_name,
    status: r.status,
    signed_at: r.signed_at,
  };
}

async function buildPdf(r: Row): Promise<Buffer> {
  const photos = await reportPhotos(r);
  return generateReportPdf(toReportData(r), photos);
}

export async function reportRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  app.get('/reports', auth, async (req) => {
    const q = parse(z.object({ projectId: uuid }), req.query);
    const reports = await query(`${SELECT} WHERE r.project_id = $1 ORDER BY r.number DESC`, [q.projectId]);
    return { reports };
  });

  app.get('/reports/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const report = await queryOne(`${SELECT} WHERE r.id = $1`, [id]);
    if (!report) throw new HttpError(404, 'Relatório não encontrado.');
    return { report };
  });

  app.post('/reports', auth, async (req) => {
    const body = parse(
      z.object({
        projectId: uuid,
        title: z.string().max(2000).default(''),
        contractNumber: z.string().max(120).optional(),
        periodFrom: dateStr,
        periodTo: dateStr,
        showState: z.boolean().default(true),
      }),
      req.body,
    );
    if (body.periodFrom > body.periodTo) throw new HttpError(400, 'A data inicial não pode ser maior que a final.');
    const project = await queryOne<{ contract_number: string | null }>(
      'SELECT contract_number FROM projects WHERE id = $1',
      [body.projectId],
    );
    if (!project) throw new HttpError(404, 'Obra não encontrada.');

    const next = await queryOne<{ n: number }>('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM reports WHERE project_id = $1', [
      body.projectId,
    ]);
    const report = await queryOne<Row>(
      `INSERT INTO reports (project_id, number, title, contract_number, period_from, period_to, show_state, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        body.projectId,
        next!.n,
        body.title,
        body.contractNumber || project.contract_number || null,
        body.periodFrom,
        body.periodTo,
        body.showState,
        req.user.sub,
      ],
    );
    await logActivity({
      userId: req.user.sub,
      action: 'report.create',
      entityType: 'report',
      entityId: report!.id,
      summary: `Criou o relatório fotográfico nº ${String(next!.n).padStart(3, '0')}`,
      meta: { projectId: body.projectId },
    });
    const full = await queryOne(`${SELECT} WHERE r.id = $1`, [report!.id]);
    return { report: full };
  });

  app.patch('/reports/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({
        title: z.string().max(2000).optional(),
        contractNumber: z.string().max(120).nullable().optional(),
        periodFrom: dateStr.optional(),
        periodTo: dateStr.optional(),
        showState: z.boolean().optional(),
      }),
      req.body,
    );
    const current = await queryOne<{ status: string }>('SELECT status FROM reports WHERE id = $1', [id]);
    if (!current) throw new HttpError(404, 'Relatório não encontrado.');
    if (current.status !== 'draft') throw new HttpError(400, 'Relatório já enviado para assinatura não pode ser editado.');

    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    const add = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (body.title !== undefined) add('title', body.title);
    if (body.contractNumber !== undefined) add('contract_number', body.contractNumber || null);
    if (body.periodFrom !== undefined) add('period_from', body.periodFrom);
    if (body.periodTo !== undefined) add('period_to', body.periodTo);
    if (body.showState !== undefined) add('show_state', body.showState);
    params.push(id);
    await query(`UPDATE reports SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    const full = await queryOne(`${SELECT} WHERE r.id = $1`, [id]);
    return { report: full };
  });

  app.delete('/reports/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const r = await queryOne<{ created_by: string; number: number; project_id: string }>(
      'SELECT created_by, number, project_id FROM reports WHERE id = $1',
      [id],
    );
    if (!r) throw new HttpError(404, 'Relatório não encontrado.');
    if (req.user.role !== 'admin' && r.created_by !== req.user.sub) {
      throw new HttpError(403, 'Você só pode excluir relatórios que você mesmo criou.');
    }
    await query('DELETE FROM reports WHERE id = $1', [id]);
    await logActivity({
      userId: req.user.sub,
      action: 'report.delete',
      entityType: 'report',
      entityId: id,
      summary: `Excluiu o relatório fotográfico nº ${String(r.number).padStart(3, '0')}`,
      meta: { projectId: r.project_id },
    });
    return { ok: true };
  });

  // Gera e baixa o PDF
  app.get('/reports/:id/pdf', auth, async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const r = await queryOne<Row>(`${SELECT} WHERE r.id = $1`, [id]);
    if (!r) throw new HttpError(404, 'Relatório não encontrado.');
    const pdf = await buildPdf(r);
    const filename = `relatorio-fotografico-${String(r.number).padStart(3, '0')}.pdf`;
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(pdf);
  });

  // Envia o PDF para assinatura no ZapSign
  app.post('/reports/:id/sign', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const body = parse(
      z.object({ signerName: z.string().min(2).optional(), signerEmail: z.string().email().optional() }),
      req.body ?? {},
    );
    const r = await queryOne<Row>(`${SELECT} WHERE r.id = $1`, [id]);
    if (!r) throw new HttpError(404, 'Relatório não encontrado.');

    const signerName = body.signerName || config.ZAPSIGN_SIGNER_NAME;
    const signerEmail = body.signerEmail || config.ZAPSIGN_SIGNER_EMAIL;
    if (!signerName || !signerEmail) throw new HttpError(400, 'Informe o nome e o e-mail do signatário.');

    const pdf = await buildPdf(r);
    const result = await sendForSignature({
      name: `Relatório fotográfico nº ${String(r.number).padStart(3, '0')} — ${r.project_name}`,
      base64Pdf: pdf.toString('base64'),
      signerName,
      signerEmail,
    });

    await query(
      `UPDATE reports SET status = 'pending_signature', zapsign_token = $1, zapsign_sign_url = $2, updated_at = now() WHERE id = $3`,
      [result.docToken, result.signUrl, id],
    );
    await logActivity({
      userId: req.user.sub,
      action: 'report.sign',
      entityType: 'report',
      entityId: id,
      summary: `Enviou o relatório nº ${String(r.number).padStart(3, '0')} para assinatura (ZapSign)`,
      meta: { projectId: r.project_id },
    });
    const full = await queryOne(`${SELECT} WHERE r.id = $1`, [id]);
    return { report: full, signUrl: result.signUrl };
  });

  // Consulta o status no ZapSign e atualiza
  app.post('/reports/:id/refresh-status', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const r = await queryOne<{ zapsign_token: string | null }>('SELECT zapsign_token FROM reports WHERE id = $1', [id]);
    if (!r) throw new HttpError(404, 'Relatório não encontrado.');
    if (!r.zapsign_token) throw new HttpError(400, 'Relatório ainda não foi enviado para assinatura.');

    const { status, signedAt } = await getDocStatus(r.zapsign_token);
    const mapped = mapStatus(status);
    await query(`UPDATE reports SET status = $1, signed_at = $2, updated_at = now() WHERE id = $3`, [
      mapped,
      mapped === 'signed' ? (signedAt ?? new Date().toISOString()) : null,
      id,
    ]);
    const full = await queryOne(`${SELECT} WHERE r.id = $1`, [id]);
    return { report: full };
  });

  // Webhook do ZapSign (sem auth): atualiza o status quando o documento é assinado
  app.post('/reports/zapsign/webhook', async (req) => {
    const body = (req.body ?? {}) as { token?: string; status?: string; signed_at?: string };
    if (!body.token) return { ok: true };
    const mapped = mapStatus(body.status ?? '');
    await query(
      `UPDATE reports SET status = $1, signed_at = $2, updated_at = now() WHERE zapsign_token = $3`,
      [mapped, mapped === 'signed' ? (body.signed_at ?? new Date().toISOString()) : null, body.token],
    );
    return { ok: true };
  });
}
