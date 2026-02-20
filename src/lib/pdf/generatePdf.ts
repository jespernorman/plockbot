/**
 * Genererar plocklista-PDF: antingen ny från scratch (generatePlocklistaPdf)
 * eller fyll i original-PDF med endast LEV. ANTAL (fillOriginalPdfWithLevAntal).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PageRowPositions } from './parsePdf';
import type { OrderLineWithPickPlan } from '../rules/types';

export interface OrderMeta {
  orderId?: string;
  date?: string;
  customerId?: string;
  deliveryAddress?: string;
  invoiceAddress?: string;
  deliveryDate?: string;
  returnDate?: string;
  deliveryTime?: string;
  returnTime?: string;
  deliveryConditions?: string;
  deliveryReference?: string;
  returnContact?: string;
  ourReference?: string;
  yourReference?: string;
  phone?: string;
}

export type ProcessedOrder = OrderMeta & { lines: OrderLineWithPickPlan[] };

const FONT_SIZE = 9;
const FONT_SMALL = 8;
const MARGIN = 45;
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

function drawText(page: any, font: any, text: string, x: number, y: number, size: number = FONT_SIZE) {
  if (text.length > 35) text = text.slice(0, 32) + '...';
  page.drawText(text, { x, y, size, font });
}

export async function generatePlocklistaPdf(
  orders: ProcessedOrder[],
  title: string = 'Plocklista'
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let orderIndex = 0; orderIndex < orders.length; orderIndex++) {
    const order = orders[orderIndex];
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - 45;

    page.drawText('STHLM BORDS UTHYRNING', { x: MARGIN, y, size: 12, font: fontBold });
    page.drawText(title, { x: PAGE_WIDTH - MARGIN - 80, y, size: 14, font: fontBold });
    page.drawText(`${orderIndex + 1} (${orders.length})`, { x: PAGE_WIDTH - MARGIN - 25, y: y - 14, size: FONT_SMALL, font });
    y -= 28;

    page.drawText(`Datum ${order.date ?? '—'}`, { x: MARGIN, y, size: FONT_SIZE, font });
    page.drawText(`Ordernummer ${order.orderId ?? '—'}`, { x: MARGIN + 100, y, size: FONT_SIZE, font });
    page.drawText(`Kundnummer ${order.customerId ?? '—'}`, { x: MARGIN + 220, y, size: FONT_SIZE, font });
    y -= 20;

    const boxHeight = 52;
    const boxWidth = (PAGE_WIDTH - 2 * MARGIN - 12) / 2;
    page.drawRectangle({ x: MARGIN, y: y - boxHeight, width: boxWidth, height: boxHeight, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
    page.drawRectangle({ x: MARGIN + boxWidth + 12, y: y - boxHeight, width: boxWidth, height: boxHeight, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
    page.drawText('Leveransadress', { x: MARGIN + 4, y: y - 12, size: FONT_SMALL, font: fontBold });
    page.drawText('Fakturaadress', { x: MARGIN + boxWidth + 16, y: y - 12, size: FONT_SMALL, font: fontBold });
    const levLines = (order.deliveryAddress ?? '—').split(/\n|(?<=.)\s{2,}/).slice(0, 4);
    levLines.forEach((line, i) => page.drawText(line.slice(0, 28), { x: MARGIN + 4, y: y - 22 - i * 10, size: FONT_SMALL, font }));
    const invLines = (order.invoiceAddress ?? '—').replace(/\s+/g, ' ').match(/.{1,28}/g)?.slice(0, 4) ?? ['—'];
    invLines.forEach((line, i) => page.drawText(line, { x: MARGIN + boxWidth + 16, y: y - 22 - i * 10, size: FONT_SMALL, font }));
    y -= boxHeight + 14;

    page.drawText(`Leveransreferens ${order.deliveryReference ?? '—'}`, { x: MARGIN, y, size: FONT_SMALL, font });
    page.drawText(`Telefon ${order.phone ?? '—'}`, { x: MARGIN, y: y - 12, size: FONT_SMALL, font });
    page.drawText(`Vår referens ${order.ourReference ?? '—'}`, { x: MARGIN, y: y - 24, size: FONT_SMALL, font });
    page.drawText(`Er referens ${order.yourReference ?? '—'}`, { x: MARGIN + 200, y, size: FONT_SMALL, font });
    page.drawText(`Telefon ${order.phone ?? '—'}`, { x: MARGIN + 200, y: y - 12, size: FONT_SMALL, font });
    y -= 38;

    page.drawText(`Leveransdatum ${order.deliveryDate ?? '—'}`, { x: MARGIN, y, size: FONT_SMALL, font });
    page.drawText(`Leveranstid ${order.deliveryTime ?? '—'}`, { x: MARGIN, y: y - 12, size: FONT_SMALL, font });
    page.drawText(`Returdatum ${order.returnDate ?? '—'}`, { x: MARGIN + 160, y, size: FONT_SMALL, font });
    page.drawText(`Hämttid ${order.returnTime ?? '—'}`, { x: MARGIN + 160, y: y - 12, size: FONT_SMALL, font });
    page.drawText(`Leveransvillkor ${order.deliveryConditions ?? '—'}`, { x: MARGIN + 320, y, size: FONT_SMALL, font });
    y -= 28;

    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= 18;

    page.drawText('Artikel-kod', { x: MARGIN, y, size: FONT_SIZE, font: fontBold });
    page.drawText('Benämning', { x: MARGIN + 75, y, size: FONT_SIZE, font: fontBold });
    page.drawText('BEST. ANTAL', { x: MARGIN + 260, y, size: FONT_SIZE, font: fontBold });
    page.drawText('LEV. ANTAL', { x: MARGIN + 350, y, size: FONT_SIZE, font: fontBold });
    y -= 20;

    const ROW_HEIGHT = 20;
    let currentPage = page;
    for (const line of order.lines) {
      if (y < 80) {
        currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - 50;
        currentPage.drawText('(fortsättning)', { x: MARGIN, y, size: FONT_SMALL, font });
        y -= ROW_HEIGHT;
      }
      const desc = line.description.length > 38 ? line.description.slice(0, 35) + '...' : line.description;
      currentPage.drawText(line.articleCode, { x: MARGIN, y, size: FONT_SIZE, font });
      drawText(currentPage, font, desc, MARGIN + 75, y);
      currentPage.drawText(String(line.orderedQty), { x: MARGIN + 268, y, size: FONT_SIZE, font });
      currentPage.drawRectangle({
        x: MARGIN + 342,
        y: y - 3,
        width: 100,
        height: 16,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 0.5,
      });
      currentPage.drawText(line.noteText.slice(0, 14), { x: MARGIN + 346, y, size: FONT_SIZE, font });
      y -= ROW_HEIGHT;
    }

    y -= 20;
    if (y > 100) {
      page.drawText('Emballage på plats:', { x: MARGIN, y, size: FONT_SMALL, font });
      page.drawText('XL:', { x: MARGIN + 95, y, size: FONT_SMALL, font });
      page.drawText('L:', { x: MARGIN + 120, y, size: FONT_SMALL, font });
      page.drawText('M:', { x: MARGIN + 140, y, size: FONT_SMALL, font });
      page.drawText('S:', { x: MARGIN + 160, y, size: FONT_SMALL, font });
      page.drawText('A:', { x: MARGIN + 180, y, size: FONT_SMALL, font });
    }
  }

  return doc.save();
}

const FILL_FONT_SIZE = 8;

/** Kortar ner noteText så att det får plats i LEV. ANTAL-rutan (t.ex. "1 KA + 8 lösa" → "1 Ka+8"). */
function compactNoteTextForPdf(noteText: string): string {
  const t = noteText.trim();
  const kaLosa = t.match(/^(\d+)\s*KA\s*\+\s*(\d+)\s*lösa$/i);
  if (kaLosa) return `${kaLosa[1]} Ka+${kaLosa[2]}`;
  const baLosa = t.match(/^(\d+)\s*BA\s*\+\s*(\d+)\s*lösa$/i);
  if (baLosa) return `${baLosa[1]} Ba+${baLosa[2]}`;
  const kaOnly = t.match(/^(\d+)\s*KA$/i);
  if (kaOnly) return `${kaOnly[1]} Ka`;
  const baOnly = t.match(/^(\d+)\s*BA$/i);
  if (baOnly) return `${baOnly[1]} Ba`;
  return t.length > 10 ? t.slice(0, 10) : t;
}

function normalizeArticleCode(code: string): string {
  return (code || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Laddar original-PDF och skriver LEV. ANTAL i rätt ruta per artikelkod (match på kod, inte radindex). */
export async function fillOriginalPdfWithLevAntal(
  originalPdfBytes: ArrayBuffer,
  orders: ProcessedOrder[],
  positionsPerPage: PageRowPositions[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(originalPdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (let pageIndex = 0; pageIndex < pages.length && pageIndex < orders.length; pageIndex++) {
    const page = pages[pageIndex];
    const order = orders[pageIndex];
    const positions = positionsPerPage[pageIndex];
    if (!positions?.rows?.length || !order.lines.length) continue;

    const { rows, levAntalX } = positions;
    const usedLineIndices = new Set<number>();
    for (const row of rows) {
      const idx = order.lines.findIndex(
        (line, i) => !usedLineIndices.has(i) && normalizeArticleCode(line.articleCode) === normalizeArticleCode(row.articleCode)
      );
      if (idx < 0) continue;
      usedLineIndices.add(idx);
      const rawNote = order.lines[idx].noteText.trim();
      if (rawNote === '' || rawNote === '—') continue;
      const noteText = compactNoteTextForPdf(order.lines[idx].noteText);
      page.drawText(noteText, {
        x: levAntalX,
        y: row.y,
        size: FILL_FONT_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  return doc.save();
}
