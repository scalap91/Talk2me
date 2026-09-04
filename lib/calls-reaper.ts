import 'server-only';
/**
 * TIMEOUT SERVEUR des appels (Pascal 2026-09-04) — filet de sécurité quand l'app de l'appelant
 * est morte/hors-ligne et n'a pas pu raccrocher (le Timer app de 45 s ne suffit pas seul).
 *
 * `reapStaleCalls` (lib/db) clôt en base les appels fantômes ('ringing' > 60 s → no_answer,
 * 'accepted' > 4 h → ended). ICI, en plus, on POUSSE un event 'call:hangup' aux deux participants
 * pour que l'appareil qui SONNE ENCORE ferme son écran (sinon « iOS sonne dans le vide »).
 *
 * Déclenchement : (1) balayage global toutes les 15 s tant que le process vit — armé paresseusement
 * dès qu'un client ouvre son flux /api/me/events ; (2) au coup par coup via reapAndNotify().
 */
import { reapStaleCalls } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export function reapAndNotify(now: number = Date.now()): number {
  let ghosts;
  try { ghosts = reapStaleCalls(now); } catch { return 0; }
  for (const c of ghosts) {
    const reason = c.state === 'no_answer' ? 'no_answer' : 'network_error';
    for (const uid of [c.callee_id, c.caller_id]) {
      if (!uid) continue;
      try {
        publish(`user:${uid}`, { kind: 'call:hangup', data: { call_id: c.id, at: now, end_reason: reason } });
      } catch { /* best-effort */ }
    }
  }
  return ghosts.length;
}

let _timer: ReturnType<typeof setInterval> | null = null;

/** Arme le balayage global (idempotent). Appelé quand un client se connecte à /api/me/events. */
export function ensureCallReaper(): void {
  if (_timer) return;
  _timer = setInterval(() => { reapAndNotify(); }, 15_000);
  // Ne bloque pas l'arrêt du process (Node).
  if (typeof _timer === 'object' && _timer && 'unref' in _timer) {
    (_timer as unknown as { unref: () => void }).unref();
  }
}
