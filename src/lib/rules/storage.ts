import type { Article, PlockbotRules } from './types';
import { defaultPlockbotRules } from './defaultRules';

const RULES_KEY = 'plockbot_rules';
const ARTICLES_KEY = 'plockbot_articles';
const TYPE_COLUMN_OVERRIDE_KEY = 'plockbot_type_column';
const ARTICLE_RAW_ROWS_KEY = 'plockbot_article_raw_rows';
const COMPANY_ID_KEY = 'plockbot_company_id';
const MAX_PERSISTED_ROWS = 2000;

/** Backend-URL för Plockbot API (Spara/Hämta regler till Supabase). Sätt t.ex. VITE_PLOCKBOT_API_URL eller VITE_BACKEND_URL. */
function getApiBaseUrl(): string | null {
  if (typeof import.meta.env?.VITE_PLOCKBOT_API_URL === 'string' && import.meta.env.VITE_PLOCKBOT_API_URL) {
    return import.meta.env.VITE_PLOCKBOT_API_URL.replace(/\/$/, '');
  }
  if (typeof import.meta.env?.VITE_BACKEND_URL === 'string' && import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '');
  }
  return null;
}

/** company_id som skickas till API (per företag). Kan sättas via URL ?companyId= eller localStorage. */
export function getPlockbotCompanyId(): string {
  if (typeof window === 'undefined') return 'default';
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('companyId') ?? params.get('company_id');
  if (fromUrl) return fromUrl;
  try {
    const fromStorage = localStorage.getItem(COMPANY_ID_KEY);
    if (fromStorage) return fromStorage;
  } catch {
    // ignore
  }
  return 'default';
}

export function setPlockbotCompanyId(companyId: string | null): void {
  try {
    if (companyId == null) localStorage.removeItem(COMPANY_ID_KEY);
    else localStorage.setItem(COMPANY_ID_KEY, companyId);
  } catch {
    // ignore
  }
}

export function loadRules(): PlockbotRules {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return defaultPlockbotRules;
    const parsed = JSON.parse(raw) as PlockbotRules;
    return mergeWithDefaults(parsed);
  } catch {
    return defaultPlockbotRules;
  }
}

/** Hämtar regler från Supabase (backend). Returnerar null om API inte är konfigurerat eller misslyckas. */
export async function loadRulesFromApi(): Promise<PlockbotRules | null> {
  const base = getApiBaseUrl();
  if (!base) return null;
  try {
    const companyId = getPlockbotCompanyId();
    const res = await fetch(`${base}/api/plockbot/rules?companyId=${encodeURIComponent(companyId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || data.rules == null) return null;
    return mergeWithDefaults(data.rules as Partial<PlockbotRules>);
  } catch {
    return null;
  }
}

function mergeWithDefaults(partial: Partial<PlockbotRules>): PlockbotRules {
  const ka = { ...defaultPlockbotRules.ka, ...partial.ka };
  const ba = { ...defaultPlockbotRules.ba, ...partial.ba };
  if (ka.thresholds && defaultPlockbotRules.ka.thresholds) {
    ka.thresholds = ka.thresholds.map(t => {
      const def = defaultPlockbotRules.ka.thresholds!.find(d => d.quantityInCassette === t.quantityInCassette);
      return def ? { ...def, ...t } : t;
    });
  }
  if (ba.thresholds && defaultPlockbotRules.ba.thresholds) {
    ba.thresholds = ba.thresholds.map(t => {
      const def = defaultPlockbotRules.ba.thresholds!.find(d => d.quantityInCrate === t.quantityInCrate);
      return def ? { ...def, ...t } : t;
    });
  }
  return { ka, ba, bestick: { ...defaultPlockbotRules.bestick, ...partial.bestick } };
}

/**
 * Sparar regler. Om VITE_PLOCKBOT_API_URL eller VITE_BACKEND_URL är satt sparas till Supabase via backend.
 * Lokal lagring används alltid som kopia och som fallback om API saknas.
 * Kastar om API-anropet misslyckas (när API-URL är satt).
 */
export async function saveRules(rules: PlockbotRules): Promise<void> {
  const base = getApiBaseUrl();
  if (base) {
    const companyId = getPlockbotCompanyId();
    const res = await fetch(`${base}/api/plockbot/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, rules }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Spara misslyckades (${res.status})`);
    }
  }
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch (e) {
    if (base) return; // Supabase sparade OK
    throw e;
  }
}

type LegacyArticle = { articleCode?: string; articleName?: string; type?: string; quantityPerUnit?: number };

function isLegacyArticle(a: unknown): a is LegacyArticle {
  return typeof a === 'object' && a != null && 'articleCode' in a;
}

function migrateArticle(a: unknown): Article {
  if (!isLegacyArticle(a)) return a as Article;
  const type = (a.type || 'STYCK').toUpperCase();
  let category: Article['category'] = 'ANNAT';
  if (type === 'KA' || type === 'KASSETT') category = 'PORSLIN';
  else if (type === 'BA' || type === 'BACK') category = 'GLAS';
  else if (type === 'BESTICK') category = 'BESTICK';
  else if (type === 'GRUPPARTIKEL' || type === 'GRUPP') category = 'ANNAT';
  return {
    id: a.articleCode ?? '',
    name: a.articleName ?? '',
    category,
    ka: category === 'PORSLIN' ? (a.quantityPerUnit ?? undefined) : undefined,
    ba: category === 'GLAS' ? (a.quantityPerUnit ?? undefined) : undefined,
  };
}

export function loadArticles(): Article[] {
  try {
    const raw = localStorage.getItem(ARTICLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateArticle).filter((a): a is Article => Boolean(a.id));
  } catch {
    return [];
  }
}

export function saveArticles(articles: Article[]): void {
  localStorage.setItem(ARTICLES_KEY, JSON.stringify(articles));
}

/** 0-baserat kolumnindex för typ (KA/BA/BESTICK/ST). null = auto. */
export function getTypeColumnOverride(): number | null {
  try {
    const raw = localStorage.getItem(TYPE_COLUMN_OVERRIDE_KEY);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) || n < 0 ? null : n;
  } catch {
    return null;
  }
}

export function setTypeColumnOverride(index: number | null): void {
  if (index == null) localStorage.removeItem(TYPE_COLUMN_OVERRIDE_KEY);
  else localStorage.setItem(TYPE_COLUMN_OVERRIDE_KEY, String(index));
}

/** Sparar senast uppladdade artikel-Excel-rader så att typkolumn kan ändras utan att ladda upp igen. */
export function saveArticleRawRows(rows: (string | number)[][]): void {
  try {
    if (rows.length > MAX_PERSISTED_ROWS) return;
    localStorage.setItem(ARTICLE_RAW_ROWS_KEY, JSON.stringify(rows));
  } catch {
    // localStorage full eller för stor – ignorerar
  }
}

/** Hämtar sparade artikel-Excel-rader (om några). */
export function loadArticleRawRows(): (string | number)[][] | null {
  try {
    const raw = localStorage.getItem(ARTICLE_RAW_ROWS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as (string | number)[][];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}
