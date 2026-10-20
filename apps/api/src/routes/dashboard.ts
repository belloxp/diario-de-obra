import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { monthRange, parse, uuid } from '../http.js';

function currentMonthSP() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}`;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: app.authenticate }, async (req) => {
    const q = parse(
      z.object({ projectId: uuid, month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
      req.query,
    );
    const month = q.month ?? currentMonthSP();
    const { from, to } = monthRange(month);
    const tz = `(p.taken_at AT TIME ZONE 'America/Sao_Paulo')::date`;

    const [photos, diary, rainDaily, byCategory] = await Promise.all([
      queryOne<{ month: number; total: number }>(
        `SELECT count(*) FILTER (WHERE ${tz} BETWEEN $2::date AND $3::date)::int AS month, count(*)::int AS total
         FROM photos p WHERE p.project_id = $1`,
        [q.projectId, from, to],
      ),
      queryOne<{ month: number; total: number }>(
        `SELECT count(*) FILTER (WHERE entry_date BETWEEN $2 AND $3)::int AS month, count(*)::int AS total
         FROM diary_entries WHERE project_id = $1`,
        [q.projectId, from, to],
      ),
      query<{ date: string; mm: number }>(
        `SELECT record_date AS date, mm FROM rain_records
         WHERE project_id = $1 AND record_date BETWEEN $2 AND $3 ORDER BY record_date`,
        [q.projectId, from, to],
      ),
      query<{ name: string; count: number }>(
        `SELECT COALESCE(c.name, 'Sem categoria') AS name, count(*)::int AS count
         FROM photos p LEFT JOIN photo_categories c ON c.id = p.category_id
         WHERE p.project_id = $1 AND ${tz} BETWEEN $2::date AND $3::date
         GROUP BY 1 ORDER BY count DESC, name`,
        [q.projectId, from, to],
      ),
    ]);

    const isAdmin = req.user.role === 'admin';
    const recent = await query(
      `SELECT a.id, a.action, a.summary, a.created_at, u.name AS user_name
       FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.action <> 'auth.login' ${isAdmin ? '' : 'AND a.user_id = $1'}
       ORDER BY a.created_at DESC LIMIT 8`,
      isAdmin ? [] : [req.user.sub],
    );

    const rainyDays = rainDaily.filter((r) => r.mm > 0).length;
    const totalMm = Math.round(rainDaily.reduce((s, r) => s + r.mm, 0) * 10) / 10;

    return {
      month,
      from,
      to,
      photos: { month: photos?.month ?? 0, total: photos?.total ?? 0 },
      diary: { month: diary?.month ?? 0, total: diary?.total ?? 0 },
      rain: { totalMm, rainyDays, daily: rainDaily },
      photosByCategory: byCategory,
      recentActivity: recent,
    };
  });
}
