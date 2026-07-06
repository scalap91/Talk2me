import 'server-only';
/**
 * Talk2Me — COMMANDES D'IMPORT (mandataire d'achat SHEIN/TEMU → Madagascar).
 * Le client commande sur T2M ; T2M (un opérateur) achète sur SHEIN/TEMU et fait livrer
 * à l'adresse FRANCE du transporteur, AVEC le nom du client final sur le colis ; le
 * transporteur achemine à Mada. Cette table pilote tout le suivi. Pascal 2026-06-28.
 */
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';

export type ImportStatus = 'to_order' | 'ordered' | 'received_fr' | 'shipped_mg' | 'delivered' | 'cancelled';
export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  to_order: 'À commander', ordered: 'Commandé (vers France)', received_fr: 'Reçu en France',
  shipped_mg: 'Expédié Mada', delivered: 'Livré', cancelled: 'Annulé',
};

export interface ImportOrder {
  id: string; code: string; user_id: string;
  client_name: string; mada_address: string; mada_phone: string | null;
  source: string; product_title: string; product_url: string | null; product_image: string | null;
  variant: string | null; qty: number; product_price_cents: number | null;
  status: ImportStatus; fr_tracking: string | null; mg_tracking: string | null;
  note: string | null; created_at: number; updated_at: number;
}

let ready = false;
function ensure() {
  if (ready) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS import_orders (
    id TEXT PRIMARY KEY, code TEXT NOT NULL, user_id TEXT NOT NULL,
    client_name TEXT NOT NULL, mada_address TEXT NOT NULL, mada_phone TEXT,
    source TEXT, product_title TEXT NOT NULL, product_url TEXT, product_image TEXT,
    variant TEXT, qty INTEGER NOT NULL DEFAULT 1, product_price_cents INTEGER,
    status TEXT NOT NULL DEFAULT 'to_order', fr_tracking TEXT, mg_tracking TEXT,
    note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );`);
  getDb().exec('CREATE INDEX IF NOT EXISTS idx_import_orders_user ON import_orders(user_id, created_at DESC);');
  getDb().exec('CREATE INDEX IF NOT EXISTS idx_import_orders_status ON import_orders(status, created_at DESC);');
  ready = true;
}

/** Code court lisible mis sur le colis (ex T2M-7F3A) pour que le transporteur identifie le client. */
function genCode(): string {
  const s = randomUUID().replace(/[^a-z0-9]/gi, '').toUpperCase();
  return 'T2M-' + s.slice(0, 4);
}

export function createImportOrder(userId: string, a: {
  clientName: string; madaAddress: string; madaPhone?: string | null;
  source?: string; productTitle: string; productUrl?: string | null; productImage?: string | null;
  variant?: string | null; qty?: number; productPriceCents?: number | null; note?: string | null;
}): ImportOrder | null {
  ensure();
  const name = (a.clientName || '').trim().slice(0, 120);
  const addr = (a.madaAddress || '').trim().slice(0, 400);
  const title = (a.productTitle || '').trim().slice(0, 300);
  if (!name || !addr || !title) return null;
  const id = randomUUID(); const now = Date.now();
  getDb().prepare(
    `INSERT INTO import_orders (id, code, user_id, client_name, mada_address, mada_phone, source, product_title, product_url, product_image, variant, qty, product_price_cents, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'to_order', ?, ?, ?)`
  ).run(id, genCode(), userId, name, addr, (a.madaPhone || '').trim() || null, (a.source || '').slice(0, 20) || null,
    title, a.productUrl || null, a.productImage || null, (a.variant || '').slice(0, 120) || null,
    Math.max(1, Math.round(a.qty || 1)), a.productPriceCents ?? null, (a.note || '').slice(0, 500) || null, now, now);
  return getImportOrder(id);
}

export function getImportOrder(id: string): ImportOrder | null {
  ensure();
  return (getDb().prepare('SELECT * FROM import_orders WHERE id = ?').get(id) as ImportOrder) || null;
}

export function listMyImportOrders(userId: string): ImportOrder[] {
  ensure();
  return getDb().prepare('SELECT * FROM import_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(userId) as ImportOrder[];
}

export function listAllImportOrders(status?: ImportStatus): ImportOrder[] {
  ensure();
  if (status) return getDb().prepare('SELECT * FROM import_orders WHERE status = ? ORDER BY created_at DESC LIMIT 300').all(status) as ImportOrder[];
  return getDb().prepare('SELECT * FROM import_orders ORDER BY created_at DESC LIMIT 300').all() as ImportOrder[];
}

const FLOW: ImportStatus[] = ['to_order', 'ordered', 'received_fr', 'shipped_mg', 'delivered'];
export function updateImportStatus(id: string, status: ImportStatus, extra?: { fr_tracking?: string | null; mg_tracking?: string | null }): ImportOrder | null {
  ensure();
  const sets = ['status = ?', 'updated_at = ?']; const vals: (string | number | null)[] = [status, Date.now()];
  if (extra?.fr_tracking !== undefined) { sets.push('fr_tracking = ?'); vals.push((extra.fr_tracking || '').trim() || null); }
  if (extra?.mg_tracking !== undefined) { sets.push('mg_tracking = ?'); vals.push((extra.mg_tracking || '').trim() || null); }
  getDb().prepare(`UPDATE import_orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  return getImportOrder(id);
}
export const IMPORT_FLOW = FLOW;
