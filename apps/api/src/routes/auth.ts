import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from '../activity.js';
import { query, queryOne } from '../db.js';
import { parse } from '../http.js';

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parse(z.object({ email: z.string().min(3), password: z.string().min(1) }), req.body);
      const user = await queryOne<{
        id: string;
        name: string;
        email: string;
        role: 'admin' | 'member';
        password_hash: string;
        active: boolean;
      }>('SELECT id, name, email, role, password_hash, active FROM users WHERE email = $1', [
        body.email.trim().toLowerCase(),
      ]);

      const ok = user ? await bcrypt.compare(body.password, user.password_hash) : false;
      if (!user || !ok) return reply.code(401).send({ error: 'E-mail ou senha incorretos.' });
      if (!user.active) return reply.code(403).send({ error: 'Usuário desativado. Fale com o administrador.' });

      await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
      await logActivity({ userId: user.id, action: 'auth.login', summary: 'Entrou no sistema' });

      const token = app.jwt.sign({ sub: user.id, role: user.role, name: user.name });
      return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    },
  );

  app.get('/auth/me', { preHandler: app.authenticate }, async (req) => {
    const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.sub]);
    return { user };
  });

  app.post('/auth/change-password', { preHandler: app.authenticate }, async (req, reply) => {
    const body = parse(
      z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'mínimo de 8 caracteres') }),
      req.body,
    );
    const user = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [
      req.user.sub,
    ]);
    if (!user || !(await bcrypt.compare(body.currentPassword, user.password_hash))) {
      return reply.code(400).send({ error: 'Senha atual incorreta.' });
    }
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      await bcrypt.hash(body.newPassword, 12),
      req.user.sub,
    ]);
    await logActivity({ userId: req.user.sub, action: 'auth.password', summary: 'Alterou a própria senha' });
    return { ok: true };
  });
}
