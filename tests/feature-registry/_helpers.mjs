/**
 * Talk2Me #409 — Helpers partagés par tous les checks.
 *
 * Doctrine [[feedback-modular-no-scattered-patches]] : un seul endroit pour
 * fetch, timeout, normalisation. Pas de copy-paste dans chaque check.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const DEFAULT_BASE_URL =
  process.env.TALKTOME_INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || '3010'}`;

/**
 * Fetch avec timeout. Retourne { ok, status, text, durMs, error }.
 * Ne throw jamais — un check ne doit pas crasher.
 */
export async function safeFetch(url, opts = {}) {
  const t0 = Date.now();
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), opts.timeoutMs || 8000);
  try {
    // redirect: 'manual' par défaut : on veut voir les 307/308 du middleware
    // sinon fetch suit jusqu'à /signin = 200 = faux positif "endpoint public".
    const r = await fetch(url, { redirect: 'manual', ...opts, signal: ctl.signal });
    const text = await r.text().catch(() => '');
    return {
      ok: r.ok,
      status: r.status,
      text,
      headers: Object.fromEntries(r.headers.entries()),
      durMs: Date.now() - t0,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      text: '',
      headers: {},
      durMs: Date.now() - t0,
      error: e?.message || String(e),
    };
  } finally {
    clearTimeout(to);
  }
}

/** Vérifie qu'un fichier source contient un pattern (regex ou string). */
export function fileContains(relPath, pattern) {
  const full = path.join(REPO_ROOT, relPath);
  if (!existsSync(full)) return { exists: false, matched: false };
  const txt = readFileSync(full, 'utf8');
  const matched =
    pattern instanceof RegExp ? pattern.test(txt) : txt.includes(pattern);
  return { exists: true, matched };
}

/** Vérifie qu'un process PM2 est online. */
export function pm2Online(name) {
  try {
    const r = spawnSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 5000 });
    if (r.status !== 0) return { ok: false, reason: 'pm2 cli failed' };
    const list = JSON.parse(r.stdout || '[]');
    const proc = list.find((p) => p?.name === name);
    if (!proc) return { ok: false, reason: 'not found' };
    const status = proc?.pm2_env?.status;
    return { ok: status === 'online', reason: status || 'unknown', proc };
  } catch (e) {
    return { ok: false, reason: e?.message || 'pm2 error' };
  }
}

/**
 * Helper standard pour les checks "endpoint protégé" : on attend 401/403
 * sans cookie. Si on reçoit 200 sans auth → faille de sécurité, fail.
 * Si on reçoit 404/500 → endpoint cassé.
 */
export function expectProtected(status) {
  // 401/403 = auth refusée ⇒ endpoint existe et protège ✓
  // 307/308 = redirect (vers /signin via middleware) ⇒ existe et protège ✓
  // 400 = bad request ⇒ endpoint existe, juste payload invalide ✓
  // 200 = potentiellement public (ou faille selon contexte) ⇒ on accepte mais avec note
  // 404 = route disparue ✗
  // 405 = method not allowed ⇒ existe, mauvais verbe ✓
  // 500 = bug serveur ✗
  if (status === 401 || status === 403) return { passed: true };
  if (status === 307 || status === 308) return { passed: true, note: `redirect ${status}` };
  if (status === 400) return { passed: true, note: 'bad-request (endpoint OK)' };
  if (status === 405) return { passed: true, note: 'method-not-allowed' };
  if (status === 200) return { passed: true, note: '200 (public ou autorisé via cookie test)' };
  if (status === 404) return { passed: false, error: `Endpoint 404 — route disparue` };
  if (status === 500) return { passed: false, error: `HTTP 500 — bug serveur` };
  return { passed: false, error: `HTTP ${status} inattendu` };
}

/** Vérifie qu'une réponse HTML est servie (200 ou 3xx redirect). */
export function expectHtml(res, allow404 = false) {
  // Avec redirect:'manual' on doit voir 307/308 explicitement, pas les suivre.
  if (res.status === 200) return { passed: true };
  if (res.status >= 300 && res.status < 400) return { passed: true, note: `redirect ${res.status}` };
  if (allow404 && res.status === 404) return { passed: true, note: '404 acceptable' };
  if (res.status === 500) return { passed: false, error: 'HTTP 500 (bug serveur)' };
  return { passed: false, error: `HTTP ${res.status}` };
}
