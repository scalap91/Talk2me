/**
 * lib/schema/diag — moteur du CENTRE DE DIAGNOSTIC du cockpit (Pascal 2026-06-30).
 * Tests RÉELS là où c'est sûr (DB, shop-db, OSM public, app elle-même, joignabilité
 * des hôtes API) ; HONNÊTE là où un vrai appel consommerait du quota ou exposerait un
 * secret (présence clé + hôte joignable, JAMAIS la valeur). Aucun voyant bidon.
 * Doctrine PII : on ne lit/affiche jamais la valeur d'une clé, seulement sa présence.
 */
import { getDb } from '@/lib/db-core';
import { getShopDb } from '@/lib/shop-db';

export function isDevDiag(): boolean {
  return (
    (process.env.NEXT_DIST_DIR || '').startsWith('.next-') ||
    (process.env.TALKTOME_DB_PATH || '').includes('talktome-dev')
  );
}

export type DiagKind = 'db' | 'shopdb' | 'http-public' | 'http-reach' | 'env-only';

export interface DiagTarget {
  key: string; label: string; module?: string; kind: DiagKind;
  url?: string; env?: string[]; note?: string;
}

export const DIAG_TARGETS: DiagTarget[] = [
  { key: 'app', label: 'Application (self /home)', module: 'infrastructure', kind: 'http-public', url: 'https://dev.talk2me.fr/home' },
  { key: 'db', label: 'Base principale (db-core)', module: 'infrastructure', kind: 'db' },
  { key: 'shopdb', label: 'Base boutique (shop-db)', module: 'boutique', kind: 'shopdb' },
  { key: 'osm', label: 'OSM / Nominatim (géoloc IA)', module: 'ia', kind: 'http-public', url: 'https://nominatim.openstreetmap.org/search?format=json&q=antananarivo&limit=1' },
  { key: 'vision', label: 'Vision API (hôte + clé)', module: 'ia', kind: 'http-reach', url: process.env.VISION_BASE_URL, env: ['VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL'], note: 'Joignabilité + présence clé (pas d’appel modèle, pour préserver le quota).' },
  { key: 'aliexpress', label: 'AliExpress DS (hôte + clés)', module: 'boutique', kind: 'http-reach', url: 'https://api-sg.aliexpress.com', env: ['ALIEXPRESS_DS_APP_KEY', 'ALIEXPRESS_DS_APP_SECRET'], note: 'Joignabilité + présence clés (pas d’appel signé).' },
  { key: 'banggood', label: 'Banggood (clés)', module: 'boutique', kind: 'env-only', env: ['BANGGOOD_APP_ID', 'BANGGOOD_APP_SECRET'], note: 'En attente des clés de Pascal.' },
  { key: 'bigbuy', label: 'BigBuy (clés)', module: 'boutique', kind: 'env-only', env: ['BIGBUY_API_KEY', 'BIGBUY_BASE'], note: 'En attente clé sandbox.' },
];

export interface DiagResult {
  key: string; ok: boolean; ms: number; detail: string;
  env?: { name: string; present: boolean }[];
  note?: string; ts: number;
}

// Log en mémoire (par process) — « derniers appels + temps de réponse », réels.
const RECENT: DiagResult[] = [];
export function recentDiag(): DiagResult[] { return RECENT.slice(-30).reverse(); }

function envPresence(names: string[] = []) {
  return names.map((name) => ({ name, present: !!(process.env[name] && String(process.env[name]).length > 0) }));
}

async function timedFetch(url: string, opts: RequestInit = {}): Promise<{ res?: Response; ms: number; err?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': 'T2M-Cockpit-Diag/1.0', ...(opts.headers || {}) } });
    return { res, ms: Date.now() - t0 };
  } catch (e) {
    return { ms: Date.now() - t0, err: e instanceof Error ? e.message : 'fetch_error' };
  } finally {
    clearTimeout(timer);
  }
}

export async function runDiag(key: string): Promise<DiagResult> {
  const t = DIAG_TARGETS.find((x) => x.key === key);
  const ts = Date.now();
  if (!t) return { key, ok: false, ms: 0, detail: 'cible inconnue', ts };

  let r: DiagResult;
  try {
    if (t.kind === 'db' || t.kind === 'shopdb') {
      const t0 = Date.now();
      const db = t.kind === 'db' ? getDb() : getShopDb();
      const row = db.prepare('SELECT 1 AS x').get() as { x: number } | undefined;
      r = { key, ok: row?.x === 1, ms: Date.now() - t0, detail: row?.x === 1 ? 'SELECT 1 OK' : 'réponse inattendue', ts };
    } else if (t.kind === 'http-public') {
      const { res, ms, err } = await timedFetch(t.url!);
      r = { key, ok: !!res && res.ok, ms, detail: err ? `injoignable : ${err}` : `HTTP ${res!.status}`, ts };
    } else if (t.kind === 'http-reach') {
      const env = envPresence(t.env);
      if (!t.url) {
        r = { key, ok: false, ms: 0, detail: 'URL/hôte non configuré (variable absente)', env, note: t.note, ts };
      } else {
        const { res, ms, err } = await timedFetch(t.url, { method: 'GET' });
        // Joignable = n'importe quelle réponse HTTP (même 401/403/404).
        const reachable = !!res;
        const keysOk = env.every((e) => e.present);
        r = {
          key, ok: reachable && keysOk, ms,
          detail: err ? `hôte injoignable : ${err}` : `hôte joignable (HTTP ${res!.status})${keysOk ? '' : ' — clé(s) manquante(s)'}`,
          env, note: t.note, ts,
        };
      }
    } else {
      // env-only
      const env = envPresence(t.env);
      const keysOk = env.every((e) => e.present);
      r = { key, ok: keysOk, ms: 0, detail: keysOk ? 'clés présentes' : 'clé(s) absente(s) — test impossible', env, note: t.note, ts };
    }
  } catch (e) {
    r = { key, ok: false, ms: Date.now() - ts, detail: e instanceof Error ? e.message : 'erreur', ts };
  }

  RECENT.push(r);
  if (RECENT.length > 60) RECENT.splice(0, RECENT.length - 60);
  return r;
}
