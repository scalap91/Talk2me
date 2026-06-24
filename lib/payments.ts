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
import { createFundedEscrow, lockEscrow, PLATFORM_USER_ID } from '@/lib/escrow';
import { quoteOrder, type OrderQuote } from '@/lib/commerce-pricing';
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
  // PaPi (2026-06-23) : notificationToken renvoyé à la création du lien, SECRET
  // par-paiement servant à authentifier le callback. Colonne additive idempotente.
  try { getDb().exec('ALTER TABLE payment_intents ADD COLUMN notif_token TEXT'); } catch { /* déjà présente */ }
  // Achat (purpose='order') : contexte de la commande porté jusqu'au règlement
  // (type, item, vendeur, répartition). JSON. Additif idempotent. Pascal 2026-06-23.
  try { getDb().exec('ALTER TABLE payment_intents ADD COLUMN order_json TEXT'); } catch { /* déjà présente */ }
  ensured = true;
}

export type PaymentIntent = {
  id: string; user_id: string; amount_cents: number; currency: string; purpose: string;
  provider: string; provider_ref: string | null; status: string; checkout_url: string | null;
  msisdn: string | null; created_at: number; settled_at: number | null; notif_token: string | null; order_json: string | null;
};

/** Contexte d'une commande, sérialisé dans payment_intents.order_json. */
export type OrderContext = { type: string; item_id: string; seller_id: string; breakdown: { user_id: string; role: string; amount_cents: number }[] };

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

/** PaPi : stocke le lien de paiement + le notificationToken (secret du callback). */
export function setIntentPapiMeta(id: string, checkoutUrl: string, notifToken: string | null): void {
  ensure();
  getDb().prepare('UPDATE payment_intents SET checkout_url = ?, notif_token = ? WHERE id = ?').run(checkoutUrl, notifToken, id);
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
      // Multi-devise : la recharge est créditée dans LA devise de l'intent (MVola → MGA).
      addWalletTransaction(e.user_id, e.amount_cents, 'topup', 'Recharge', Date.now(), id, e.currency || 'EUR');
    } else if (e.purpose === 'order' && e.order_json) {
      // Achat protégé : l'acheteur a payé (externe) → on crée l'escrow FINANCÉ (argent
      // bloqué jusqu'à réception), sans toucher son wallet. createFundedEscrow = insert
      // simple (pas de transaction imbriquée) → OK dans cette transaction.
      try {
        const oc = JSON.parse(e.order_json) as OrderContext;
        createFundedEscrow(e.user_id, e.amount_cents, oc.breakdown, id, e.currency || 'EUR');
      } catch { /* order_json illisible : intent payé mais escrow non créé → à reprendre */ }
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
 * Interroge le statut d'un intent en attente côté fournisseur (MVola/Orange/Airtel)
 * et le règle si terminé (idempotent). Sert au suivi côté client après un push USSD
 * (pas de redirection). Retourne le statut normalisé + le solde si payé.
 */
export async function pollIntent(id: string): Promise<{ status: string; balance_cents?: number }> {
  ensure();
  const intent = getIntent(id);
  if (!intent) return { status: 'not_found' };
  if (intent.status === 'paid') return { status: 'paid', balance_cents: getWalletBalance(intent.user_id) };
  if (intent.status === 'failed') return { status: 'failed' };
  const MM = ['mvola', 'orange', 'airtel'];
  if (MM.includes(intent.provider) && intent.provider_ref) {
    const { resolveAdapter } = await import('@/lib/payments/operators');
    const adapter = await resolveAdapter(intent.provider as 'mvola' | 'orange' | 'airtel', intent.msisdn || '');
    if (adapter) {
      const s = await adapter.status(intent.provider_ref);
      const st = (s.status || '').toLowerCase();
      if (['completed', 'success', 'successful', 'ts'].includes(st)) {
        markIntentPaid(id);
        return { status: 'paid', balance_cents: getWalletBalance(intent.user_id) };
      }
      if (['failed', 'rejected', 'tf'].includes(st)) { markIntentFailed(id); return { status: 'failed' }; }
    }
  }
  return { status: 'pending' };
}

/**
 * Démarre une recharge : crée l'intent + lance le paiement chez le fournisseur.
 * Retourne de quoi rediriger/poursuivre côté client.
 */
async function beginProviderPayment(intent: PaymentIntent, msisdn: string | null | undefined, description: string): Promise<{ ok: boolean; checkout_url?: string | null; error?: string }> {
  const provider = currentProvider();

  if (provider === 'sandbox') {
    const url = `/api/payments/sandbox/confirm?intent=${intent.id}`;
    setIntentCheckout(intent.id, url, null);
    return { ok: true, checkout_url: url };
  }

  // PaPi (Madagascar) : lien d'encaissement hébergé (MVola/Orange/Airtel/Visa/BRED).
  if (provider === 'papi') {
    const { papiCreatePaymentLink, papiConfigured } = await import('@/lib/payments/papi');
    if (!papiConfigured()) { markIntentFailed(intent.id); return { ok: false, error: 'papi_not_configured' }; }
    let clientName = 'Client Talk2Me';
    try {
      const u = getDb().prepare('SELECT display_name, username FROM users WHERE id = ?').get(intent.user_id) as { display_name?: string; username?: string } | undefined;
      clientName = u?.display_name || u?.username || clientName;
    } catch { /* fallback */ }
    const r = await papiCreatePaymentLink({ amountAriary: intent.amount_cents, reference: intent.id, description, clientName, payerPhone: msisdn || null });
    if (!r.ok || !r.paymentLink) { markIntentFailed(intent.id); return { ok: false, error: r.error || 'papi_failed' }; }
    setIntentPapiMeta(intent.id, r.paymentLink, r.notificationToken || null);
    return { ok: true, checkout_url: r.paymentLink };
  }

  // Mobile money (MVola/Orange/Airtel) : push USSD (pas de redirection) ou WebPay.
  const MM: OperatorKey[] = ['mvola', 'orange', 'airtel'];
  if (provider === 'mobilemoney' || (MM as string[]).includes(provider)) {
    if (!msisdn) { markIntentFailed(intent.id); return { ok: false, error: 'msisdn_required' }; }
    const { resolveAdapter } = await import('@/lib/payments/operators');
    const adapter = await resolveAdapter(provider === 'mobilemoney' ? undefined : (provider as OperatorKey), msisdn);
    if (!adapter) { markIntentFailed(intent.id); return { ok: false, error: 'operator_unknown' }; }
    if (!adapter.isConfigured()) { markIntentFailed(intent.id); return { ok: false, error: `${adapter.key}_not_configured` }; }
    const r = await adapter.initiate({ amount: intent.amount_cents, payerMsisdn: msisdn, description, txRef: intent.id });
    if (!r.ok) { markIntentFailed(intent.id); return { ok: false, error: r.error }; }
    setIntentCheckout(intent.id, r.checkoutUrl || null, r.ref || null);
    return { ok: true, checkout_url: r.checkoutUrl || null };
  }

  return { ok: false, error: 'no_provider' };
}

/** Démarre une recharge wallet : crée l'intent (topup) + lance le paiement. */
export async function startTopup(args: { userId: string; amountCents: number; msisdn?: string | null }): Promise<{ ok: boolean; intent?: PaymentIntent; checkout_url?: string | null; error?: string }> {
  ensure();
  const intent = createIntent({ userId: args.userId, amountCents: args.amountCents, purpose: 'topup', msisdn: args.msisdn });
  const r = await beginProviderPayment(intent, args.msisdn, 'Recharge Talk2Me');
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, intent: getIntent(intent.id)!, checkout_url: r.checkout_url };
}

/** Stocke le contexte de commande sur l'intent (purpose='order'). */
export function setIntentOrderJson(id: string, oc: OrderContext): void {
  ensure();
  getDb().prepare('UPDATE payment_intents SET order_json = ? WHERE id = ?').run(JSON.stringify(oc), id);
}

/**
 * ACHAT PROTÉGÉ (escrow). Deux chemins :
 *  - solde wallet suffisant DANS LA DEVISE → on bloque direct en escrow (mode 'paid').
 *  - sinon → paiement externe (MVola push…) ; l'escrow est créé au callback
 *    (markIntentPaid purpose='order' → createFundedEscrow) (mode 'pay').
 * L'argent est tenu jusqu'à ce que l'acheteur confirme la réception (releaseEscrow).
 * NB : breakdown = 100% vendeur pour l'instant ; la commission plateforme
 * (PLATFORM_USER_ID) sera une part en plus quand le modèle de commission sera fixé.
 */
export async function startOrder(args: { userId: string; amountCents: number; currency?: string; msisdn?: string | null; orderType: string; itemId: string; sellerId: string; deliveryCents?: number }): Promise<{ ok: boolean; mode?: 'paid' | 'pay'; escrow_id?: string; intent?: PaymentIntent; checkout_url?: string | null; error?: string; quote?: OrderQuote }> {
  ensure();
  const amount = Math.round(args.amountCents);
  const currency = args.currency || 'MGA';
  if (!amount || amount <= 0) return { ok: false, error: 'bad_amount' };
  if (!args.sellerId) return { ok: false, error: 'no_seller' };
  if (args.sellerId === args.userId) return { ok: false, error: 'cannot_buy_own' };

  // COMMISSION PLATEFORME (Pascal 2026-06-24) : on prélève notre part sur chaque
  // vente, créditée au compte plateforme à la livraison (escrow release). Taux
  // centralisé via env PLATFORM_COMMISSION_RATE (défaut 3%). Le vendeur touche le reste.
  // Devis complet : l'acheteur paie Article + notre commission + frais PaPi (+ livraison).
  const q = quoteOrder(amount, args.deliveryCents || 0);
  const charged = q.total; // ce que l'acheteur paie réellement
  // Répartition (somme = charged) : vendeur=article, plateforme=commission+frais PaPi
  // (on garde la commission ; les frais PaPi sont prélevés par PaPi sur le total).
  const platformPart = q.commission + q.papi_fee;
  const breakdown = platformPart > 0
    ? [
        { user_id: args.sellerId, role: 'seller', amount_cents: q.article },
        { user_id: PLATFORM_USER_ID, role: 'plateforme', amount_cents: platformPart },
      ]
    : [{ user_id: args.sellerId, role: 'seller', amount_cents: q.article }];
  // Livraison → au VENDEUR (il assure/organise la livraison ; sera réparti vers un
  // transporteur quand le module Drive assignera un livreur). Somme breakdown = total.
  if (q.delivery > 0) breakdown.push({ user_id: args.sellerId, role: 'livraison', amount_cents: q.delivery });

  // 1) Payé depuis le solde wallet (même devise) → escrow bloqué tout de suite.
  if (getWalletBalance(args.userId, currency) >= charged) {
    const r = lockEscrow(args.userId, charged, breakdown, undefined, currency);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, mode: 'paid', escrow_id: r.escrow!.id, quote: q };
  }

  // 2) Paiement externe → escrow financé au règlement (callback).
  const intent = createIntent({ userId: args.userId, amountCents: charged, purpose: 'order', msisdn: args.msisdn, currency });
  setIntentOrderJson(intent.id, { type: args.orderType, item_id: args.itemId, seller_id: args.sellerId, breakdown });
  const r = await beginProviderPayment(getIntent(intent.id)!, args.msisdn, 'Achat Talk2Me');
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, mode: 'pay', intent: getIntent(intent.id)!, checkout_url: r.checkout_url, quote: q };
}

export type Payout = { id: string; user_id: string; amount_cents: number; msisdn: string | null; provider: string; provider_ref: string | null; status: string; created_at: number; settled_at: number | null };

// ─── Reversement MANUEL / batch (bootstrap, Pascal 2026-06-23) ───────────────
// PaPi encaisse mais ne reverse pas ; les opérateurs B2C disbursement ne sont pas
// câblés. En attendant, l'admin reverse à la main (envoie le mobile money depuis
// notre compte marchand) puis enregistre l'opération ici : on débite le wallet du
// bénéficiaire et on trace un payout 'manual'. Le QUI-doit-COMBIEN vient des soldes
// wallet (crédités par releaseEscrow). Voir [[project_talk2me_papi_payment]].

export type OwedBeneficiary = { user_id: string; balance_cents: number; name: string | null; phone: string | null };

/** Bénéficiaires avec un solde wallet positif = sommes à reverser. */
export function listOwedBeneficiaries(min = 1): OwedBeneficiary[] {
  ensure();
  const db = getDb();
  const rows = db.prepare(
    'SELECT user_id, SUM(amount_cents) AS bal FROM wallet_transactions GROUP BY user_id HAVING bal >= ? ORDER BY bal DESC'
  ).all(Math.max(1, min)) as { user_id: string; bal: number }[];
  return rows.map((r) => {
    let name: string | null = null, phone: string | null = null;
    try {
      const u = db.prepare('SELECT display_name, username, phone FROM users WHERE id = ?').get(r.user_id) as { display_name?: string; username?: string; phone?: string } | undefined;
      name = u?.display_name || u?.username || null;
      phone = u?.phone || null;
    } catch { /* colonnes variables */ }
    return { user_id: r.user_id, balance_cents: r.bal, name, phone };
  });
}

/**
 * Enregistre un reversement effectué MANUELLEMENT par l'admin (cash-out réel déjà
 * envoyé sur le mobile money du bénéficiaire). Atomique : débite le wallet + trace
 * le payout. N'envoie PAS d'argent lui-même — c'est un journal de l'acte manuel.
 */
export function recordManualPayout(args: { userId: string; amountCents: number; msisdn?: string | null; note?: string | null }): { ok: boolean; balance_cents?: number; payout_id?: string; error?: string } {
  ensure();
  const amount = Math.round(args.amountCents);
  if (!amount || amount < 1) return { ok: false, error: 'amount_too_small' };
  const db = getDb();
  try {
    const run = db.transaction(() => {
      const bal = getWalletBalance(args.userId);
      if (bal < amount) throw new Error('insufficient_balance');
      const id = randomUUID();
      const now = Date.now();
      addWalletTransaction(args.userId, -amount, 'payout', args.note || 'Reversement manuel', now, id);
      db.prepare('INSERT INTO payouts (id, user_id, amount_cents, msisdn, provider, status, created_at, settled_at, provider_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, args.userId, amount, args.msisdn || null, 'manual', 'paid', now, now, 'manual-' + id.slice(0, 8));
      return id;
    });
    const payoutId = run();
    return { ok: true, payout_id: payoutId, balance_cents: getWalletBalance(args.userId) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  }
}

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
