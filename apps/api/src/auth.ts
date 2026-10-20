import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { queryOne } from './db.js';

export type Role = 'admin' | 'member';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role; name: string };
    user: { sub: string; role: Role; name: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function setupAuth(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
    // Garante que o usuário ainda existe e está ativo, e usa o papel atual do banco.
    const user = await queryOne<{ role: Role; active: boolean; name: string }>(
      'SELECT role, active, name FROM users WHERE id = $1',
      [req.user.sub],
    );
    if (!user || !user.active) {
      return reply.code(401).send({ error: 'Usuário desativado ou inexistente.' });
    }
    req.user.role = user.role;
    req.user.name = user.name;
  });

  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Apenas administradores podem executar esta ação.' });
    }
  });
}
