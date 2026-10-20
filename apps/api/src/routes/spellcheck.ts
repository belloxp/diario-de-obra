import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { HttpError, parse } from '../http.js';

type LTMatch = {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { id: string; category?: { id: string } };
};

/**
 * Correção de ortografia/acentuação com o LanguageTool (sem IA, sem custo por token).
 * Apenas SUGERE: o texto original nunca é alterado pelo servidor.
 */
export async function spellcheckRoutes(app: FastifyInstance) {
  app.post(
    '/spellcheck',
    { preHandler: app.authenticate, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const { text } = parse(z.object({ text: z.string().max(5000) }), req.body);
      if (!text.trim()) return { matches: [] };

      let res: Response;
      try {
        res = await fetch(config.LANGUAGETOOL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ text, language: 'pt-BR', enabledOnly: 'false' }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new HttpError(502, 'Serviço de correção indisponível no momento.');
      }
      if (!res.ok) throw new HttpError(502, 'Serviço de correção indisponível no momento.');

      const data = (await res.json()) as { matches: LTMatch[] };
      const matches = data.matches
        // só ortografia, acentuação, pontuação e digitação: nada de reescrita de estilo
        .filter((m) => {
          const cat = m.rule.category?.id ?? '';
          return ['TYPOS', 'PUNCTUATION', 'CASING', 'GRAMMAR', 'COMPOUNDING'].includes(cat) || m.rule.id.startsWith('MORFOLOGIK');
        })
        .filter((m) => m.replacements.length > 0)
        .map((m) => ({
          offset: m.offset,
          length: m.length,
          original: text.slice(m.offset, m.offset + m.length),
          message: m.shortMessage || m.message,
          replacements: m.replacements.slice(0, 5).map((r) => r.value),
          ruleId: m.rule.id,
        }));
      return { matches };
    },
  );
}
