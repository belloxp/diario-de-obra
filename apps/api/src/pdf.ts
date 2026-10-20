import { existsSync, readFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { getObjectBytes } from './r2.js';

// Dados fixos da empresa contratada (aparecem na capa). Ajuste aqui se mudar.
const COMPANY = {
  razao: 'JB PROJETOS E ENGENHARIA LTDA',
  responsavel: 'JUAN BELLO',
  cargo: 'ENGENHEIRO CIVIL',
  crea: 'CREA 129.012-0',
};
const DOC_TITLE = 'RELATÓRIO FOTOGRÁFICO';
const STATE_HEADER = 'GOVERNO DO ESTADO DE SANTA CATARINA';

// Logos (placeholders até você soltar os oficiais nesses caminhos)
const JB_LOGO = new URL('../../web/public/brand/logo-black.png', import.meta.url);
const SC_LOGO = new URL('../../web/public/brand/estado-sc.png', import.meta.url);

export interface ReportData {
  number: number;
  title: string;
  contract_number: string | null;
  period_from: string;
  period_to: string;
  show_state: boolean;
  project_name: string;
  status: string;
  signed_at: string | null;
}

export interface ReportPhoto {
  category_name: string | null;
  taken_at: string;
  note: string;
  r2_key: string;
  mime_type: string | null;
}

const TZ = 'America/Sao_Paulo';
const fmtDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};
const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

function loadLogo(url: URL): Buffer | null {
  try {
    return existsSync(url) ? readFileSync(url) : null;
  } catch {
    return null;
  }
}

/** Bandeira de SC simplificada (placeholder) enquanto o arquivo oficial não é adicionado. */
function drawScPlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  const band = h / 3;
  doc.save();
  doc.rect(x, y, w, h).fill('#c6322d'); // fundo vermelho
  doc.rect(x, y + band, w, band).fill('#ffffff'); // faixa branca central
  // losango verde-limão central
  const cx = x + w / 2;
  const cy = y + h / 2;
  doc
    .moveTo(cx, y + 4)
    .lineTo(x + w - 6, cy)
    .lineTo(cx, y + h - 4)
    .lineTo(x + 6, cy)
    .fill('#9ac63f');
  doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold').text('SC', x, cy - 4, { width: w, align: 'center' });
  doc.restore();
}

function drawLogos(doc: PDFKit.PDFDocument, logos: { jb: Buffer | null; sc: Buffer | null }, showState: boolean, big: boolean) {
  const m = doc.page.margins.left;
  const top = m;
  const h = big ? 54 : 38;
  const w = big ? 150 : 110;
  // SC à esquerda
  if (showState) {
    if (logos.sc) {
      try {
        doc.image(logos.sc, m, top, { fit: [w, h] });
      } catch {
        drawScPlaceholder(doc, m, top, w * 0.62, h);
      }
    } else {
      drawScPlaceholder(doc, m, top, w * 0.62, h);
    }
  }
  // JB à direita
  const right = doc.page.width - m - w;
  if (logos.jb) {
    try {
      doc.image(logos.jb, right, top, { fit: [w, h], align: 'right', valign: 'center' });
    } catch {
      /* ignora */
    }
  }
  return top + h + 14; // y após o cabeçalho
}

export async function generateReportPdf(report: ReportData, photos: ReportPhoto[]): Promise<Buffer> {
  const logos = { jb: loadLogo(JB_LOGO), sc: loadLogo(SC_LOGO) };

  // baixa todas as imagens antes (o desenho do pdfkit é síncrono)
  const bytes = await Promise.all(photos.map((p) => getObjectBytes(p.r2_key)));
  const imageByKey = new Map(photos.map((p, i) => [p.r2_key, bytes[i]]));

  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const M = doc.page.margins.left;
  const PAGE_W = doc.page.width;
  const PAGE_H = doc.page.height;
  const CONTENT_W = PAGE_W - M * 2;

  // ---------- CAPA ----------
  drawLogos(doc, logos, report.show_state, true);
  let y = M + 54 + 30;

  const center = (text: string, opts: { size: number; bold?: boolean; gap?: number; color?: string }) => {
    doc
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size)
      .fillColor(opts.color ?? '#101216')
      .text(text, M, y, { width: CONTENT_W, align: 'center' });
    y = doc.y + (opts.gap ?? 10);
  };

  center(STATE_HEADER, { size: 12, bold: true, gap: 22 });
  if (report.title) center(report.title.toUpperCase(), { size: 9.5, bold: true, gap: 14 });
  if (report.contract_number) center(`CONTRATO ${report.contract_number}`, { size: 11, bold: true, gap: 40 });
  else y += 26;

  center(DOC_TITLE, { size: 20, bold: true, gap: 8 });
  center('Período', { size: 10, gap: 2, color: '#6b717b' });
  center(`${fmtDate(report.period_from)} à ${fmtDate(report.period_to)}`, { size: 12, bold: true, gap: 50 });

  center('Empresa Contratada:', { size: 10, color: '#6b717b', gap: 4 });
  center(COMPANY.razao, { size: 12, bold: true, gap: 3 });
  center(`${COMPANY.responsavel} - ${COMPANY.cargo} - ${COMPANY.crea}`, { size: 10, gap: 30 });

  // bloco de assinatura
  const signText =
    report.status === 'signed' && report.signed_at
      ? `Assinado digitalmente via ZapSign em ${fmtDateTime(report.signed_at)}`
      : report.status === 'pending_signature'
        ? 'Aguardando assinatura digital (ZapSign)'
        : 'Documento sujeito a assinatura digital (ZapSign)';
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(report.status === 'signed' ? '#15803d' : '#6b717b')
    .text(signText, M, y, { width: CONTENT_W, align: 'center' });

  // número do relatório no rodapé da capa
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#101216')
    .text(`RELATÓRIO ${String(report.number).padStart(3, '0')}`, M, PAGE_H - M - 40, { width: CONTENT_W, align: 'center' });

  // ---------- PÁGINAS DE FOTOS ----------
  // agrupa: "Geral"/sem categoria primeiro (sem título), depois as demais categorias
  const groups = new Map<string, ReportPhoto[]>();
  for (const p of photos) {
    const cat = p.category_name && p.category_name !== 'Geral' ? p.category_name : '';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(p);
  }
  const orderedKeys = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'pt-BR')));

  const GAP = 16;
  const COL_W = (CONTENT_W - GAP) / 2;
  const IMG_H = COL_W * 0.72;
  const CAP_H = 26;
  const CELL_H = IMG_H + CAP_H;
  const ROW_GAP = 16;
  const BANNER_H = 26;

  const newPage = () => {
    doc.addPage();
    return drawLogos(doc, logos, report.show_state, false);
  };

  if (photos.length > 0) {
    y = newPage();

    for (const key of orderedKeys) {
      const list = groups.get(key)!;

      // título da categoria (exceto Geral/sem categoria)
      if (key) {
        if (y + BANNER_H + CELL_H > PAGE_H - M) y = newPage();
        doc.save();
        doc.roundedRect(M, y, CONTENT_W, BANNER_H, 5).fill('#eceef1');
        doc
          .fillColor('#101216')
          .font('Helvetica-Bold')
          .fontSize(11)
          .text(`| ${key} |`, M + 12, y + 7, { width: CONTENT_W - 24 });
        doc.restore();
        y += BANNER_H + 12;
      }

      for (let i = 0; i < list.length; i++) {
        const col = i % 2;
        if (col === 0) {
          if (y + CELL_H > PAGE_H - M) y = newPage();
        }
        const x = M + col * (COL_W + GAP);
        drawPhotoCell(doc, x, y, COL_W, IMG_H, CAP_H, list[i], imageByKey.get(list[i].r2_key) ?? null);
        if (col === 1 || i === list.length - 1) y += CELL_H + ROW_GAP;
      }
    }
  }

  doc.end();
  return done;
}

function drawPhotoCell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  imgH: number,
  capH: number,
  photo: ReportPhoto,
  img: Buffer | null,
) {
  // moldura da imagem
  doc.save();
  doc.roundedRect(x, y, w, imgH, 6).fill('#eef0f2');
  let drawn = false;
  if (img) {
    try {
      doc.save();
      doc.roundedRect(x, y, w, imgH, 6).clip();
      doc.image(img, x, y, { cover: [w, imgH], align: 'center', valign: 'center' });
      doc.restore();
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn) {
    doc
      .fillColor('#9aa1ab')
      .font('Helvetica')
      .fontSize(8)
      .text('(foto indisponível localmente)', x, y + imgH / 2 - 5, { width: w, align: 'center' });
  }
  doc.restore();

  // legenda: data/hora + observação
  doc.fillColor('#6b717b').font('Helvetica-Bold').fontSize(8).text(fmtDateTime(photo.taken_at), x, y + imgH + 4, { width: w });
  if (photo.note) {
    doc
      .fillColor('#3a3f47')
      .font('Helvetica')
      .fontSize(8)
      .text(photo.note, x, y + imgH + 14, { width: w, height: capH - 12, ellipsis: true, lineBreak: true });
  }
}
