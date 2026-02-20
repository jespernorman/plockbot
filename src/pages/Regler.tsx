import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { Article, ArticleCategory, PlockbotRules } from '../lib/rules/types';
import { loadRules, saveRules, loadArticles, saveArticles, getTypeColumnOverride, saveArticleRawRows, loadArticleRawRows } from '../lib/rules/storage';
import { defaultPlockbotRules } from '../lib/rules/defaultRules';
import { sheetToRawArticleRows, parseArticleRowsToArticles } from '../lib/masterdata';
import { saveExcelFile, loadExcelFile, type SavedExcel } from '../lib/excelStorage';
import { computePickPlan } from '../lib/rules/pickPlanEngine';
import './Regler.css';

function formatArticlePackaging(a: Article): string {
  if (a.category === 'PORSLIN' && a.ka != null) return `${a.ka} à KA`;
  if (a.category === 'GLAS' && a.ba != null) return `${a.ba} à BA`;
  if (a.category === 'BESTICK') return 'BESTICK';
  return 'STYCK';
}

export default function Regler() {
  const [rules, setRules] = useState<PlockbotRules>(() => loadRules());
  const [articles, setArticles] = useState<Article[]>(() => loadArticles());
  const [saved, setSaved] = useState(false);
  const [testArticleId, setTestArticleId] = useState('');
  const [testArticleSearch, setTestArticleSearch] = useState('');
  const [testQty, setTestQty] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadedRows, setLastUploadedRows] = useState<(string | number)[][] | null>(() => loadArticleRawRows());
  const [savedExcel, setSavedExcel] = useState<SavedExcel | null>(null);
  const [editingArticle, setEditingArticle] = useState<{ index: number; draft: Article } | null>(null);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [newArticleModalOpen, setNewArticleModalOpen] = useState(false);
  const [newArticleDraft, setNewArticleDraft] = useState<Article>(() => ({ id: '', name: '', category: 'ANNAT' }));
  const [packFilter, setPackFilter] = useState<'all' | 'KA' | 'BA' | 'BESTICK' | 'STYCK' | 'GRUPP'>('all');
  const excelInputRef = useRef<HTMLInputElement>(null);

  const matchesPackFilter = (a: Article): boolean => {
    switch (packFilter) {
      case 'all':
        return true;
      case 'KA':
        return a.category === 'PORSLIN';
      case 'BA':
        return a.category === 'GLAS';
      case 'BESTICK':
        return a.category === 'BESTICK';
      case 'STYCK':
        return a.category === 'ANNAT';
      case 'GRUPP':
        return !!a.isGroupHeader || !!a.groupId;
      default:
        return true;
    }
  };
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openMenuIndex === null) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuIndex(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenuIndex]);

  const persistArticles = (next: Article[]) => {
    setArticles(next);
    saveArticles(next);
  };

  const handleEditArticle = (index: number) => {
    setOpenMenuIndex(null);
    const a = articles[index];
    if (!a) return;
    setEditingArticle({
      index,
      draft: {
        id: a.id,
        name: a.name ?? '',
        category: a.category,
        ka: a.ka,
        ba: a.ba,
        isGroupHeader: a.isGroupHeader,
        groupId: a.groupId,
      },
    });
  };

  const handleDeleteArticle = (index: number) => {
    setOpenMenuIndex(null);
    if (!window.confirm(`Ta bort artikeln "${articles[index].id}"?`)) return;
    const next = articles.filter((_, j) => j !== index);
    persistArticles(next);
    if (editingArticle?.index === index) setEditingArticle(null);
    if (testArticleId === `${articles[index].id}::${index}`) setTestArticleId('');
  };

  const handleOpenNewArticleModal = () => {
    setNewArticleDraft({ id: '', name: '', category: 'ANNAT' });
    setNewArticleModalOpen(true);
  };

  const handleSaveNewArticle = () => {
    if (!newArticleDraft.id.trim()) return;
    const clean: Article = {
      ...newArticleDraft,
      id: newArticleDraft.id.trim(),
      name: (newArticleDraft.name ?? '').trim(),
      category: newArticleDraft.category,
      ka: newArticleDraft.category === 'PORSLIN' ? (newArticleDraft.ka ?? undefined) : undefined,
      ba: newArticleDraft.category === 'GLAS' ? (newArticleDraft.ba ?? undefined) : undefined,
    };
    persistArticles([...articles, clean]);
    setNewArticleModalOpen(false);
  };

  const handleSaveEditArticle = () => {
    if (!editingArticle) return;
    const { index, draft } = editingArticle;
    if (!draft.id.trim()) return;
    const next = [...articles];
    const cleanDraft: Article = {
      ...draft,
      id: draft.id.trim(),
      name: (draft.name ?? '').trim(),
      category: draft.category,
      ka: draft.category === 'PORSLIN' ? (draft.ka ?? undefined) : undefined,
      ba: draft.category === 'GLAS' ? (draft.ba ?? undefined) : undefined,
    };
    if (index >= 0) {
      next[index] = cleanDraft;
    } else {
      next.push(cleanDraft);
    }
    persistArticles(next);
    setEditingArticle(null);
  };

  const handleCancelEditArticle = () => {
    setEditingArticle(null);
  };

  useEffect(() => {
    loadExcelFile().then(setSavedExcel).catch(() => setSavedExcel(null));
  }, []);

  useEffect(() => {
    if (!savedExcel || articles.length > 0) return;
    let cancelled = false;
    const run = async () => {
      try {
        const buf = await savedExcel.blob.arrayBuffer();
        if (cancelled) return;
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) return;
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
        if (cancelled) return;
        setLastUploadedRows(rows);
        saveArticleRawRows(rows);
        const override = getTypeColumnOverride();
        const rawRows = sheetToRawArticleRows(rows, { typeColumnIndex: override ?? undefined });
        if (rawRows.length === 0) return;
        const parsed = parseArticleRowsToArticles(rawRows);
        setArticles(parsed);
        saveArticles(parsed);
      } catch {
        // Ignorera om sparad fil inte kunde läsas
      }
    };
    run();
    return () => { cancelled = true; };
  }, [savedExcel]);

  useEffect(() => {
    saveRules(rules);
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [rules]);

  const handleSaveRules = () => {
    saveRules(rules);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const testSearchLower = testArticleSearch.trim().toLowerCase();

  const articlesInDisplayOrder = ((): { a: Article; i: number }[] => {
    const result: { a: Article; i: number }[] = [];
    const added = new Set<number>();
    articles.forEach((a, i) => {
      if (a.isGroupHeader) {
        result.push({ a, i });
        added.add(i);
        articles.forEach((b, j) => {
          if (b.groupId === a.id && !(b.isGroupHeader && b.id === a.id)) {
            result.push({ a: b, i: j });
            added.add(j);
          }
        });
      }
    });
    articles.forEach((a, i) => {
      if (!added.has(i)) {
        result.push({ a, i });
        added.add(i);
      }
    });
    return result;
  })();

  const filteredByPack = articlesInDisplayOrder.filter(({ a }) => matchesPackFilter(a));

  const filteredTestArticles = testSearchLower
    ? filteredByPack.filter(
        ({ a }) =>
          a.id.toLowerCase().includes(testSearchLower) ||
          (a.name && a.name.toLowerCase().includes(testSearchLower))
      )
    : filteredByPack;

  useEffect(() => {
    if (!testArticleId || !testSearchLower) return;
    const q = testSearchLower;
    const stillInList = articles.some(
      (a, i) => `${a.id}::${i}` === testArticleId && (a.id.toLowerCase().includes(q) || (a.name && a.name.toLowerCase().includes(q)))
    );
    if (!stillInList) setTestArticleId('');
  }, [testArticleSearch, testArticleId, articles, testSearchLower]);

  const updateKA = (u: Partial<PlockbotRules['ka']>) => setRules(r => ({ ...r, ka: { ...r.ka, ...u } }));
  const updateBA = (u: Partial<PlockbotRules['ba']>) => setRules(r => ({ ...r, ba: { ...r.ba, ...u } }));
  const updateBESTICK = (u: Partial<PlockbotRules['bestick']>) => setRules(r => ({ ...r, bestick: { ...r.bestick, ...u } }));

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setUploadError(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        if (!data || typeof data !== 'string') throw new Error('Tom fil eller ogiltigt format.');
        const wb = XLSX.read(data, { type: 'binary' });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new Error('Ingen ark i filen.');
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
        setLastUploadedRows(rows);
        saveArticleRawRows(rows);
        const override = getTypeColumnOverride();
        const rawRows = sheetToRawArticleRows(rows, { typeColumnIndex: override ?? undefined });
        if (rawRows.length === 0) throw new Error('Inga rader hittades. Kontrollera att första raden har rubriker (t.ex. Artikelnummer, Artikelnamn, Antal).');
        const parsed = parseArticleRowsToArticles(rawRows);
        setArticles(parsed);
        saveArticles(parsed);
        saveExcelFile(file).then(() => setSavedExcel({ fileName: file.name, blob: file })).catch(() => {});
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Kunde inte läsa Excel.');
      }
    };
    reader.onerror = () => setUploadError('Filen kunde inte läsas.');
    reader.readAsBinaryString(file);
  };

  const handleDownloadSavedExcel = () => {
    if (!savedExcel) return;
    const url = URL.createObjectURL(savedExcel.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = savedExcel.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const testArticleIdx = testArticleId.includes('::') ? parseInt(testArticleId.split('::')[1], 10) : -1;
  const testArticle = testArticleIdx >= 0 && testArticleIdx < articles.length ? articles[testArticleIdx] : null;
  const testPlan = testArticle ? computePickPlan(testArticle, testQty, rules) : null;

  return (
    <div className="regler-page">
      <header className="regler-header">
        <h1>Regler</h1>
        <p className="regler-tagline">Stockholm bords miniräknare – plockinstruktioner från artikel-Excel.</p>
        {saved && <span className="regler-saved">Sparat</span>}
      </header>

      <section className="regler-section regler-section--compact">
        <h2>Artikel-Excel</h2>
        <div className="regler-row">
          <label className="regler-upload">
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleExcelUpload}
              className="regler-file-input"
            />
            Ladda upp artikel-Excel
          </label>
          {articles.length > 0 && (
            <span className="regler-count" title="Fördelning enligt typ i Excel">
              {articles.length} artiklar
              {(() => {
                const ka = articles.filter(a => a.category === 'PORSLIN' && a.ka).length;
                const ba = articles.filter(a => a.category === 'GLAS' && a.ba).length;
                const bestick = articles.filter(a => a.category === 'BESTICK').length;
                const styck = articles.length - ka - ba - bestick;
                return ` (${ka} KA, ${ba} BA, ${bestick} bestick, ${styck} st)`;
              })()}
            </span>
          )}
        </div>
        {savedExcel && (
          <div className="regler-excel-saved">
            <p className="regler-excel-saved-text">
              Excel sparad: <strong>{savedExcel.fileName}</strong>. Du behöver inte ladda upp igen.
            </p>
            <button type="button" className="regler-download-excel" onClick={handleDownloadSavedExcel}>
              Ladda ner sparad Excel
            </button>
          </div>
        )}
        {uploadError && <p className="regler-upload-error">{uploadError}</p>}
        <p className="regler-hint regler-hint--short">Artikelnummer, namn och typ (KA/BA/STYCK). Redigera, lägg till eller ta bort direkt i listan.</p>
        {articles.length > 0 && (
          <div className="regler-pack-filter">
            <span className="regler-pack-filter-label">Filtrera på packning:</span>
            <div className="regler-pack-filter-btns" role="group" aria-label="Filtrera artiklar efter packning">
              {(['all', 'KA', 'BA', 'BESTICK', 'STYCK', 'GRUPP'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`regler-pack-filter-btn ${packFilter === key ? 'regler-pack-filter-btn--active' : ''}`}
                  onClick={() => setPackFilter(key)}
                  aria-pressed={packFilter === key}
                >
                  {key === 'all' ? 'Alla' : key === 'STYCK' ? 'Styck' : key === 'GRUPP' ? 'Gruppartiklar' : key}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="regler-test-label">Sök artikel och testa antal.</p>
        <div className="regler-test-block">
          <div className="regler-article-actions-row">
            <input
              type="search"
              value={testArticleSearch}
              onChange={e => setTestArticleSearch(e.target.value)}
              placeholder="Sök artikelnummer eller namn…"
              className="regler-test-search"
              aria-label="Sök artikel"
              disabled={articles.length === 0}
            />
            <button type="button" className="regler-add-btn" onClick={handleOpenNewArticleModal} title="Skapa ny artikel" aria-label="Skapa ny artikel">
              +
            </button>
          </div>
          {editingArticle != null && editingArticle.index >= 0 && (
            <div className="regler-article-form" key={`edit-${editingArticle.index}-${editingArticle.draft.id}`}>
              <h3 className="regler-article-form-title">Redigera artikel</h3>
              <div className="regler-article-form-grid">
                <label>
                  <span>Artikelnummer</span>
                  <input
                    type="text"
                    value={editingArticle.draft.id}
                    onChange={e => setEditingArticle(prev => prev ? { ...prev, draft: { ...prev.draft, id: e.target.value } } : null)}
                    placeholder="t.ex. 12345"
                    disabled={!!editingArticle.draft.isGroupHeader}
                    aria-label="Artikelnummer"
                  />
                </label>
                <label>
                  <span>Namn / beskrivning</span>
                  <input
                    type="text"
                    value={editingArticle.draft.name ?? ''}
                    onChange={e => setEditingArticle(prev => prev ? { ...prev, draft: { ...prev.draft, name: e.target.value } } : null)}
                    placeholder="Artikelnamn"
                    aria-label="Namn eller beskrivning"
                  />
                </label>
                <label>
                  <span>Typ</span>
                  <select
                    value={editingArticle.draft.category}
                    onChange={e => setEditingArticle(prev => prev ? { ...prev, draft: { ...prev.draft, category: e.target.value as ArticleCategory } } : null)}
                    aria-label="Typ (Styck, KA, BA, Bestick)"
                  >
                    <option value="ANNAT">Styck</option>
                    <option value="PORSLIN">Tallrikar (KA)</option>
                    <option value="GLAS">Glas (BA)</option>
                    <option value="BESTICK">Bestick</option>
                  </select>
                </label>
                {editingArticle.draft.category === 'PORSLIN' && (
                  <label>
                    <span>Antal per kassett</span>
                    <input
                      type="number"
                      min={1}
                      value={editingArticle.draft.ka !== undefined && editingArticle.draft.ka !== null ? String(editingArticle.draft.ka) : ''}
                      onChange={e => setEditingArticle(prev => prev ? { ...prev, draft: { ...prev.draft, ka: e.target.value === '' ? undefined : Number(e.target.value) || undefined } } : null)}
                      placeholder="25"
                      aria-label="Antal per kassett"
                    />
                  </label>
                )}
                {editingArticle.draft.category === 'GLAS' && (
                  <label>
                    <span>Antal per back</span>
                    <input
                      type="number"
                      min={1}
                      value={editingArticle.draft.ba !== undefined && editingArticle.draft.ba !== null ? String(editingArticle.draft.ba) : ''}
                      onChange={e => setEditingArticle(prev => prev ? { ...prev, draft: { ...prev.draft, ba: e.target.value === '' ? undefined : Number(e.target.value) || undefined } } : null)}
                      placeholder="25"
                      aria-label="Antal per back"
                    />
                  </label>
                )}
              </div>
              <div className="regler-article-form-actions">
                <button type="button" className="regler-form-save" onClick={handleSaveEditArticle} disabled={!editingArticle.draft.id.trim()}>
                  Spara
                </button>
                <button type="button" className="regler-form-cancel" onClick={handleCancelEditArticle}>
                  Avbryt
                </button>
              </div>
            </div>
          )}
          <div className="regler-search-results" role="list">
            <p className="regler-test-hint">
              {testSearchLower
                ? `${filteredTestArticles.length} av ${filteredByPack.length} träffar`
                : packFilter === 'all'
                  ? `${articles.length} artiklar – sök på nummer eller namn, klicka för att välja`
                  : `${filteredByPack.length} artiklar (${packFilter === 'KA' ? 'KA' : packFilter === 'BA' ? 'BA' : packFilter === 'BESTICK' ? 'Bestick' : packFilter === 'STYCK' ? 'Styck' : 'Gruppartiklar'}) – sök på nummer eller namn`}
            </p>
            <div className="regler-article-list-head" aria-hidden="true">
              <span className="regler-article-code">Artikelnummer</span>
              <span className="regler-article-name">Namn / beskrivning</span>
              <span className="regler-article-pack">Packning</span>
              <span className="regler-article-actions-head">Åtgärder</span>
            </div>
            <ul className="regler-article-list" aria-label="Artiklar – välj för att testa, redigera eller ta bort">
              {filteredTestArticles.map(({ a, i }, listIdx) => (
                <li key={`art-${listIdx}-${a.id}-${i}`} className="regler-article-item">
                  <div className="regler-article-row-wrap">
                    <button
                      type="button"
                      className={`regler-article-row ${testArticleId === `${a.id}::${i}` ? 'regler-article-row--selected' : ''} ${a.isGroupHeader ? 'regler-article-row--group-header' : ''} ${a.groupId ? 'regler-article-row--child' : ''}`}
                      onClick={() => setTestArticleId(`${a.id}::${i}`)}
                      aria-pressed={testArticleId === `${a.id}::${i}`}
                    >
                      <span className="regler-article-code">{a.groupId ? `>> ${a.id}` : a.id}</span>
                      <span className="regler-article-name" title={a.name || undefined}>{a.name || '—'}</span>
                      <span className="regler-article-pack">{a.isGroupHeader ? 'GRUPPARTIKEL' : formatArticlePackaging(a)}</span>
                    </button>
                    <div
                      className="regler-article-actions"
                      ref={openMenuIndex === i ? menuRef : undefined}
                    >
                      <button
                        type="button"
                        className="regler-dots-btn"
                        onClick={() => setOpenMenuIndex(openMenuIndex === i ? null : i)}
                        aria-expanded={openMenuIndex === i}
                        aria-haspopup="true"
                        aria-label="Öppna menyn"
                        title="Åtgärder"
                      >
                        ⋯
                      </button>
                      {openMenuIndex === i && (
                        <div className="regler-dots-dropdown" role="menu">
                          <button type="button" role="menuitem" className="regler-dots-item" onClick={() => handleEditArticle(i)}>
                            Redigera
                          </button>
                          <button type="button" role="menuitem" className="regler-dots-item" onClick={() => handleDeleteArticle(i)}>
                            Ta bort
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {testArticle && (
            <p className="regler-selected-product" aria-live="polite">
              Vald: <strong>{testArticle.id}</strong> · {testArticle.name || '—'} · {formatArticlePackaging(testArticle)}
            </p>
          )}
          <div className="regler-test-row regler-test-row--qty">
            <input
              type="number"
              min={0}
              value={testQty || ''}
              onChange={e => setTestQty(Number(e.target.value) || 0)}
              placeholder="Antal"
              className="regler-qty"
            />
            {testArticleId && testPlan && (
              <span className="regler-result">
                → <strong>{testPlan.noteText}</strong> (totalt {testPlan.pickQtyTotal})
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="regler-section">
        <h2>Finjustera regler</h2>
        <p className="regler-hint regler-hint--short">Tallrikar (KA), glas (BA) och bestick. Ändringar sparas automatiskt i webbläsaren. Klicka &quot;Spara regler&quot; nedan för att vara säker.</p>

        <details className="regler-details">
          <summary>Tallrikar (KA)</summary>
          <p className="regler-hint regler-hint--short">Antal per kassett, när en full kassett ska plockas, och olika extra beroende på beställningsstorlek.</p>
          <div className="regler-grid regler-grid--tight">
            <label><span>Antal/kassett (standard)</span><input type="number" min={1} value={rules.ka.defaultQuantityPerCassette} onChange={e => updateKA({ defaultQuantityPerCassette: Number(e.target.value) || 25 })} /></label>
          </div>
          <div className="regler-thresholds">
            <span className="regler-thresholds-label">Plocka full kassett om kunden beställer ≥</span>
            {(rules.ka.thresholds ?? []).map((t, i) => (
              <label key={i} className="regler-threshold-row">
                <span>{t.quantityInCassette} st i kassett</span>
                <input type="number" min={0} value={t.pickFullCassetteIfOrderedAtLeast} onChange={e => updateKA({ thresholds: (rules.ka.thresholds ?? []).map((x, j) => j === i ? { ...x, pickFullCassetteIfOrderedAtLeast: Number(e.target.value) || 0 } : x) })} />
                <span>tallrikar</span>
              </label>
            ))}
          </div>
          <div className="regler-thresholds regler-margins">
            <span className="regler-thresholds-label">Extra per beställningsstorlek: om beställt ≤</span>
            {(rules.ka.margins ?? []).map((m, i) => (
              <label key={i} className="regler-threshold-row">
                <input type="number" min={0} value={m.maxOrdered} onChange={e => updateKA({ margins: (rules.ka.margins ?? []).map((x, j) => j === i ? { ...x, maxOrdered: Number(e.target.value) || 0 } : x) })} />
                <span>st → lägg på</span>
                <input type="number" min={0} value={m.extra} onChange={e => updateKA({ margins: (rules.ka.margins ?? []).map((x, j) => j === i ? { ...x, extra: Number(e.target.value) || 0 } : x) })} />
                <span>extra</span>
              </label>
            ))}
          </div>
          <div className="regler-grid regler-grid--tight regler-large-order">
            <label><span>Vid beställning ≥ (st)</span><input type="number" min={0} value={rules.ka.largeOrderRoundUpFrom} onChange={e => updateKA({ largeOrderRoundUpFrom: Number(e.target.value) || 500 })} /></label>
            <label><span>Extra kassetter vid stora beställningar</span><input type="number" min={0} value={rules.ka.largeOrderExtraUnits ?? 0} onChange={e => updateKA({ largeOrderExtraUnits: Number(e.target.value) || 0 })} /></label>
          </div>
        </details>

        <details className="regler-details">
          <summary>Glas (BA)</summary>
          <p className="regler-hint regler-hint--short">Antal per back, när en full back ska plockas, och olika extra beroende på beställningsstorlek (t.ex. extra back vid stora beställningar).</p>
          <div className="regler-grid regler-grid--tight">
            <label><span>Antal/back (standard)</span><input type="number" min={1} value={rules.ba.defaultQuantityPerCrate} onChange={e => updateBA({ defaultQuantityPerCrate: Number(e.target.value) || 25 })} /></label>
          </div>
          <div className="regler-thresholds">
            <span className="regler-thresholds-label">Plocka full back om kunden beställer ≥</span>
            {(rules.ba.thresholds ?? []).map((t, i) => (
              <label key={i} className="regler-threshold-row">
                <span>{t.quantityInCrate} st i back</span>
                <input type="number" min={0} value={t.pickFullCrateIfOrderedAtLeast} onChange={e => updateBA({ thresholds: (rules.ba.thresholds ?? []).map((x, j) => j === i ? { ...x, pickFullCrateIfOrderedAtLeast: Number(e.target.value) || 0 } : x) })} />
                <span>glas</span>
              </label>
            ))}
          </div>
          <div className="regler-thresholds regler-margins">
            <span className="regler-thresholds-label">Extra per beställningsstorlek: om beställt ≤</span>
            {(rules.ba.margins ?? []).map((m, i) => (
              <label key={i} className="regler-threshold-row">
                <input type="number" min={0} value={m.maxOrdered} onChange={e => updateBA({ margins: (rules.ba.margins ?? []).map((x, j) => j === i ? { ...x, maxOrdered: Number(e.target.value) || 0 } : x) })} />
                <span>st → lägg på</span>
                <input type="number" min={0} value={m.extra} onChange={e => updateBA({ margins: (rules.ba.margins ?? []).map((x, j) => j === i ? { ...x, extra: Number(e.target.value) || 0 } : x) })} />
                <span>extra</span>
              </label>
            ))}
          </div>
          <div className="regler-grid regler-grid--tight regler-large-order">
            <label><span>Vid beställning ≥ (st)</span><input type="number" min={0} value={rules.ba.largeOrderRoundUpFrom} onChange={e => updateBA({ largeOrderRoundUpFrom: Number(e.target.value) || 500 })} /></label>
            <label><span>Extra backar vid stora beställningar</span><input type="number" min={0} value={rules.ba.largeOrderExtraUnits ?? 0} onChange={e => updateBA({ largeOrderExtraUnits: Number(e.target.value) || 0 })} /></label>
          </div>
        </details>

        <details className="regler-details">
          <summary>Bestick</summary>
          <p className="regler-hint regler-hint--short">Olika extra beroende på beställningsstorlek. Under tröskel plockas exakt; per intervall läggs ett tillägg på (t.ex. 500 st → +10 extra).</p>
          <div className="regler-grid regler-grid--tight">
            <label><span>Exakt under (st)</span><input type="number" min={0} value={rules.bestick.exactBelow} onChange={e => updateBESTICK({ exactBelow: Number(e.target.value) || 50 })} /></label>
          </div>
          <div className="regler-thresholds">
            <span className="regler-thresholds-label">Extra per intervall: beställt</span>
            {rules.bestick.ranges.map((r, i) => (
              <label key={i} className="regler-threshold-row">
                <span>{r.minOrdered}–{r.maxOrdered === Infinity ? '∞' : r.maxOrdered} st →</span>
                <input type="number" min={0} value={r.extra} onChange={e => updateBESTICK({ ranges: rules.bestick.ranges.map((x, j) => j === i ? { ...x, extra: Number(e.target.value) || 0 } : x) })} />
                <span>extra</span>
              </label>
            ))}
          </div>
        </details>
      </section>

      <div className="regler-actions">
        <button type="button" className="regler-save" onClick={handleSaveRules}>
          Spara regler
        </button>
        <button type="button" className="regler-reset" onClick={() => setRules(defaultPlockbotRules)}>
          Återställ standardregler
        </button>
      </div>

      {newArticleModalOpen && (
        <div className="regler-modal-backdrop" onClick={() => setNewArticleModalOpen(false)} role="presentation">
          <div className="regler-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="regler-modal-title">
            <h2 id="regler-modal-title" className="regler-modal-title">Ny artikel</h2>
            <div className="regler-article-form-grid">
              <label>
                <span>Artikelnummer</span>
                <input
                  type="text"
                  value={newArticleDraft.id}
                  onChange={e => setNewArticleDraft(d => ({ ...d, id: e.target.value }))}
                  placeholder="t.ex. 12345"
                  aria-label="Artikelnummer"
                />
              </label>
              <label>
                <span>Namn / beskrivning</span>
                <input
                  type="text"
                  value={newArticleDraft.name ?? ''}
                  onChange={e => setNewArticleDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Artikelnamn"
                  aria-label="Namn eller beskrivning"
                />
              </label>
              <label>
                <span>Typ</span>
                <select
                  value={newArticleDraft.category}
                  onChange={e => setNewArticleDraft(d => ({ ...d, category: e.target.value as ArticleCategory }))}
                  aria-label="Typ"
                >
                  <option value="ANNAT">Styck</option>
                  <option value="PORSLIN">Tallrikar (KA)</option>
                  <option value="GLAS">Glas (BA)</option>
                  <option value="BESTICK">Bestick</option>
                </select>
              </label>
              {newArticleDraft.category === 'PORSLIN' && (
                <label>
                  <span>Antal per kassett</span>
                  <input
                    type="number"
                    min={1}
                    value={newArticleDraft.ka !== undefined && newArticleDraft.ka !== null ? String(newArticleDraft.ka) : ''}
                    onChange={e => setNewArticleDraft(d => ({ ...d, ka: e.target.value === '' ? undefined : Number(e.target.value) || undefined }))}
                    placeholder="25"
                    aria-label="Antal per kassett"
                  />
                </label>
              )}
              {newArticleDraft.category === 'GLAS' && (
                <label>
                  <span>Antal per back</span>
                  <input
                    type="number"
                    min={1}
                    value={newArticleDraft.ba !== undefined && newArticleDraft.ba !== null ? String(newArticleDraft.ba) : ''}
                    onChange={e => setNewArticleDraft(d => ({ ...d, ba: e.target.value === '' ? undefined : Number(e.target.value) || undefined }))}
                    placeholder="25"
                    aria-label="Antal per back"
                  />
                </label>
              )}
            </div>
            <div className="regler-modal-actions">
              <button type="button" className="regler-form-save" onClick={handleSaveNewArticle} disabled={!newArticleDraft.id.trim()}>
                Spara
              </button>
              <button type="button" className="regler-form-cancel" onClick={() => setNewArticleModalOpen(false)}>
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
