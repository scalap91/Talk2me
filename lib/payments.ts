'use server-only';

/**
 * Talk2Me — Paiement RÉEL (Pascal 2026-06-15). Marché 1 : Madagascar (MVola).
 *
 * Le wallet interne + l'escrow existent déjà ([[lib/escrow]]). Ici on branche
 * l'ENTRÉE d'argent réel (cash-in / recharge) et la sortie (payout) via un
 * fournisseur. Architecture à PROVIDER interchangeable :
 *   - 'sandbox'  : simule un paiement (testable de bout en bout, sans compte).
 *   - 'mvola'    : API officielle MVola (Telma) — à activer avec les clés dev.
 * Sélection par env TALKTOME_PAY_PROVIDER (défaut 'sandbox').
 *
 * Un paiement = un payment_intent (pending → paid/failed). Quand 'paid', on
 * crédite le wallet UNE fois (idempotent). Doctrine [[feedback_verifier_rail_paiement]] :
 * vérifier LIVE vs sandbox avant toute promesse d'encaissement réel.
 */

import { randomUUID } from 'crypto';
import { getDb, addWalletTransaction, getWalletBalance } from '@/lib/db';
import type { OperatorKey } from '@/lib/payments/operators';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MGA',
      purpose TEXT NOT NULL DEFAULT 'topup',   -- 'topup' | 'order' | ...
      provider TEXT NOT NULL,
      provider_ref TEXT,                        -- id transaction côté fournisseur
      status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'paid' | 'failed'
      checkout_url TEXT,
      msisdn TEXT,                              -- numéro mobile money (payeur)
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_payint_user ON payment_intents(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payint_ref ON payment_intents(provider_ref);

    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      msisdn TEXT,                              -- numéro mobile money destinataire
      provider TEXT NOT NULL,
      provider_ref TEXT,
      status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'paid' | 'failed'
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_payout_user ON payouts(user_id, created_at DESC);
  `);
  ensured = true;
}

export type PaymentIntent = {
  id: string; user_id: string; amount_cents: number; currency: string; purpose: string;
  provider: string; provider_ref: string | null; status: string; checkout_url: string | null;
  msisdn: string | null; created_at: number; settled_at: number | null;
};

export function currentProvider(): string {
  return process.env.TALKTOME_PAY_PROVIDER || 'sandbox';
}

export function getIntent(id: string): PaymentIntent | null {
  ensure();
  return (getDb().prepare('SELECT * FROM payment_intents WHERE id = ?').get(id) as PaymentIntent) || null;
}

export function createIntent(args: { userId: string; amountCents: number; purpose?: string; msisdn?: string | null; currency?: string }): PaymentIntent {
  ensure();
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare(
    'INSERT INTO payment_intents (id, user_id, amount_cents, currency, purpose, provider, status, msisdn, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, args.userId, Math.max(1, Math.round(args.amountCents)), args.currency || 'MGA', args.purpose || 'topup', currentProvider(), 'pending', args.msisdn || null, now);
  return getIntent(id)!;
}

export function setIntentCheckout(id: string, checkoutUrl: string | null, providerRef: string | null): void {
  ensure();
  getDb().prepare('UPDATE payment_intents SET checkout_url = ?, provider_ref = ? WHERE id = ?').run(checkoutUrl, providerRef, id);
}

/**
 * Marque l'intent PAYÉ et crédite le wallet UNE seule fois (idempotent).
 * Pour purpose='topup'. Retourne le nouveau solde, ou null si déjà réglé/inconnu.
 */
export function markIntentPaid(id: string, providerRef?: string | null): { ok: boolean; balance_cents?: number; error?: string } {
  ensure();
  const db = getDb();
  const tx = db.transaction(() => {
    const e = db.prepare('SELECT * FROM payment_intents WHERE id = ?').get(id) as PaymentIntent | undefined;
    if (!e) throw new Error('not_found');
    if (e.status === 'paid') throw new Error('already_paid');
    db.prepare("UPDATE payment_intents SET status = 'paid', settled_at = ?, provider_ref = COALESCE(?, provider_ref) WHERE id = ?")
      .run(Date.now(), providerRef ?? null, id);
    if (e.purpose === 'topup') {
      addWalletTransaction(e.user_id, e.amount_cents, 'topup', 'Recharge', Date.now(), id);
    }
    return e.user_id;
  });
  try {
    const userId = tx();
    return { ok: true, balance_cents: getWalletBalance(userId) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  }
}

export function markIntentFailed(id: string): void {
  ensure();
  getDb().prepare("UPDATE payment_intents SET status = 'failed', settled_at = ? WHERE id = ? AND status = 'pending'").run(Date.now(), id);
}

/**
 * Démarre une recharge : crée l'intent + lance le paiement chez le fournisseur.
 * Retourne de quoi rediriger/poursuivre côté client.
 */
export async function startTopup(args: { userId: string; amountCents: number; msisdn?: string | null }): Promise<{ ok: boolean; intent?: PaymentIntent; checkout_url?: string | null; error?: string }> {
  ensure();
  const intent = createIntent({ userId: args.userId, amountCents: args.amountCents, purpose: 'topup', msisdn: args.msisdn });
  const provider = currentProvider();

  if (provider === 'sandbox') {
    // Sandbox : page de confirmation locale (auto-paiement pour tester le rail).
    const url = `/api/payments/sandbox/confirm?intent=${intent.id}`;
    setIntentCheckout(intent.id, url, null);
    return { ok: true, intent: getIntent(intent.id)!, checkout_url: url };
  }

  // Mobile money Madagascar : opérateur forcé (mvola|orange|airtel) ou auto-détecté
  // par le numéro du payeur (provider 'mobilemoney'). Le routeur choisit l'adaptateur.
  const MM: OperatorKey[] = ['mvola', 'orange', 'airtel'];
  if (provider === 'mobilemoney' || (MM as string[]).includes(provider)) {
    if (!args.msisdn) { markIntentFailed(intent.id); return { ok: false, error: 'msisdn_required' }; }
    const { resolveAdapter } = await import('@/lib/payments/operators');
    const adapter = await resolveAdapter(provider === 'mobilemoney' ? undefined : (provider as OperatorKey), args.msisdn);
    if (!adapter) { markIntentFailed(intent.id); return { ok: false, error: 'operator_unknown' }; }
    if (!adapter.isConfigured()) { markIntentFailed(intent.id); return { ok: false, error: `${adapter.key}_not_configured` }; }
    const r = await adapter.initiate({ amount: intent.amount_cents, payerMsisdn: args.msisdn, description: 'Recharge Talk2Me', txRef: intent.id });
    if (!r.ok) { markIntentFailed(intent.id); return { ok: false, error: r.error }; }
    // checkoutUrl présent (Orange WebPay = redirection) ; sinon push USSD (MVola/Airtel)
    // → ref opérateur stockée, le callback/poll confirmera le paiement.
    setIntentCheckout(intent.id, r.checkoutUrl || null, r.ref || null);
    return { ok: true, intent: getIntent(intent.id)!, checkout_url: r.checkoutUrl || null };
  }

  return { ok: false, error: 'no_provider' };
}

export type Payout = { id: string; user_id: string; amount_cents: number; msisdn: string | null; provider: string; provider_ref: string | null; status: string; created_at: number; settled_at: number | null };

export function listPayouts(userId: string, limit = 20): Payout[] {
  ensure();
  return getDb().prepare('SELECT * FROM payouts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as Payout[];
}

/**
 * RETRAIT vendeur (cash-out) : envoie le solde wallet vers son mobile money.
 * Sandbox : débite + marque payé tout de suite (pour tester le rail). MVola :
 * refusé tant que les clés ne sont pas posées (on ne débite PAS si on ne peut
 * pas verser réellement). Atomique : débit wallet + payout dans la même transaction.
 */
export function requestPayout(args: { userId: string; amountCents: number; msisdn?: string | null }): { ok: boolean; balance_cents?: number; payout_id?: string; error?: string } {
  ensure();
  const amount = Math.round(args.amountCents);
  if (!amount || amount < 100) return { ok: false, error: 'amount_too_small' };
  const provider = currentProvider();
  // On ne réserve l'argent QUE si le fournisseur peut réellement verser. Le
  // versement (disbursement) est une API distincte de l'encaissement, pas encore
  // câblée pour les opérateurs mobile money → on refuse sans débiter le wallet.
  if (provider !== 'sandbox') {
    const isMM = ['mvola', 'orange', 'airtel', 'mobilemoney'].includes(provider);
    return { ok: false, error: isMM ? `${provider}_payout_not_configured` : 'no_provider' };
  }
  const db = getDb();
  try {
    const run = db.transaction(() => {
      const bal = getWalletBalance(args.userId);
      if (bal < amount) throw new Error('insufficient_balance');
      const id = randomUUID();
      const now = Date.now();
      addWalletTransaction(args.userId, -amount, 'payout', 'Retrait', now, id); // débit (réserve)
      db.prepare('INSERT INTO payouts (id, user_id, amount_cents, msisdn, provider, status, created_at, settled_at, provider_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, args.userId, amount, args.msisdn || null, provider, 'paid', now, now, 'sandbox-' + id.slice(0, 8));
      return id;
    });
    const payoutId = run();
    return { ok: true, payout_id: payoutId, balance_cents: getWalletBalance(args.userId) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  }
}
