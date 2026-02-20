/**
 * Masterdata: Excel → Article[] enligt spec.
 * Kolumner: Artikelnummer, Artikelnamn, Antal (STYCK|GRUPPARTIKEL|KA|BA|BESTICK).
 * Valfritt: AntalPerEnhet (för KA/BA) eller separat kolumn för ka/ba.
 */
import type { Article, ArticleCategory } from './rules/types';

export interface RawArticleRow {
  articleCode: string;
  articleName: string;
  antal: string;
  antalPerEnhet?: number;
}

export interface SheetToRawOptions {
  /** 0-baserat kolumnindex för typ (KA/BA/BESTICK/ST). Om satt används denna kolumn direkt. */
  typeColumnIndex?: number;
}

/** Hittar radindex för header (kan vara rad 0, 1, 2 om titel finns först). */
function findHeaderRow(rows: (string | number)[][], maxLook = 5): number {
  for (let r = 0; r < Math.min(maxLook, rows.length); r++) {
    const row = rows[r].map(c => String(c ?? '').toLowerCase().trim());
    const hasArt = row.some(c => c.includes('artikelnummer') || c.includes('artikelnr') || c.includes('artikel nr') || (c === 'artikel' || c.includes('artikelcode') || c === 'kod'));
    const hasAntal = row.some(c => c === 'antal' || c === 'enhet' || c === 'typ' || c === 'st' || c.includes('hantering') || c.includes('artikeltyp'));
    const hasNamn = row.some(c => c.includes('artikelnamn') || c.includes('benämning') || c === 'namn' || c.includes('beskrivning'));
    if ((hasArt || row.some(c => /^[a-z]{2,12}$/.test(c) && c.includes('art'))) && (hasAntal || hasNamn)) return r;
  }
  return 0;
}

/** Parsar Excel-rader (med header) till RawArticleRow[]. */
export function sheetToRawArticleRows(rows: (string | number)[][], options?: SheetToRawOptions): RawArticleRow[] {
  if (!rows.length) return [];
  const headerRowIdx = findHeaderRow(rows);
  const header = rows[headerRowIdx].map(c => String(c ?? '').toLowerCase().trim());
  const numCols = Math.max(...rows.slice(0, Math.min(10, rows.length)).map(r => r.length), header.length);
  const artIdx = header.findIndex(h =>
    h.includes('artikelnummer') || h.includes('artikelnr') || h.includes('artikel nr') || h === 'artikel' || h.includes('artikelcode') || h === 'kod'
  );
  const nameIdx = header.findIndex(h => {
    const x = h.toLowerCase().replace(/\s+/g, ' ').trim();
    return x.includes('artikelnamn') || x.includes('benämning') || x === 'namn' || x.includes('beskrivning')
      || x.includes('description') || x.includes('produktnamn') || x.includes('product name')
      || x.includes('artikelnamn/benämning') || x.includes('benämning/namn') || x === 'benämning'
      || x.includes('namn/benämning') || x === 'titel' || x === 'title' || (x.includes('text') && !x.includes('anteckning'))
      || (x.includes('art') && x.includes('namn')) || x === 'artikelnamn' || x === 'produkt'
      || x.includes('produktbeskrivning') || x.includes('rubrik') || x === 'label' || x.includes('översättning')
      || x === 'benämning/artikel' || x.includes('artikelbenämning') || x === 'namn/artikel';
  });
  const overrideCol = options?.typeColumnIndex;
  let antalIdx = typeof overrideCol === 'number' && overrideCol >= 0 && overrideCol < numCols
    ? overrideCol
    : header.findIndex(h => {
    const x = h.toLowerCase().replace(/\s+/g, ' ');
    return x === 'antal' || x === 'enhet' || x === 'typ' || x === 'st' || x === 'sort' || x === 'kategori' || x === 'category'
      || x.includes('hantering') || x.includes('artikeltyp') || x.includes('enhetstyp')
      || x.includes('räknesätt') || x.includes('raknesatt') || x.includes('packaging') || x.includes('pack');
  });
  const perUnitIdx = header.findIndex(h =>
    h.includes('antalperenhet') || h.includes('per enhet') || h === 'perenhet' || h.includes('st/') || h.includes('st per')
  );

  const articleCol = artIdx >= 0 ? artIdx : 0;
  const dataStartRow = headerRowIdx + 1;
  if (rows.length <= dataStartRow) return [];

  const TYPE_PATTERN = /^(K|KA|KASSETT|KASSETER|KASETT|CASSETTE|CASSETT|LÅDA|LADA|BOX|TALLRIK|TALLRIKAR|PLATE|PORSLIN|B|BA|BACK|BACKAR|BACKE|CRATE|GLAS|GLASAR|GLASS|BESTICK|BESTICKAR|S|STYCK|ST|GRUPP|GRUPPARTIKEL)/i;
  function looksLikeType(val: unknown): boolean {
    const s = String(val ?? '').trim().toUpperCase();
    if (!s) return false;
    const first = (s.split(/\s+|[(\[]/)[0] || s).replace(/[^A-Z0-9ÅÄÖ]/g, '');
    if (first === 'K' || first === 'B' || first === 'S') return true;
    return TYPE_PATTERN.test(first) || first.startsWith('KASSET') || first === 'KASETT' || first === 'BACKAR' || first.startsWith('TALLRIK') || first.startsWith('GLAS');
  }

  if (antalIdx === -1 && rows.length > dataStartRow && typeof overrideCol !== 'number') {
    let bestCol = -1;
    let bestCount = 0;
    const sampleRows = Math.min(rows.length - dataStartRow, 500);
    for (let j = 0; j < numCols; j++) {
      if (j === articleCol) continue;
      let count = 0;
      for (let i = dataStartRow; i < dataStartRow + sampleRows && i < rows.length; i++) {
        if (looksLikeType(rows[i][j])) count++;
      }
      if (count > bestCount) {
        bestCount = count;
        bestCol = j;
      }
    }
    if (bestCol >= 0 && bestCount >= 1) {
      antalIdx = bestCol;
    } else {
      const sampleSize = Math.min(rows.length - dataStartRow, 300);
      let bestNumericCol = -1;
      let bestNumericCount = 0;
      for (let j = 0; j < numCols; j++) {
        if (j === articleCol) continue;
        let numeric = 0;
        for (let i = dataStartRow; i < dataStartRow + sampleSize && i < rows.length; i++) {
          const v = rows[i][j];
          const n = Number(v);
          if (!Number.isNaN(n) && n >= 1 && n <= 200) numeric++;
        }
        if (numeric > bestNumericCount && numeric >= Math.max(3, sampleSize * 0.25)) {
          bestNumericCount = numeric;
          bestNumericCol = j;
        }
      }
      if (bestNumericCol >= 0) antalIdx = bestNumericCol;
    }
    if (antalIdx === -1 && numCols >= 3) {
      const tryCol = [1, 2].find(j => j !== articleCol && j !== nameIdx);
      if (tryCol != null) {
        let c = 0;
        for (let i = dataStartRow; i < Math.min(rows.length, dataStartRow + 200); i++) {
          if (looksLikeType(rows[i][tryCol]) || (Number(rows[i][tryCol]) >= 1 && Number(rows[i][tryCol]) <= 200)) c++;
        }
        if (c >= 2) antalIdx = tryCol;
      }
    }
  }

  let effectiveNameIdx = nameIdx;
  if (effectiveNameIdx < 0) {
    const candidates: number[] = [];
    for (let j = 0; j < numCols; j++) {
      if (j !== articleCol && (antalIdx < 0 || j !== antalIdx)) candidates.push(j);
    }
    if (articleCol >= 0 && articleCol + 1 < numCols && (antalIdx < 0 || articleCol + 1 !== antalIdx)) {
      const nextCol = articleCol + 1;
      if (!candidates.includes(nextCol)) candidates.unshift(nextCol);
    }
    if (candidates.length === 1) {
      effectiveNameIdx = candidates[0];
    } else if (candidates.length > 1) {
      const sampleRows = Math.min(rows.length - dataStartRow, 200);
      let bestCol = candidates[0];
      let bestScore = 0;
      for (const j of candidates) {
        let score = 0;
        for (let i = dataStartRow; i < dataStartRow + sampleRows && i < rows.length; i++) {
          const val = rows[i][j];
          const s = (val != null ? String(val).trim() : '') as string;
          if (s.length < 2) continue;
          if (looksLikeType(val)) continue;
          const n = Number(s);
          if (!Number.isNaN(n) && s === String(n)) continue;
          score += Math.min(s.length, 50);
        }
        if (score > bestScore) {
          bestScore = score;
          bestCol = j;
        }
      }
      effectiveNameIdx = bestScore >= 2 ? bestCol : (articleCol + 1 < numCols ? articleCol + 1 : candidates[0]);
    } else if (articleCol + 1 < numCols && articleCol + 1 !== antalIdx) {
      effectiveNameIdx = articleCol + 1;
    }
  }

  const out: RawArticleRow[] = [];
  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    const code = row[articleCol] != null ? String(row[articleCol]).trim() : '';
    if (!code) continue;
    const rawName = effectiveNameIdx >= 0 && row[effectiveNameIdx] != null ? row[effectiveNameIdx] : '';
    const name = (typeof rawName === 'string' ? rawName : String(rawName)).trim();
    const antal = antalIdx >= 0 && row[antalIdx] != null ? String(row[antalIdx]) : '';
    let antalPerEnhet: number | undefined;
    if (perUnitIdx >= 0 && row[perUnitIdx] != null) {
      const n = Number(row[perUnitIdx]);
      if (!Number.isNaN(n) && n > 0) antalPerEnhet = n;
    }
    out.push({ articleCode: code, articleName: name, antal, antalPerEnhet });
  }
  return out;
}

/** Matchar "25 à BA", "15 à KA", "36 A BA" etc. – antal per enhet står i cellen. */
const X_A_KA_BA = /^\s*(\d+)\s*[àAa]\s*(KA|BA|KASSETT|KASSETER|KASETT|BACK|BACKAR|CRATE|GLAS|GLASAR)\s*$/i;

/**
 * Parsar Excel-rader till Article[].
 * Antal = STYCK → ANNAT, KA → PORSLIN (ka från AntalPerEnhet), BA → GLAS, BESTICK → BESTICK, GRUPPARTIKEL → ANNAT + isGroupHeader.
 * Stödjer även "X à KA" / "X à BA" (t.ex. 25 à BA = 25 st i 1 back, 15 à KA = 15 st i 1 kassett).
 */
export function parseArticleRowsToArticles(rows: RawArticleRow[]): Article[] {
  const articles: Article[] = [];
  let currentGroupId: string | null = null;

  for (const row of rows) {
    const id = row.articleCode.trim();
    if (!id) continue;

    const antalRaw = (row.antal ?? '').toString().trim();
    const antalUpper = antalRaw.toUpperCase();
    const firstWord = antalUpper.split(/\s+|[(\[]/)[0] || antalUpper;
    let category: ArticleCategory = 'ANNAT';
    let ka: number | undefined;
    let ba: number | undefined;
    let isGroupHeader = false;
    let groupId: string | undefined;

    // "25 à BA" / "36 à BA" / "15 à KA" – antal st per back/kassett står i cellen
    const matchXaKaBa = antalRaw.match(X_A_KA_BA);
    if (matchXaKaBa) {
      const num = parseInt(matchXaKaBa[1], 10);
      const unit = matchXaKaBa[2].toUpperCase();
      if (unit === 'KA' || unit.startsWith('KASSET') || unit === 'KASETT') {
        category = 'PORSLIN';
        ka = num;
        if (currentGroupId) groupId = currentGroupId;
      } else {
        // BA, BACK, BACKAR, CRATE, GLAS, GLASAR
        category = 'GLAS';
        ba = num;
        if (currentGroupId) groupId = currentGroupId;
      }
    } else {
      const typeNorm = firstWord.replace(/[^A-Z0-9ÅÄÖ]/g, '');
      if (typeNorm === 'S' || firstWord === 'STYCK' || firstWord === 'ST') {
        category = 'ANNAT';
      } else if (firstWord === 'GRUPPARTIKEL' || firstWord === 'GRUPP') {
        category = 'ANNAT';
        isGroupHeader = true;
        currentGroupId = id;
        groupId = id;
      } else if (typeNorm === 'K' || firstWord === 'KA' || firstWord === 'KASSETT' || firstWord === 'KASSETER' || firstWord === 'KASETT' || firstWord.startsWith('KASSET') || firstWord === 'CASSETTE' || firstWord === 'CASSETT' || firstWord === 'LÅDA' || firstWord === 'LADA' || firstWord === 'BOX' || firstWord === 'TALLRIK' || firstWord === 'TALLRIKAR' || firstWord === 'PLATE' || firstWord === 'PORSLIN') {
        category = 'PORSLIN';
        ka = row.antalPerEnhet ?? 25;
        if (currentGroupId) groupId = currentGroupId;
      } else if (typeNorm === 'B' || firstWord === 'BA' || firstWord === 'BACK' || firstWord === 'BACKAR' || firstWord === 'BACKE' || firstWord === 'CRATE' || firstWord === 'GLAS' || firstWord === 'GLASAR' || firstWord === 'GLASS') {
        category = 'GLAS';
        ba = row.antalPerEnhet ?? 25;
        if (currentGroupId) groupId = currentGroupId;
      } else if (firstWord === 'BESTICK' || firstWord === 'BESTICKAR') {
        category = 'BESTICK';
        if (currentGroupId) groupId = currentGroupId;
      } else {
        const n = Number(antalRaw);
        if (!Number.isNaN(n) && n > 0) {
          category = 'PORSLIN';
          ka = n;
        }
      }
    }

    articles.push({
      id,
      name: row.articleName?.trim() ?? '',
      category,
      ka,
      ba,
      isGroupHeader: isGroupHeader || undefined,
      groupId,
    });
  }

  return articles;
}

/** Normaliserar artikelkod för matchning: trim, uppercase, ta bort mellanslag och vanliga avgränsare (- _ .). */
export function normalizeArticleCode(code: string): string {
  return (code || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[-_.]/g, '');
}

/** Nyckel = normaliserad artikelkod så att uppslag blir case-insensitive och tolererar mellanslag. */
export function articlesByCodeMap(articles: Article[]): Map<string, Article> {
  return new Map(articles.map(a => [normalizeArticleCode(a.id), a]));
}
