/**
 * Talk2Me — Step-up paiement DESKTOP (Pascal 2026-06-26, sécurité).
 *
 * Doctrine : TOUT paiement lancé depuis une session WEB (desktop liée par QR) doit
 * être VALIDÉ sur le mobile AVANT d'atteindre la page de paiement. « On est couvert » :
 * même si quelqu'un est sur le PC connecté, il ne peut rien acheter sans le téléphone.
 *
 * - Session NATIVE (APK/mobile) → AUCUN step-up (paiement direct, comme avant).
 * - Session WEB → on crée une demande d'autorisation, le mobile l'approuve, puis le
 *   desktop rejoue l'achat avec l'id approuvé qui est CONSOMMÉ (usage unique).
 *
 * Lié à [[project_talk2me_qr_web_login]]. Cœur paiement : [[project_talk2me_payment_doctrine]].
 */
import { randomBytes } from 'crypto';
import { getDb } from '@/lib/db';
import { isWebSession } from '@/lib/web-sessions';
import { SESSION_COOKIE } from '@/lib/auth-constants';
import type { NextRequest } from 'next/server';

const TTL_MS = 5 * 60 * 1000; // 5 min pour valider sur le tél

function ensure() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pay_authorizations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | consumed | denied
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      approved_at INTEGER
    );
  `);
  db.prepare('DELETE FROM pay_authorizations WHERE expires_at <= ? AND status IN (\'pending\',\'consumed\',\'denied\')').run(Date.now() - 60 * 60 * 1000);
  return db;
}

export interface PayAuth {
  id: string; user_id: string; status: string; amount_cents: number; currency: string;
  label: string | null; created_at: number; expires_at: number; approved_at: number | null;
}

export function createPayAuth(userId: string, amountCents: number, currency: string, label: string): PayAuth {
  const db = ensure();
  const id = randomBytes(9).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO pay_authorizations (id, user_id, status, amount_cents, currency, label, created_at, expires_at) VALUES (?,?,\'pending\',?,?,?,?,?)')
    .run(id, userId, amountCents, currency, label, now, now + TTL_MS);
  return { id, user_id: userId, status: 'pending', amount_cents: amountCents, currency, label, created_at: now, expires_at: now + TTL_MS, approved_at: null };
}

export function getPayAuth(id: string): PayAuth | null {
  if (!id) return null;
  const db = ensure();
  return (db.prepare('SELECT * FROM pay_authorizations WHERE id = ?').get(id) as PayAuth | undefined) || null;
}

/** Mobile : approuve une demande (jamais depuis une session web — vérifié côté route). */
export function approvePayAuth(userId: string, id: string): { ok: boolean; error?: string } {
  const db = ensure();
  const r = db.prepare('SELECT * FROM pay_authorizations WHERE id = ? AND user_id = ?').get(id, userId) as PayAuth | undefined;
  if (!r) return { ok: false, error: 'not_found' };
  if (r.expires_at <= Date.now()) return { ok: false, error: 'expired' };
  if (r.status !== 'pending') return { ok: false, error: 'already_used' };
  db.prepare('UPDATE pay_authorizations SET status = \'approved\', approved_at = ? WHERE id = ?').run(Date.now(), id);
  return { ok: true };
}

export function denyPayAuth(userId: string, id: string): boolean {
  const db = ensure();
  const r = db.prepare('UPDATE pay_authorizations SET status = \'denied\' WHERE id = ? AND user_id = ? AND status = \'pending\'').run(id, userId);
  return r.changes > 0;
}

/** Desktop (rejoue l'achat) : consomme l'autorisation approuvée (usage unique). */
function consumeApprovedPayAuth(userId: string, id: string): boolean {
  const db = ensure();
  const r = db.prepare('SELECT * FROM pay_authorizations WHERE id = ? AND user_id = ?').get(id, userId) as PayAuth | undefined;
  if (!r || r.status !== 'approved' || r.expires_at <= Date.now()) return false;
  db.prepare('UPDATE pay_authorizations SET status = \'consumed\' WHERE id = ?').run(id);
  return true;
}

/** Demandes en attente d'un user (pour le mobile). */
export function listPendingPayAuths(userId: string): PayAuth[] {
  const db = ensure();
  return db.prepare('SELECT * FROM pay_authorizations WHERE user_id = ? AND status = \'pending\' AND expires_at > ? ORDER BY created_at DESC')
    .all(userId, Date.now()) as PayAuth[];
}

/**
 * GARDE step-up à appeler AVANT de lancer le paiement dans une route d'achat.
 * - Session non-web → { ok:true } (mobile natif : aucun step-up).
 * - Session web + pay_auth_id approuvé → consomme → { ok:true }.
 * - Sinon → crée une demande, { ok:false, needs_mobile_auth, auth_id }.
 */
export function requireDesktopPayAuth(
  req: NextRequest,
  userId: string,
  opts: { amountCents: number; currency: string; label: string; payAuthId?: string | null },
): { ok: true } | { ok: false; needs_mobile_auth: true; auth_id: string } {
  const token = req.cookies.get(SESSION_COOKIE)?.value || '';
  if (!isWebSession(token)) return { ok: true };
  if (opts.payAuthId && consumeApprovedPayAuth(userId, opts.payAuthId)) return { ok: true };
  const a = createPayAuth(userId, opts.amountCents, opts.currency, opts.label);
  return { ok: false, needs_mobile_auth: true, auth_id: a.id };
}
