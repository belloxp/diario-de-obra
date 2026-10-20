import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa ter ao menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Cloudflare R2 (API compatível com S3)
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID é obrigatório'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID é obrigatório'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY é obrigatório'),
  R2_BUCKET: z.string().min(1, 'R2_BUCKET é obrigatório'),

  // Correção de texto (LanguageTool). Aponte para uma instância própria se quiser sem limite.
  LANGUAGETOOL_URL: z.string().default('https://api.languagetool.org/v2/check'),

  // Admin inicial (criado apenas se não existir nenhum usuário)
  SEED_ADMIN_NAME: z.string().optional(),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),

  // ZapSign (assinatura digital dos relatórios)
  ZAPSIGN_API_TOKEN: z.string().optional(),
  ZAPSIGN_API_URL: z.string().default('https://api.zapsign.com.br/api/v1'),
  ZAPSIGN_SIGNER_NAME: z.string().optional(),
  ZAPSIGN_SIGNER_EMAIL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
