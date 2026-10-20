import { config } from './config.js';
import { HttpError } from './http.js';

export interface ZapSignResult {
  docToken: string;
  signUrl: string | null;
  status: string;
}

function headers() {
  if (!config.ZAPSIGN_API_TOKEN) {
    throw new HttpError(400, 'ZapSign não configurado. Defina ZAPSIGN_API_TOKEN no .env da API.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.ZAPSIGN_API_TOKEN}`,
  };
}

/** Cria um documento no ZapSign a partir do PDF e abre a solicitação de assinatura. */
export async function sendForSignature(opts: {
  name: string;
  base64Pdf: string;
  signerName: string;
  signerEmail: string;
}): Promise<ZapSignResult> {
  const res = await fetch(`${config.ZAPSIGN_API_URL}/docs/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: opts.name,
      base64_pdf: opts.base64Pdf,
      lang: 'pt-br',
      signers: [{ name: opts.signerName, email: opts.signerEmail }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new HttpError(502, `Falha no ZapSign (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { token: string; status?: string; signers?: { sign_url?: string }[] };
  return { docToken: data.token, signUrl: data.signers?.[0]?.sign_url ?? null, status: data.status ?? 'pending' };
}

/** Consulta o status atual de um documento no ZapSign. */
export async function getDocStatus(docToken: string): Promise<{ status: string; signedAt: string | null }> {
  const res = await fetch(`${config.ZAPSIGN_API_URL}/docs/${docToken}/`, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new HttpError(502, `Falha no ZapSign (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { status: string; signers?: { signed_at?: string | null }[] };
  const signedAt = data.signers?.find((s) => s.signed_at)?.signed_at ?? null;
  return { status: data.status, signedAt };
}

/** Normaliza o status do ZapSign para o nosso enum. */
export function mapStatus(zap: string): 'pending_signature' | 'signed' {
  return zap === 'signed' ? 'signed' : 'pending_signature';
}
