import 'server-only';

/**
 * GARDE-FOU CAPACITÉ (Pascal 2026-07-09) — prévient AVANT le mur du serveur unique / SQLite.
 * Signal = nombre d'INSCRITS + ACTIFS (24h / 7j). Quand ça approche des seuils, ça ABOIE sur
 * Telegram (doctrine watchdog) → on a des semaines d'avance pour lancer la bascule multi-serveur (#53).
 * Seuils RÉGLABLES PAR L'ADMIN (app_settings). Anti-spam : une alerte par niveau et par jour.
 */
import { getDb } from '@/lib/db';
import { getSetting, setSetting, getOps } from '@/lib/app-settings';
import { notifyTelegram } from '@/lib/ai-ops/telegram';

export interface CapacityStats {
  registered: number;
  dau: number;   // actifs < 24h
  wau: number;   // actifs < 7j
  level: 'ok' | 'warn' | 'crit';
  thresholds: { warnRegistered: number; critRegistered: number; warnDau: number; critDau: number };
}

// Seuils RÉGLABLES PAR L'ADMIN via le registre OPS (getOps) — plus de constantes en dur.
function threshold(key: 'warnRegistered' | 'critRegistered' | 'warnDau' | 'critDau'): number {
  return getOps('capacity.' + key);
}

export function getCapacityStats(): CapacityStats {
  const db = getDb();
  const now = Date.now();
  const q = (sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { n: number } | undefined)?.n || 0;
  const registered = q('SELECT COUNT(*) AS n FROM users');
  const dau = q('SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?', now - 24 * 60 * 60 * 1000);
  const wau = q('SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?', now - 7 * 24 * 60 * 60 * 1000);
  const th = { warnRegistered: threshold('warnRegistered'), critRegistered: threshold('critRegistered'), warnDau: threshold('warnDau'), critDau: threshold('critDau') };
  const level: CapacityStats['level'] =
    registered >= th.critRegistered || dau >= th.critDau ? 'crit'
    : registered >= th.warnRegistered || dau >= th.warnDau ? 'warn'
    : 'ok';
  return { registered, dau, wau, level, thresholds: th };
}

/** Vérifie la capacité et ABOIE sur Telegram si on approche/dépasse un seuil (1×/niveau/jour). */
export function checkCapacity(day?: string): CapacityStats & { alerted: boolean } {
  const s = getCapacityStats();
  if (s.level === 'ok') return { ...s, alerted: false };
  // Anti-spam : une alerte par (niveau, jour). `day` injecté (YYYY-MM-DD) pour rester déterministe.
  const marker = `${s.level}:${day || ''}`;
  if (day && getSetting('capacity.last_alert', '') === marker) return { ...s, alerted: false };
  const icon = s.level === 'crit' ? '🔴' : '🟠';
  const msg =
    `${icon} CAPACITÉ Talk2Me — ${s.level.toUpperCase()}\n` +
    `Inscrits : ${s.registered.toLocaleString('fr')} (seuils ${s.thresholds.warnRegistered.toLocaleString('fr')}/${s.thresholds.critRegistered.toLocaleString('fr')})\n` +
    `Actifs 24h : ${s.dau.toLocaleString('fr')} · 7j : ${s.wau.toLocaleString('fr')} (seuils ${s.thresholds.warnDau.toLocaleString('fr')}/${s.thresholds.critDau.toLocaleString('fr')})\n` +
    `→ On approche du mur serveur unique / SQLite. Prépare la bascule multi-serveur + Postgres (tâche #53).`;
  notifyTelegram(msg);
  if (day) setSetting('capacity.last_alert', marker);
  return { ...s, alerted: true };
}
