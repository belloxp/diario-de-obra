import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { setupAuth } from './auth.js';
import { migrate, seedAdmin } from './bootstrap.js';
import { config } from './config.js';
import { pool } from './db.js';
import { formatZodError, HttpError } from './http.js';
import { activityRoutes } from './routes/activity.js';
import { authRoutes } from './routes/auth.js';
import { categoryRoutes } from './routes/categories.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { diaryRoutes } from './routes/diary.js';
import { photoRoutes } from './routes/photos.js';
import { projectRoutes } from './routes/projects.js';
import { rainRoutes } from './routes/rain.js';
import { reportRoutes } from './routes/reports.js';
import { spellcheckRoutes } from './routes/spellcheck.js';
import { userRoutes } from './routes/users.js';

const app = Fastify({
  logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
  trustProxy: true,
});

await app.register(cors, {
  origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposedHeaders: ['Content-Disposition'],
});
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
await setupAuth(app);

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: formatZodError(err) });
  if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
  app.log.error(err);
  return reply.code(500).send({ error: 'Erro interno. Tente novamente em instantes.' });
});

app.get('/health', async () => ({ ok: true }));

await app.register(
  async (api) => {
    await api.register(authRoutes);
    await api.register(userRoutes);
    await api.register(activityRoutes);
    await api.register(projectRoutes);
    await api.register(categoryRoutes);
    await api.register(photoRoutes);
    await api.register(diaryRoutes);
    await api.register(rainRoutes);
    await api.register(reportRoutes);
    await api.register(spellcheckRoutes);
    await api.register(dashboardRoutes);
  },
  { prefix: '/api' },
);

await migrate();
await seedAdmin(app.log);

const close = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

await app.listen({ port: config.PORT, host: config.HOST });
