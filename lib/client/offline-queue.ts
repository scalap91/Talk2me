'use client';

/**
 * Talk2Me — File d'attente OFFLINE pour l'acheminement (Pascal 2026-06-22).
 * Réalité Mada : le porteur traverse des zones SANS réseau. Les actions (ping GPS, remise,
 * livraison) sont enregistrées LOCALEMENT et rejouées automatiquement au retour du réseau.
 * → la chaîne ne casse jamais hors couverture : le physique (main-à-main) continue, le
 *   numérique rattrape. Le code de remise (4 chiffres) est STATIQUE → la remise se fait
 *   face-à-face même sans réseau ; la preuve se synchronise après.
 */
const KEY = 't2m_transport_outbox';

type Pending = { id: string; url: string; body: unknown; ts: number };

function load(): Pending[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function save(q: Pending[]) { try { localStorage.setItem(KEY, JSON.stringify(q.slice(-100))); } catch { /* */ } }

/** POST réseau ; si offline/échec → mis en file et rejoué plus tard. */
export async function queuedPost(url: string, body: unknown): Promise<{ ok: boolean; queued?: boolean; data?: unknown }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok && (r.status === 0 || r.status >= 500)) throw new Error('net');
    return { ok: r.ok, data: await r.json().catch(() => null) };
  } catch {
    const q = load(); q.push({ id: Math.random().toString(36).slice(2), url, body, ts: Date.now() }); save(q);
    return { ok: false, queued: true };
  }
}

/** Rejoue tout ce qui est en attente (au retour réseau). */
export async function flushOutbox(): Promise<number> {
  let q = load(); if (!q.length) return 0;
  let done = 0;
  for (const item of [...q]) {
    try {
      const r = await fetch(item.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) });
      if (r.ok || (r.status >= 400 && r.status < 500)) { q = q.filter((x) => x.id !== item.id); done++; } // 4xx = traité/obsolète, on retire
    } catch { break; } // toujours offline → on s'arrête, on retentera
  }
  save(q);
  return done;
}

export function outboxCount(): number { return load().length; }

let started = false;
/** À appeler une fois : rejoue au retour réseau + périodiquement. */
export function startOutboxAutoFlush() {
  if (started || typeof window === 'undefined') return; started = true;
  window.addEventListener('online', () => { flushOutbox(); });
  setInterval(() => { if (navigator.onLine) flushOutbox(); }, 20_000);
  if (navigator.onLine) flushOutbox();
}
