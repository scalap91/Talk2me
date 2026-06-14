'use server-only';

/**
 * Talk2Me — ESCROW / verrou de transaction (Pascal 2026-06-09).
 *
 * Le cœur de l'économie d'échange : on BLOQUE l'argent de l'acheteur dans son
 * wallet, on le TIENT (escrow = la confiance), puis à la livraison on le
 * DÉBLOQUE en le répartissant (vendeur / livreur / user-commission / nous).
 *
 * S'appuie sur le Wallet existant (`wallet_transactions`, solde = somme).
 * ⚠️ MODE TEST : argent fictif tant qu'Orange Money / Paysend ne sont pas LIVE
 * (doctrine [[feedback-verifier-rail-paiement]]). Aucune promesse de gain réel.
 */

import { randomUUID } from 'crypto';
import { getDb, getWalletBalance } from '@/lib/db';

// Compte « plateforme » : reçoit NOTRE part. (user_id réservé, pas un vrai user.)
export const PLATFORM_USER_ID = 'platform';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS escrows (
      id TEXT PRIMARY KEY,
      order_ref TEXT,
      buyer_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'locked',   -- 'locked' | 'released' | 'refunded'
      breakdown_json TEXT NOT NULL,            -- [{user_id, role, amount_cents}]
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_escrow_buyer ON escrows(buyer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrows(status);
  `);
  ensured = true;
}

export interface EscrowPart { user_id: string; role: string; amount_cents: number }
export interface Escrow {
  id: string; order_ref: string | null; buyer_id: string; amount_cents: number;
  status: string; breakdown: EscrowPart[]; created_at: number; settled_at: number | null;
}

function row2escrow(r: any): Escrow {
  return {
    id: r.id, order_ref: r.order_ref, buyer_id: r.buyer_id, amount_cents: r.amount_cents,
    status: r.status, breakdown: JSON.parse(r.breakdown_json || '[]'),
    created_at: r.created_at, settled_at: r.settled_at,
  };
}

const tx = (db: ReturnType<typeof getDb>, userId: string, amount: number, kind: string, label: string, ref: string, now: number) =>
  db.prepare('INSERT INTO wallet_transactions (id, user_id, amount_cents, kind, label, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), userId, Math.round(amount), kind, label, ref, now);

/**
 * VERROUILLE : débite l'acheteur du total et crée l'escrow. La somme des parts
 * doit égaler le montant. Atomique. Échoue si solde insuffisant.
 */
export function lockEscrow(buyerId: string, amountCents: number, breakdown: EscrowPart[], orderRef?: string): { ok: boolean; error?: string; escrow?: Escrow; balance_cents?: number } {
  ensure();
  const amount = Math.round(amountCents);
  if (!buyerId) return { ok: false, error: 'unauthorized' };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'bad_amount' };
  const parts = (breakdown || []).filter((p) => p && p.user_id && Number.isFinite(p.amount_cents) && p.amount_cents > 0);
  const sum = parts.reduce((s, p) => s + Math.round(p.amount_cents), 0);
  if (sum !== amount) return { ok: false, error: 'breakdown_mismatch' };
  const db = getDb();
  try {
    const id = randomUUID();
    const now = Date.now();
    db.transaction(() => {
      const bal = (db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS b FROM wallet_transactions WHERE user_id = ?').get(buyerId) as { b: number }).b;
      if (bal < amount) throw new Error('insufficient_funds');
      tx(db, buyerId, -amount, 'escrow_lock', 'Paiement bloqué (en attente livraison)', id, now);
      db.prepare('INSERT INTO escrows (id, order_ref, buyer_id, amount_cents, status, breakdown_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, orderRef || null, buyerId, amount, 'locked', JSON.stringify(parts), now);
    })();
    return { ok: true, escrow: getEscrow(id)!, balance_cents: getWalletBalance(buyerId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

/**
 * DÉBLOQUE : répartit le montant tenu vers chaque bénéficiaire (crédit wallet),
 * passe l'escrow en 'released'. Atomique. Idempotent (rejette si déjà réglé).
 */
export function releaseEscrow(escrowId: string): { ok: boolean; error?: string; escrow?: Escrow } {
  ensure();
  const db = getDb();
  try {
    const now = Date.now();
    db.transaction(() => {
      const e = db.prepare("SELECT * FROM escrows WHERE id = ?").get(escrowId) as any;
      if (!e) throw new Error('not_found');
      if (e.status !== 'locked') throw new Error('already_settled');
      const parts: EscrowPart[] = JSON.parse(e.breakdown_json || '[]');
      for (const p of parts) {
        tx(db, p.user_id, Math.round(p.amount_cents), 'escrow_release', `Encaissement (${p.role})`, escrowId, now);
      }
      db.prepare("UPDATE escrows SET status = 'released', settled_at = ? WHERE id = ?").run(now, escrowId);
    })();
    return { ok: true, escrow: getEscrow(escrowId)! };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

/** REMBOURSE : rend tout à l'acheteur, passe l'escrow en 'refunded'. Atomique. */
export function refundEscrow(escrowId: string): { ok: boolean; error?: string; escrow?: Escrow } {
  ensure();
  const db = getDb();
  try {
    const now = Date.now();
    db.transaction(() => {
      const e = db.prepare('SELECT * FROM escrows WHERE id = ?').get(escrowId) as any;
      if (!e) throw new Error('not_found');
      if (e.status !== 'locked') throw new Error('already_settled');
      tx(db, e.buyer_id, Math.round(e.amount_cents), 'escrow_refund', 'Remboursement (transaction annulée)', escrowId, now);
      db.prepare("UPDATE escrows SET status = 'refunded', settled_at = ? WHERE id = ?").run(now, escrowId);
    })();
    return { ok: true, escrow: getEscrow(escrowId)! };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

export function getEscrow(id: string): Escrow | null {
  ensure();
  const r = getDb().prepare('SELECT * FROM escrows WHERE id = ?').get(id);
  return r ? row2escrow(r) : null;
}

// Vues SANITISÉES (PII air-gap : on n'expose JAMAIS les user_id des autres parties).
export interface EscrowBuyerView { id: string; order_ref: string | null; amount_cents: number; status: string; created_at: number; settled_at: number | null; parts: { role: string; amount_cents: number }[] }
export interface EscrowPayeeView { id: string; amount_cents: number; my_part_cents: number; role: string; status: string; created_at: number }

/** Escrows où l'user est impliqué (acheteur OU bénéficiaire), + total bloqué en tant qu'acheteur. */
export function listEscrowsForUser(userId: string): { asBuyer: EscrowBuyerView[]; asPayee: EscrowPayeeView[]; locked_cents: number } {
  ensure();
  const db = getDb();
  const buyerRows = (db.prepare('SELECT * FROM escrows WHERE buyer_id = ? ORDER BY created_at DESC LIMIT 50').all(userId) as any[]).map(row2escrow);
  const asBuyer: EscrowBuyerView[] = buyerRows.map((e) => ({
    id: e.id, order_ref: e.order_ref, amount_cents: e.amount_cents, status: e.status,
    created_at: e.created_at, settled_at: e.settled_at,
    parts: e.breakdown.map((p) => ({ role: p.role, amount_cents: p.amount_cents })), // pas de user_id
  }));
  // Bénéficiaire : escrows verrouillés où JE figure ; je ne renvoie que MA part.
  const recent = (db.prepare("SELECT * FROM escrows WHERE status = 'locked' ORDER BY created_at DESC LIMIT 200").all() as any[]).map(row2escrow);
  const asPayee: EscrowPayeeView[] = recent
    .filter((e) => e.buyer_id !== userId && e.breakdown.some((p) => p.user_id === userId))
    .map((e) => {
      const mine = e.breakdown.find((p) => p.user_id === userId)!;
      return { id: e.id, amount_cents: e.amount_cents, my_part_cents: mine.amount_cents, role: mine.role, status: e.status, created_at: e.created_at };
    });
  const locked_cents = buyerRows.filter((e) => e.status === 'locked').reduce((s, e) => s + e.amount_cents, 0);
  return { asBuyer, asPayee, locked_cents };
}
