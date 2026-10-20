import { z, ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw result.error;
  return result.data;
}

export function formatZodError(err: ZodError) {
  const first = err.issues[0];
  const path = first?.path.join('.') || 'campo';
  return `Dados inválidos (${path}): ${first?.message ?? 'verifique os campos'}`;
}

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD');
export const uuid = z.string().uuid();

/** Primeiro e último dia do mês (YYYY-MM) como strings de data. */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
