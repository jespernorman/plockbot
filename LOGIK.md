# Var ligger Plockbot-logiken?

**Plockbot har ingen backend.** All logik körs i webbläsaren (React + Vite).

## Flöde när du laddar upp en plockfil (PDF/Excel)

1. **SkapaPlocklista.tsx**  
   - `handlePdf` / `handleExcel` anropas.  
   - PDF: `parsePlocklistaPdf(file)` → **parsePdf.ts**  
   - Excel: rader läses med XLSX i komponenten.  
   - Sedan anropas **`processOrders(parsed)`** (samma fil, rad 26–39).

2. **processOrders** (SkapaPlocklista.tsx)  
   - `loadRules()` → **storage.ts** (localStorage)  
   - `loadArticles()` → **storage.ts** (localStorage)  
   - `articlesByCodeMap(articles)` → **masterdata.ts**  
   - `applyRulesToOrders(orders, articlesByCode, rules)` → **pickPlanEngine.ts**  
   - Resultatet sätts i state → UI uppdateras.

3. **pickPlanEngine.ts**  
   - `applyRulesToOrder` för varje order.  
   - För varje rad: `articlesByCode.get(artikelkod)` → `computePickPlan(article, antal, rules)`.  
   - Här räknas KA/BA/BESTICK (kassetter, backar, bestick) och `noteText` (t.ex. "2 KA + 3 lösa") sätts.

4. **masterdata.ts**  
   - `sheetToRawArticleRows` / `parseArticleRowsToArticles` används när du laddar upp **artikel-Excel** på sidan Regler.  
   - Bestämmer vilken kolumn som är "typ" (KA/BA/BESTICK/STYCK) och sätter `category`, `ka`, `ba` per artikel.

## Filer där logiken ligger

| Vad | Fil |
|-----|-----|
| PDF-parsning, rad för rad | `src/lib/pdf/parsePdf.ts` |
| Artikel-Excel → artikellista (typkolumn, KA/BA) | `src/lib/masterdata.ts` |
| Regler (KA, BA, BESTICK) och beräkning | `src/lib/rules/pickPlanEngine.ts` |
| Regler + artiklar (localStorage) | `src/lib/rules/storage.ts` |
| Anrop: ladda fil → processOrders → applyRulesToOrders | `src/pages/SkapaPlocklista.tsx` |
| Anrop: ladda artikel-Excel → spara artiklar | `src/pages/Regler.tsx` |

## Så ser du att det körs

- Öppna **Utvecklarverktyg** (F12) → fliken **Console**.  
- När du laddar upp en plockfil skrivs nu en rad ut, t.ex.:  
  `[Plockbot] Regler tillämpade: X artiklar, Y orderrader, Z rader med KA/BA/BESTICK`

Inga nätverksanrop till någon server – allt sker lokalt i webbläsaren.
