'use server-only';

/**
 * Talk2Me — FILE DE VALIDATION CURATION (Pascal 2026-06-10). Chaîne à 3 crans :
 * REGARDEUR propose une sélection (fiches propres+traduites) → « en cours de
 * validation » → alerte → VALIDATEUR/ADMIN valide → publiée → confirmation au
 * regardeur. Rappel si une fiche stagne. Le regardeur ne voit jamais le code API.
 */

import { getDb, getUserById } from '@/lib/db';
import { randomUUID } from 'crypto';
import { notifyTelegram } from '@/lib/ai-ops/telegram';
import { publishSelection, type SelItem } from '@/lib/dropship-publish';

const STALE_MS = 24 * 60 * 60 * 1000; // rappel après 24 h en attente

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS fiche_submissions (
      id TEXT PRIMARY KEY,
      submitted_by TEXT NOT NULL,
      name TEXT,
      items_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'validated' | 'rejected'
      validator_id TEXT,
      note TEXT,
      boutique_slug TEXT,
      created_at INTEGER NOT NULL,
      decided_at INTEGER,
      reminded_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_fsub_status ON fiche_submissions(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_fsub_by ON fiche_submissions(submitted_by, created_at DESC);
  `);
  ensured = true;
}

export interface Submission { id: string; submitted_by: string; submitter_name?: string | null; name: string | null; items: SelItem[]; count: number; status: string; note: string | null; boutique_slug: string | null; created_at: number; decided_at: number | null }

function row2sub(r: Record<string, unknown>): Submission {
  const items = JSON.parse((r.items_json as string) || '[]') as SelItem[];
  return {
    id: r.id as string, submitted_by: r.submitted_by as string,
    name: (r.name as string) || null, items, count: items.length,
    status: r.status as string, note: (r.note as string) || null,
    boutique_slug: (r.boutique_slug as string) || null,
    created_at: r.created_at as number, decided_at: (r.decided_at as number) ?? null,
  };
}

/** REGARDEUR propose une sélection → file d'attente + alerte. */
export function submitFiches(userId: string, name: string, items: SelItem[]): { ok: boolean; error?: string; id?: string } {
  ensure();
  const clean = (items || []).filter((i) => i && i.pid && i.image && i.name).slice(0, 60);
  if (!clean.length) return { ok: false, error: 'no_items' };
  const id = randomUUID();
  getDb().prepare('INSERT INTO fiche_submissions (id, submitted_by, name, items_json, status, created_at) VALUES (?, ?, ?, ?, \'pending\', ?)')
    .run(id, userId, (name || 'Sélection').slice(0, 80), JSON.stringify(clean), Date.now());
  const u = getUserById(userId);
  notifyTelegram(`🗂️ Curation — @${u?.username || '?'} propose « ${name || 'Sélection'} » (${clean.length} fiches) à valider.`);
  return { ok: true, id };
}

/** File des fiches à valider (validateur/admin). */
export function listPending(): Submission[] {
  ensure();
  const rows = getDb().prepare("SELECT * FROM fiche_submissions WHERE status = 'pending' ORDER BY created_at ASC").all() as Record<string, unknown>[];
  return rows.map((r) => { const s = row2sub(r); const u = getUserById(s.submitted_by); s.submitter_name = u?.username || null; return s; });
}

/** Mes propositions (regardeur) — pour voir les confirmations. */
export function listMine(userId: string): Submission[] {
  ensure();
  const rows = getDb().prepare('SELECT * FROM fiche_submissions WHERE submitted_by = ? ORDER BY created_at DESC LIMIT 50').all(userId) as Record<string, unknown>[];
  return rows.map(row2sub);
}

export function getSubmission(id: string): Submission | null {
  ensure();
  const r = getDb().prepare('SELECT * FROM fiche_submissions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? row2sub(r) : null;
}

/** VALIDATEUR/ADMIN décide. Validé → publie pour le regardeur + confirme. */
export async function decideSubmission(id: string, validatorId: string, decision: 'validated' | 'rejected', note?: string): Promise<{ ok: boolean; error?: string; slug?: string }> {
  ensure();
  const sub = getSubmission(id);
  if (!sub) return { ok: false, error: 'not_found' };
  if (sub.status !== 'pending') return { ok: false, error: 'already_decided' };
  const u = getUserById(sub.submitted_by);

  if (decision === 'rejected') {
    getDb().prepare("UPDATE fiche_submissions SET status='rejected', validator_id=?, note=?, decided_at=? WHERE id=?").run(validatorId, (note || '').slice(0, 300) || null, Date.now(), id);
    notifyTelegram(`🗂️ Curation — « ${sub.name} » de @${u?.username || '?'} REFUSÉE.`);
    return { ok: true };
  }

  // Validée → on publie la boutique AU NOM du regardeur (c'est sa sélection).
  const pub = await publishSelection(sub.submitted_by, { name: sub.name || 'Sélection', items: sub.items });
  if (!pub.ok) return { ok: false, error: pub.error || 'publish_failed' };
  getDb().prepare("UPDATE fiche_submissions SET status='validated', validator_id=?, note=?, boutique_slug=?, decided_at=? WHERE id=?").run(validatorId, (note || '').slice(0, 300) || null, pub.slug || null, Date.now(), id);
  notifyTelegram(`✅ Curation — « ${sub.name} » de @${u?.username || '?'} VALIDÉE & publiée (${pub.count} fiches).`);
  return { ok: true, slug: pub.slug };
}

/** Rappel des fiches qui stagnent en validation (lazy cron : appelé au chargement de la file). */
export function remindStale(): number {
  ensure();
  const cutoff = Date.now() - STALE_MS;
  const stale = getDb().prepare("SELECT id, name, submitted_by FROM fiche_submissions WHERE status='pending' AND created_at < ? AND (reminded_at IS NULL OR reminded_at < ?)").all(cutoff, Date.now() - STALE_MS) as { id: string; name: string; submitted_by: string }[];
  if (!stale.length) return 0;
  getDb().prepare("UPDATE fiche_submissions SET reminded_at=? WHERE status='pending' AND created_at < ?").run(Date.now(), cutoff);
  notifyTelegram(`⏰ Curation — ${stale.length} fiche(s) en attente de validation depuis +24 h : ${stale.map((s) => s.name).join(', ')}. À traiter.`);
  return stale.length;
}
