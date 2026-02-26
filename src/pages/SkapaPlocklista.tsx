import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { parsePlocklistaPdf, getRowPositionsForFill } from '../lib/pdf/parsePdf';
import { generatePlocklistaPdf, fillOriginalPdfWithLevAntal, type ProcessedOrder } from '../lib/pdf/generatePdf';
import { loadRules, loadArticles, saveArticles, saveArticleRawRows } from '../lib/rules/storage';
import { applyRulesToOrders } from '../lib/rules/pickPlanEngine';
import { articlesByCodeMap, sheetToRawArticleRows, parseArticleRowsToArticles } from '../lib/masterdata';
import type { Order, OrderLineWithPickPlan } from '../lib/rules/types';
import type { ParsedOrder } from '../lib/pdf/parsePdf';
import './SkapaPlocklista.css';

export default function SkapaPlocklista() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [articleFile, setArticleFile] = useState<File | null>(null);
  const [orders, setOrders] = useState<ProcessedOrder[] | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOrderIndex, setActiveOrderIndex] = useState(0);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const articleExcelInputRef = useRef<HTMLInputElement>(null);
  const pdfArrayBufferRef = useRef<ArrayBuffer | null>(null);
  const plockCarouselRef = useRef<HTMLDivElement>(null);
  const lastParsedOrdersRef = useRef<ParsedOrder[] | null>(null);

  function processOrders(parsed: ParsedOrder[]): void {
    lastParsedOrdersRef.current = parsed;
    const rules = loadRules();
    const articles = loadArticles();
    const articlesByCode = articlesByCodeMap(articles);
    const ordersForEngine: Order[] = parsed.map(p => ({
      orderId: p.orderId,
      date: p.date,
      customerId: p.customerId,
      deliveryAddress: p.deliveryAddress,
      lines: p.lines,
    }));
    const withPlans = applyRulesToOrders(ordersForEngine, articlesByCode, rules);
    const processed: ProcessedOrder[] = parsed.map((p, i) => ({ ...p, lines: withPlans[i].lines }));
    const totalLines = processed.reduce((n, o) => n + o.lines.length, 0);
    const withCalculation = processed.reduce((n, o) => n + o.lines.filter(l => !/^\d+ st$/.test(l.noteText ?? '')).length, 0);
    console.log('[Plockbot] Regler tillämpade:', articles.length, 'artiklar,', totalLines, 'orderrader,', withCalculation, 'rader med KA/BA/BESTICK-beräkning');
    setOrders(processed);
  }

  useEffect(() => {
    setActiveOrderIndex(0);
    const el = plockCarouselRef.current;
    if (el) el.scrollLeft = 0;
  }, [orders]);

  useEffect(() => {
    if (!orders || orders.length === 0) {
      setPdfPreviewUrl(null);
      return;
    }
    let revoked = false;
    const run = async () => {
      try {
        let bytes: Uint8Array;
        if (pdfFile && pdfArrayBufferRef.current) {
          const positions = await getRowPositionsForFill(pdfFile);
          bytes = await fillOriginalPdfWithLevAntal(pdfArrayBufferRef.current, orders, positions);
        } else {
          bytes = await generatePlocklistaPdf(orders);
        }
        if (revoked) return;
        const blob = new Blob([bytes], { type: 'application/pdf' });
        setPdfPreviewUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch {
        if (!revoked) setPdfPreviewUrl(null);
      }
    };
    run();
    return () => { revoked = true; };
  }, [orders, pdfFile]);

  const handlePdf = async (file: File | null) => {
    setPdfFile(file);
    setExcelFile(null);
    pdfArrayBufferRef.current = null;
    setOrders(null);
    setError(null);
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Endast PDF-filer.');
      return;
    }
    setLoading(true);
    try {
      const parsed: ParsedOrder[] = await parsePlocklistaPdf(file);
      if (!parsed.length || parsed.every(p => !p.lines.length)) {
        setError('Inga orderrader hittades i PDF:en.');
        setLoading(false);
        return;
      }
      pdfArrayBufferRef.current = await file.arrayBuffer();
      processOrders(parsed);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Kunde inte läsa PDF.');
    } finally {
      setLoading(false);
    }
  };

  const handleExcel = (file: File | null) => {
    setExcelFile(file);
    setPdfFile(null);
    pdfArrayBufferRef.current = null;
    setOrders(null);
    setError(null);
    if (!file) return;
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) throw new Error('Tom fil');
          const wb = XLSX.read(data, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows: (string | number)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const header = (rows[0] || []).map(c => String(c).toLowerCase());
          const codeIdx = header.findIndex(h => h.includes('artikel') && !h.includes('namn'));
          const nameIdx = header.findIndex(h => h.includes('artikelnamn') || h.includes('benämning') || h === 'namn');
          const qtyIdx = header.findIndex(h => h.includes('antal') || h.includes('beställt') || h === 'st');
          if (codeIdx < 0 || qtyIdx < 0) throw new Error('Saknar kolumner: artikelnummer och antal krävs.');
          const lines: Order['lines'] = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const code = row[codeIdx] != null ? String(row[codeIdx]).trim() : '';
            if (!code) continue;
            const qty = Number(row[qtyIdx]);
            if (Number.isNaN(qty) || qty < 0) continue;
            const description = nameIdx >= 0 && row[nameIdx] != null ? String(row[nameIdx]).trim() : '';
            lines.push({ articleCode: code, description, orderedQty: Math.round(qty) });
          }
          processOrders([{ lines }] as ParsedOrder[]);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Kunde inte läsa Excel.');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte läsa Excel.');
      setLoading(false);
    }
  };

  const handleArticleExcel = (file: File | null) => {
    setArticleFile(file);
    setError(null);
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data || typeof data !== 'string') throw new Error('Tom fil');
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
        saveArticleRawRows(rows);
        const rawRows = sheetToRawArticleRows(rows, { typeColumnIndex: undefined });
        if (rawRows.length === 0) throw new Error('Inga artikelrader hittades. Kontrollera rubriker (Artikelnummer, Artikelnamn, Antal).');
        const articles = parseArticleRowsToArticles(rawRows);
        saveArticles(articles);
        if (lastParsedOrdersRef.current?.length) {
          processOrders(lastParsedOrdersRef.current);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kunde inte läsa artikel-Excel.');
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Filen kunde inte läsas.');
      setLoading(false);
    };
    reader.readAsBinaryString(file);
  };

  const toggleChecked = (orderIndex: number, lineIndex: number) => {
    if (!orders) return;
    setOrders(orders.map((order, oi) => {
      if (oi !== orderIndex) return order;
      return {
        ...order,
        lines: order.lines.map((line, li) =>
          li === lineIndex ? { ...line, checked: !line.checked } : line
        ),
      };
    }));
  };

  const plockOrderFile = pdfFile ?? excelFile;
  const handlePlockOrderFile = (file: File | null) => {
    if (!file) {
      handlePdf(null);
      return;
    }
    if (file.type === 'application/pdf') handlePdf(file);
    else handleExcel(file);
  };
  const onPlockOrderDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handlePlockOrderFile(e.dataTransfer.files[0] || null);
  };
  const onArticleExcelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleArticleExcel(e.dataTransfer.files[0] || null);
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDownload = async () => {
    if (!orders || orders.length === 0) return;
    try {
      let pdfBytes: Uint8Array;
      if (pdfFile && pdfArrayBufferRef.current) {
        const positions = await getRowPositionsForFill(pdfFile);
        pdfBytes = await fillOriginalPdfWithLevAntal(pdfArrayBufferRef.current, orders, positions);
      } else {
        pdfBytes = await generatePlocklistaPdf(orders);
      }
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plocklista-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte skapa PDF.');
    }
  };

  const allLines = orders?.flatMap(o => o.lines) ?? [];
  const hasOrders = orders && orders.length > 0 && allLines.length > 0;

  const goToOrder = (index: number) => {
    if (!orders || index < 0 || index >= orders.length) return;
    setActiveOrderIndex(index);
    const el = plockCarouselRef.current;
    if (!el) return;
    const step = el.clientWidth;
    el.scrollTo({ left: index * step, behavior: 'smooth' });
  };

  const onPlockCarouselScroll = () => {
    const el = plockCarouselRef.current;
    if (!el || !orders?.length) return;
    const step = el.clientWidth;
    const index = Math.round(el.scrollLeft / step);
    const clamped = Math.max(0, Math.min(index, orders.length - 1));
    setActiveOrderIndex(clamped);
  };

  return (
    <div className="skapa-page">
      <header className="skapa-header">
        <h1>Skapa plocklista</h1>
        <p className="skapa-tagline">
          Ladda upp en plockorder (PDF eller Excel). Plockbot fyller i hur varje artikel ska plockas enligt dina regler.
        </p>
      </header>

      <section className="skapa-card">
        <h2>Ladda upp</h2>
        <p className="muted">
          <strong>1.</strong> Plockorder: PDF eller Excel (artikelnummer + antal). <strong>2.</strong> Artikel-Excel: alla artiklar med kolumnen Antal (t.ex. 25 à BA, 15 à KA, STYCK). Ingen annan inställning behövs.
        </p>
        <div className="skapa-upload-row">
          <div
            className={`upload-area ${plockOrderFile ? 'upload-area--has-file' : ''}`}
            onDrop={onPlockOrderDrop}
            onDragOver={onDragOver}
            onDragLeave={() => {}}
            onClick={() => pdfInputRef.current?.click()}
          >
            <input
              ref={pdfInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
              onChange={e => handlePlockOrderFile(e.target.files?.[0] ?? null)}
              className="upload-input"
            />
            <p className="upload-text">Plocklista (PDF eller Excel)</p>
            {plockOrderFile && <span className="upload-file-name">{plockOrderFile.name}</span>}
          </div>
          <div
            className={`upload-area ${articleFile ? 'upload-area--has-file' : ''}`}
            onDrop={onArticleExcelDrop}
            onDragOver={onDragOver}
            onDragLeave={() => {}}
            onClick={() => articleExcelInputRef.current?.click()}
          >
            <input
              ref={articleExcelInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={e => handleArticleExcel(e.target.files?.[0] ?? null)}
              className="upload-input"
            />
            <p className="upload-text">Artikel-Excel</p>
            {articleFile && <span className="upload-file-name">{articleFile.name}</span>}
          </div>
        </div>
        {loadArticles().length > 0 && (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            {loadArticles().length} artiklar laddade. Kolumnen med typ (KA/BA/STYCK) hittades automatiskt.
          </p>
        )}
        {loading && <p className="skapa-loading">Läser fil…</p>}
        {error && <p className="skapa-error">{error}</p>}
      </section>

      {hasOrders && (
        <>
        {loadArticles().length === 0 && (
          <section className="skapa-card skapa-warning-box" role="alert">
            <strong>Inga artiklar laddade.</strong> Ladda upp <strong>Artikel-Excel</strong> ovan (Excel med alla artiklar: Artikelnummer, Artikelnamn, Antal med t.ex. 25 à BA, 15 à KA eller STYCK). Då räknas backar och kassetter ut automatiskt.
          </section>
        )}
        {hasOrders && loadArticles().length > 0 && (() => {
          const allLines = orders!.flatMap(o => o.lines);
          const allOnlyStyck = allLines.length > 0 && allLines.every(l => /^\d+ st$/.test(l.noteText ?? ''));
          if (!allOnlyStyck) return null;
          return (
            <section className="skapa-card skapa-warning-box" role="alert">
              <strong>Alla rader visar bara styck.</strong> Ladda upp <strong>Artikel-Excel</strong> ovan (samma fil som innehåller alla artiklar med kolumnen Antal: 25 à BA, 15 à KA, STYCK osv.). Inget mer behövs – systemet hittar typkolumnen själv.
            </section>
          );
        })()}
        <section className="skapa-card skapa-result-section">
          <div className="skapa-result-header">
            <div className="skapa-result-summary">
              <h2>Resultat</h2>
              <p className="skapa-result-stats">
                {orders!.length} {orders!.length === 1 ? 'order' : 'ordrar'} · {allLines.length} rader med plockinstruktioner beräknade
              </p>
            </div>
          </div>
        </section>

        <section className="skapa-card skapa-digital-section">
          <div className="skapa-digital-section__head">
            <div>
              <h2>Digital plocklista</h2>
              <p className="muted">
                Bläddra mellan ordrar. LEV. ANTAL visar hur mycket som ska plockas (KA, BA, styck).
              </p>
            </div>
          </div>

          <div
            ref={plockCarouselRef}
            className="plock-carousel"
            onScroll={onPlockCarouselScroll}
            role="region"
            aria-label="Plocklistor per order"
          >
            {orders!.map((order, oi) => (
              <div key={oi} className="plock-card">
                <div className="plock-card__strip" />
                <header className="plock-card__header">
                  <span className="plock-card__title">Plocklista</span>
                  <span className="plock-card__order-nr">{order.orderId ? `Order ${order.orderId}` : `Order ${oi + 1}`}</span>
                </header>
                {(order.deliveryAddress || order.deliveryDate || order.returnDate || order.phone) && (
                  <div className="plock-card__order-info">
                    {order.deliveryAddress && (() => {
                      const addr = order.deliveryAddress as string;
                      const byDoubleSpace = addr.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
                      const lines = byDoubleSpace.length > 1 ? byDoubleSpace : (addr.length > 55 ? [addr.slice(0, 55).trim(), addr.slice(55).trim()].filter(Boolean) : [addr]);
                      return (
                        <div className="plock-card__order-info-block">
                          {lines.map((line, k) => (
                            <div key={k} className="plock-card__order-info-line">{line}</div>
                          ))}
                        </div>
                      );
                    })()}
                    {(order.deliveryDate || order.returnDate) && (
                      <div className="plock-card__order-info-row">
                        {order.deliveryDate && <span>Leverans: {order.deliveryDate}</span>}
                        {order.returnDate && <span>Retur: {order.returnDate}</span>}
                      </div>
                    )}
                    {order.phone && (
                      <div className="plock-card__order-info-row">Tel: {order.phone}</div>
                    )}
                  </div>
                )}
                <div className="plock-card__table-wrap">
                  <table className="plock-card__table">
                    <thead>
                      <tr>
                        <th>Artikel</th>
                        <th>Benämning</th>
                        <th className="plock-card__th-num">Best</th>
                        <th className="plock-card__th-lev">LEV. ANTAL</th>
                        <th className="plock-card__th-check" aria-label="Bocka" />
                      </tr>
                    </thead>
                    <tbody>
                      {order.lines.map((line: OrderLineWithPickPlan, li) => (
                        <tr key={li}>
                          <td className="plock-card__code">{line.articleCode}</td>
                          <td className="plock-card__desc">{line.description || '—'}</td>
                          <td className="plock-card__num">{line.orderedQty}</td>
                          <td className="plock-card__lev">
                            <span className="plock-card__lev-box">
                              {line.noteText && String(line.noteText).trim() !== '—'
                                ? line.noteText
                                : (line.orderedQty != null ? String(line.orderedQty) : '—')}
                            </span>
                          </td>
                          <td className="plock-card__check">
                            <input
                              type="checkbox"
                              checked={line.checked ?? false}
                              onChange={() => toggleChecked(oi, li)}
                              aria-label={`Bocka ${line.articleCode}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="plock-carousel-nav">
            <button
              type="button"
              className="plock-carousel-btn"
              onClick={() => goToOrder(activeOrderIndex - 1)}
              disabled={activeOrderIndex <= 0}
              aria-label="Föregående order"
            >
              ←
            </button>
            <span className="plock-carousel-label">
              Order {activeOrderIndex + 1} av {orders!.length}
            </span>
            <button
              type="button"
              className="plock-carousel-btn"
              onClick={() => goToOrder(activeOrderIndex + 1)}
              disabled={activeOrderIndex >= orders!.length - 1}
              aria-label="Nästa order"
            >
              →
            </button>
          </div>
          <div className="plock-carousel-dots" role="tablist" aria-label="Välj order">
            {orders!.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === activeOrderIndex}
                aria-label={`Order ${i + 1}`}
                className={`plock-dot ${i === activeOrderIndex ? 'plock-dot--active' : ''}`}
                onClick={() => goToOrder(i)}
              />
            ))}
          </div>

          <div className="skapa-download-secondary-wrap">
            <button type="button" className="skapa-download-secondary" onClick={handleDownload}>
              Ladda ner PDF
            </button>
          </div>
        </section>

        {pdfPreviewUrl && (
          <details className="skapa-card skapa-pdf-preview">
            <summary className="skapa-pdf-preview-summary">Förhandsgranskning av PDF</summary>
            <p className="muted" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
              Så här ser den nedladdade filen ut. Använd knappen &quot;Ladda ner PDF&quot; ovan för att spara.
            </p>
            <iframe title="Plocklista PDF" src={pdfPreviewUrl} className="skapa-pdf-iframe" />
          </details>
        )}
        </>
      )}
    </div>
  );
}
