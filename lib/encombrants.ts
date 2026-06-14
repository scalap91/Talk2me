'use server-only';

/**
 * Talk2Me — CALENDRIER ENCOMBRANTS PAR VILLE (Pascal 2026-06-10).
 * On n'impose JAMAIS une date : chaque ville a son propre rythme de collecte des
 * encombrants. La règle est PROGRAMMÉE par les users (grounding : on n'invente
 * pas de calendrier — tant qu'une ville n'a pas été renseignée, pas de date
 * proposée). Une fois une ville renseignée, l'appli calcule la prochaine collecte
 * pour tous ceux qui publient depuis cette ville.
 *
 * Règle = { freq, weekday, week } :
 *   - freq 'weekly'  : chaque semaine ce jour-là (week ignoré)
 *   - freq 'monthly' : le Nᵉ <weekday> du mois (week = 1..4 ou 'last')
 */

import { getDb } from '@/lib/db';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS encombrants_schedules (
      city_key TEXT PRIMARY KEY,     -- ville normalisée (minuscule, sans accents)
      city_label TEXT NOT NULL,      -- ville telle que saisie
      freq TEXT NOT NULL,            -- 'weekly' | 'monthly'
      weekday INTEGER NOT NULL,      -- 0=dim … 6=sam
      week TEXT NOT NULL DEFAULT 'last', -- '1'|'2'|'3'|'4'|'last' (monthly)
      set_by TEXT,
      updated_at INTEGER NOT NULL
    );
  `);
  ensured = true;
}

export interface EncombrantsRule { freq: 'weekly' | 'monthly'; weekday: number; week: string }
export interface EncombrantsSchedule extends EncombrantsRule { city_key: string; city_label: string; updated_at: number }

export function cityKey(city: string): string {
  return (city || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Calcule la prochaine date (YYYY-MM-DD) d'une règle, à partir d'aujourd'hui inclus. */
export function nextCollectionDate(rule: EncombrantsRule, from: Date = new Date()): string | null {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (rule.freq === 'weekly') {
    const d = new Date(today);
    const delta = (rule.weekday - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + delta);
    return iso(d);
  }

  // monthly : Nᵉ (ou dernier) <weekday> du mois, en regardant jusqu'à 4 mois devant.
  for (let m = 0; m < 4; m++) {
    const year = today.getFullYear();
    const month = today.getMonth() + m;
    let day: Date | null = null;
    if (rule.week === 'last') {
      const d = new Date(year, month + 1, 0); // dernier jour du mois
      while (d.getDay() !== rule.weekday) d.setDate(d.getDate() - 1);
      day = d;
    } else {
      const n = Math.max(1, Math.min(4, parseInt(rule.week, 10) || 1));
      const d = new Date(year, month, 1);
      while (d.getDay() !== rule.weekday) d.setDate(d.getDate() + 1); // 1er <weekday>
      d.setDate(d.getDate() + (n - 1) * 7);
      if (d.getMonth() === ((month % 12) + 12) % 12) day = d; // existe bien ce mois-ci
    }
    if (day && day >= today) return iso(day);
  }
  return null;
}

export function getSchedule(city: string): EncombrantsSchedule | null {
  ensure();
  const key = cityKey(city);
  if (!key) return null;
  const row = getDb().prepare('SELECT * FROM encombrants_schedules WHERE city_key = ?').get(key) as
    (EncombrantsSchedule & { weekday: number }) | undefined;
  return row || null;
}

export function setSchedule(city: string, rule: EncombrantsRule, setBy?: string): EncombrantsSchedule | null {
  ensure();
  const key = cityKey(city);
  if (!key) return null;
  const freq = rule.freq === 'weekly' ? 'weekly' : 'monthly';
  const weekday = Math.max(0, Math.min(6, Math.round(rule.weekday)));
  const week = ['1', '2', '3', '4', 'last'].includes(rule.week) ? rule.week : 'last';
  getDb().prepare(
    `INSERT INTO encombrants_schedules (city_key, city_label, freq, weekday, week, set_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(city_key) DO UPDATE SET city_label=excluded.city_label, freq=excluded.freq,
       weekday=excluded.weekday, week=excluded.week, set_by=excluded.set_by, updated_at=excluded.updated_at`
  ).run(key, city.trim().slice(0, 80), freq, weekday, week, setBy || null, Date.now());
  return getSchedule(city);
}
