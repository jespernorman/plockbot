/**
 * Extraherar text från PDF och tolkar plocklistor (orderrader med artikelkod + antal).
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

export interface ParsedOrderLine {
  articleCode: string;
  description: string;
  orderedQty: number;
}

export interface ParsedOrder {
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
  lines: ParsedOrderLine[];
}

/** Grupperar text per Y-rad (avrundad) och returnerar en sträng per sida med radbrytningar mellan rader. */
export async function extractTextFromPdfPerPage(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
  }).promise;
  const numPages = pdf.numPages;
  const parts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const yToStrs = new Map<number, string[]>();
    for (const item of content.items as any[]) {
      const str = item?.str;
      if (str == null) continue;
      const tr = item.transform;
      const y = tr && tr[5] != null ? Math.round(tr[5]) : 0;
      if (!yToStrs.has(y)) yToStrs.set(y, []);
      yToStrs.get(y)!.push(str);
    }
    const yKeys = Array.from(yToStrs.keys()).sort((a, b) => b - a);
    const lines = yKeys.map(y => yToStrs.get(y)!.join(' ').trim()).filter(Boolean);
    parts.push(lines.join('\n'));
  }
  return parts;
}

/** En sida → en order. Används för att parsa varje sida i en flersidig plocklista. */
function parsePlocklistaPageText(pageText: string): ParsedOrder {
  const order: ParsedOrder = { lines: [] };
  const lines = pageText.split(/\s+/).length ? pageText.split(/\n|\r/).map(l => l.trim()).filter(Boolean) : [];
  const text = pageText;

  const orderNumberMatch = text.match(/Ordernummer\s*[:\s]*(\d+)/i);
  const dateMatch = text.match(/Datum\s*[:\s]*(\d{4}-\d{2}-\d{2})/i);
  const customerMatch = text.match(/Kundnummer\s*[:\s]*(\d+)/i);
  const deliveryDateMatch = text.match(/Leveransdatum\s*[:\s]*(\d{4}-\d{2}-\d{2})/i);
  const returnDateMatch = text.match(/Returdatum\s*[:\s]*(\d{4}-\d{2}-\d{2})/i);
  const deliveryTimeMatch = text.match(/Leveranstid\s*[:\s]*([^\n]+?)(?=\s+Retur|$)/i);
  const returnTimeMatch = text.match(/Hämttid\s*[:\s]*([^\n]+?)(?=\s+Leveransvillkor|$)/i);
  const conditionsMatch = text.match(/Leveransvillkor\s*[:\s]*([^\n]+)/i);
  const deliveryRefMatch = text.match(/Leveransreferens\s*[:\s]*([^\n]+?)(?=\s+Telefon|$)/i);
  const ourRefMatch = text.match(/Vår referens\s*[:\s]*([^\n]+?)(?=\s+Er referens|$)/i);
  const yourRefMatch = text.match(/Er referens\s*[:\s]*([^\n]+?)(?=\s+Telefon|$)/i);
  const phoneMatch = text.match(/Telefon\s*[:\s]*([0-9\-\s]+)/i);
  if (orderNumberMatch) order.orderId = orderNumberMatch[1];
  if (dateMatch) order.date = dateMatch[1];
  if (customerMatch) order.customerId = customerMatch[1];
  if (deliveryDateMatch) order.deliveryDate = deliveryDateMatch[1];
  if (returnDateMatch) order.returnDate = returnDateMatch[1];
  if (deliveryTimeMatch) order.deliveryTime = deliveryTimeMatch[1].trim();
  if (returnTimeMatch) order.returnTime = returnTimeMatch[1].trim();
  if (conditionsMatch) order.deliveryConditions = conditionsMatch[1].trim();
  if (deliveryRefMatch) order.deliveryReference = deliveryRefMatch[1].trim();
  if (ourRefMatch) order.ourReference = ourRefMatch[1].trim();
  if (yourRefMatch) order.yourReference = yourRefMatch[1].trim();
  if (phoneMatch) order.phone = phoneMatch[1].trim();
  const levMatch = text.match(/Leveransadress\s*([\s\S]+?)(?=Fakturaadress|RETUR:|$)/i);
  const invMatch = text.match(/Fakturaadress\s*([\s\S]+?)(?=Leveransreferens|Er referens|$)/i);
  if (levMatch) order.deliveryAddress = levMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200);
  if (invMatch) order.invoiceAddress = invMatch[1].replace(/\s+/g, ' ').trim().slice(0, 200);

  /** Stoppa att läsa artikelrader när vi når Emballage-sektionen (där Port, Box etc. är etiketter, inte artiklar). */
  const stopAtEmballage = /Emballage\s*på\s*plats|Emballage\s*:/i;
  /** Ord som är etiketter i Emballage-sektionen, inte artikelkoder – ska inte tas med som rader. */
  const packagingLabels = new Set(['PORT', 'BOX', 'XL', 'L', 'M', 'S', 'A']);

  const articleRowRegex = /^([A-Z0-9]{2,12})\s+(.+?)\s+(\d+)\s*$/;
  for (const line of lines) {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (!trimmed || trimmed.length < 4) continue;
    if (stopAtEmballage.test(trimmed)) break;
    let match = trimmed.match(articleRowRegex);
    if (match) {
      const [, code, desc, qty] = match;
      const codeUpper = code!.trim().toUpperCase();
      if (packagingLabels.has(codeUpper)) continue;
      const num = parseInt(qty!, 10);
      if (Number.isNaN(num) || num < 0 || num > 100000) continue;
      order.lines.push({
        articleCode: code!.trim(),
        description: desc!.trim(),
        orderedQty: num,
      });
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    if (tokens.length >= 2) {
      const last = tokens[tokens.length - 1];
      const qty = parseInt(last, 10);
      if (!Number.isNaN(qty) && qty >= 0 && qty < 100000 && String(qty) === last) {
        const code = tokens[0].trim();
        if (packagingLabels.has(code.toUpperCase())) continue;
        if (/^[A-Z0-9]{2,12}$/i.test(code)) {
          order.lines.push({
            articleCode: code,
            description: tokens.length >= 3 ? tokens.slice(1, -1).join(' ').trim() : '',
            orderedQty: qty,
          });
        }
      }
    }
  }
  return order;
}

/** Parsar hela PDF:en – en order per sida (alla sidor gårs igenom). */
export async function parsePlocklistaPdf(file: File): Promise<ParsedOrder[]> {
  const pageTexts = await extractTextFromPdfPerPage(file);
  return pageTexts.map(parsePlocklistaPageText);
}

/** En rad i PDF: Y-koordinat och artikelkod så att rätt LEV. ANTAL skrivs i rätt ruta. */
export interface PdfRowPosition {
  y: number;
  articleCode: string;
}

/** Positioner för varje sida: varje tabellrad med Y + artikelkod, och X för LEV. ANTAL-kolumnen. */
export interface PageRowPositions {
  rows: PdfRowPosition[];
  levAntalX: number;
}

/** Hämtar text med koordinater per sida. Returnerar per rad Y + artikelkod så att fyllning matchar rätt artikel. */
export async function getRowPositionsForFill(file: File): Promise<PageRowPositions[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
  }).promise;
  const numPages = pdf.numPages;
  const result: PageRowPositions[] = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let maxXOfNumbers = 0;
    const yToItems = new Map<number, { str: string; x: number; y: number }[]>();

    for (const item of content.items as any[]) {
      if (!item.str || !item.transform) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      const yKey = Math.round(y);
      if (!yToItems.has(yKey)) yToItems.set(yKey, []);
      yToItems.get(yKey)!.push({ str: item.str, x, y });
      const n = parseInt(item.str, 10);
      if (!Number.isNaN(n) && n >= 0 && n < 100000 && item.str.trim() === String(n)) {
        if (x > maxXOfNumbers) maxXOfNumbers = x;
      }
    }

    const yKeys = Array.from(yToItems.keys()).sort((a, b) => b - a);
    const headerWords = /Artikel-kod|BEST\.\s*ANTAL|Benämning/i;
    const rows: PdfRowPosition[] = [];
    const articleCodeRe = /^[A-Z0-9]{2,12}$/i;

    for (const yKey of yKeys) {
      const items = yToItems.get(yKey)!;
      const lineText = items.map(i => i.str).join(' ');
      if (headerWords.test(lineText)) continue;
      const hasNumber = items.some(i => /^\d+$/.test(i.str.trim()));
      const hasArticleCode = items.some(i => articleCodeRe.test(i.str.trim()));
      if (!hasNumber || !hasArticleCode) continue;
      const sortedByX = [...items].sort((a, b) => a.x - b.x);
      const tokens = sortedByX.map(i => i.str.trim()).filter(Boolean);
      let articleCode = tokens.find(t => articleCodeRe.test(t)) ?? '';
      if (!articleCode && tokens.length >= 2) {
        const combined = tokens[0] + tokens[1];
        if (articleCodeRe.test(combined)) articleCode = combined;
      }
      if (articleCode) rows.push({ y: yKey, articleCode });
    }
    result.push({
      rows,
      levAntalX: maxXOfNumbers > 0 ? maxXOfNumbers + 55 : 400,
    });
  }
  return result;
}
