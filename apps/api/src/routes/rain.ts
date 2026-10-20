import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../activity.js';
import { query, queryOne } from '../db.js';
import { dateStr, HttpError, parse, uuid } from '../http.js';

const SELECT = `
  SELECT r.id, r.project_id, r.record_date, r.mm, r.condition, r.note, r.created_at, r.updated_at,
         r.created_by, cu.name AS created_by_name, uu.name AS updated_by_name
  FROM rain_records r
  LEFT JOIN users cu ON cu.id = r.created_by
  LEFT JOIN users uu ON uu.id = r.updated_by
`;

const CONDITIONS = ['rain', 'impractical', 'good'] as const;
const CONDITION_LABEL: Record<string, string> = {
  rain: 'Chuva',
  impractical: 'Impraticável',
  good: 'Tempo bom',
};

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const fmt = (d: string) => d.split('-').reverse().join('/');
const mmFmt = (mm: number) => `${String(mm).replace('.', ',')} mm`;

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const rangeSchema = z.object({ projectId: uuid, from: dateStr, to: dateStr });

export async function rainRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  app.get('/rain', auth, async (req) => {
    const q = parse(rangeSchema, req.query);
    const records = await query(
      `${SELECT} WHERE r.project_id = $1 AND r.record_date BETWEEN $2 AND $3 ORDER BY r.record_date`,
      [q.projectId, q.from, q.to],
    );
    return { records };
  });

  // Cria ou atualiza o registro do dia (um por dia por obra)
  app.put('/rain', auth, async (req) => {
    const body = parse(
      z.object({
        projectId: uuid,
        recordDate: dateStr,
        condition: z.enum(CONDITIONS).default('rain'),
        mm: z.number().min(0).max(1000).default(0),
        note: z.string().max(1000).default(''),
      }),
      req.body,
    );
    // mm só faz sentido em dia de chuva
    const mm = body.condition === 'rain' ? body.mm : 0;
    const project = await queryOne('SELECT 1 FROM projects WHERE id = $1', [body.projectId]);
    if (!project) throw new HttpError(404, 'Obra não encontrada.');

    const before = await queryOne<{ condition: string }>(
      'SELECT condition FROM rain_records WHERE project_id = $1 AND record_date = $2',
      [body.projectId, body.recordDate],
    );
    const row = await queryOne<{ id: string }>(
      `INSERT INTO rain_records (project_id, record_date, mm, condition, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, record_date)
       DO UPDATE SET mm = EXCLUDED.mm, condition = EXCLUDED.condition, note = EXCLUDED.note, updated_by = $6, updated_at = now()
       RETURNING id`,
      [body.projectId, body.recordDate, mm, body.condition, body.note, req.user.sub],
    );
    const [record] = await query(`${SELECT} WHERE r.id = $1`, [row!.id]);
    const label = CONDITION_LABEL[body.condition];
    const detail = body.condition === 'rain' ? `: ${mmFmt(mm)}` : '';
    await logActivity({
      userId: req.user.sub,
      action: before ? 'rain.update' : 'rain.create',
      entityType: 'rain',
      entityId: row!.id,
      summary: `${before ? 'Alterou o dia' : 'Marcou'} ${fmt(body.recordDate)} como "${label}"${detail}`,
    });
    return { record };
  });

  app.delete('/rain/:id', auth, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const current = await queryOne<{ created_by: string; record_date: string }>(
      'SELECT created_by, record_date FROM rain_records WHERE id = $1',
      [id],
    );
    if (!current) throw new HttpError(404, 'Registro não encontrado.');
    if (req.user.role !== 'admin' && current.created_by !== req.user.sub) {
      throw new HttpError(403, 'Você só pode remover marcações que você mesmo fez.');
    }
    await query('DELETE FROM rain_records WHERE id = $1', [id]);
    await logActivity({
      userId: req.user.sub,
      action: 'rain.delete',
      entityType: 'rain',
      entityId: id,
      summary: `Removeu a marcação de chuva de ${fmt(current.record_date)}`,
    });
    return { ok: true };
  });

  // Exporta planilha .xlsx com todos os dias do período
  app.get('/rain/export', auth, async (req, reply) => {
    const q = parse(rangeSchema, req.query);
    const days = eachDay(q.from, q.to);
    if (!days.length || days.length > 366) throw new HttpError(400, 'Período inválido (máximo de 366 dias).');

    const project = await queryOne<{ name: string; contract_number: string | null }>(
      'SELECT name, contract_number FROM projects WHERE id = $1',
      [q.projectId],
    );
    if (!project) throw new HttpError(404, 'Obra não encontrada.');

    const records = await query<{
      record_date: string;
      mm: number;
      condition: string;
      note: string;
      created_by_name: string | null;
    }>(`${SELECT} WHERE r.project_id = $1 AND r.record_date BETWEEN $2 AND $3`, [q.projectId, q.from, q.to]);
    const byDate = new Map(records.map((r) => [r.record_date, r]));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Diário de Obra';
    const ws = wb.addWorksheet('Controle pluviométrico', { views: [{ state: 'frozen', ySplit: 4 }] });

    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = 'CONTROLE PLUVIOMÉTRICO';
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `${project.name}${project.contract_number ? ` — Contrato ${project.contract_number}` : ''}`;
    ws.mergeCells('A3:F3');
    ws.getCell('A3').value = `Período: ${fmt(q.from)} a ${fmt(q.to)}`;

    const header = ws.getRow(4);
    header.values = ['Data', 'Dia da semana', 'Condição', 'Precipitação (mm)', 'Observação', 'Registrado por'];
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };

    // cores por condição (tons claros para o texto ficar legível)
    const FILL: Record<string, string> = {
      rain: 'FFF8CBCB', // vermelho claro
      impractical: 'FFFDE9A8', // amarelo claro
      good: 'FFCFE2FF', // azul claro
    };

    days.forEach((day) => {
      const rec = byDate.get(day);
      const condition = rec?.condition ?? '';
      const row = ws.addRow([
        new Date(`${day}T12:00:00Z`),
        WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()],
        rec ? CONDITION_LABEL[condition] : '',
        rec && condition === 'rain' ? rec.mm : rec ? 0 : '',
        rec?.note ?? '',
        rec?.created_by_name ?? '',
      ]);
      row.getCell(1).numFmt = 'dd/mm/yyyy';
      row.getCell(4).numFmt = '0.0';
      row.getCell(3).alignment = { horizontal: 'center' };
      const fill = FILL[condition];
      if (fill) {
        row.eachCell((c) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        });
      }
    });

    const first = 5;
    const last = 4 + days.length;
    const total = ws.addRow([
      'TOTAL',
      '',
      `=COUNTIF(C${first}:C${last},"Chuva")`,
      `=SUM(D${first}:D${last})`,
      `=COUNTIF(C${first}:C${last},"Impraticável")`,
      '',
    ]);
    total.font = { bold: true };
    total.getCell(3).numFmt = '0" dia(s) de chuva"';
    total.getCell(4).numFmt = '0.0" mm"';
    total.getCell(5).numFmt = '0" dia(s) impraticável(is)"';
    total.getCell(3).alignment = { horizontal: 'center' };

    ws.columns = [{ width: 13 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 44 }, { width: 24 }];

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = `controle-pluviometrico_${q.from}_a_${q.to}.xlsx`;
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  });
}
