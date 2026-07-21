'use server-only';

/**
 * Talk2Me — Paiement RÉEL (Pascal 2026-06-15). Marché 1 : Madagascar (MVola).
 *
 * Le wallet interne + l'escrow existent déjà ([[lib/escrow]]). Ici on branche
 * l'ENTRÉE d'argent réel (cash-in / recharge) et la sortie (payout) via un
 * fournisseur. Architecture à PROVIDER interchangeable :
 *   - 'sandbox'  : simule un paiement (testable de bout en bout, sans compte).
 *   - 'mvola'    : API officielle MVola (Telma) — à activer avec les clés dev.
 * Sélection par env TALK2ME_PAY_PROVIDER (défaut 'sandbox').
 *
 * Un paiement = un payment_intent (pending → paid/failed). Quand 'paid', on
 * crédite le wallet UNE fois (idempotent). Doctrine [[feedback_verifier_rail_paiement]] :
 * vérifier LIVE vs sandbox avant toute promesse d'encaissement réel.
 */

import { randomUUID } from 'crypto';
import { getDb, addWalletTransaction, getWalletBalance } from '@/lib/db';
import { createFundedEscrow, lockEscrow, PLATFORM_USER_ID } from '@/lib/escrow';
import { quoteOrder, type OrderQuote } from '@/lib/commerce-pricing';
import { getCommissionRate } from '@/lib/app-settings';
import type { OperatorKey } from '@/lib/payments/operators';
import { createConfirmedBooking, scheduleSettlement } from '@/lib/rental-planning';
import { setAnnonceBoosted, setAnnonceReserved } from '@/lib/annonces-deposit';
import { markDuePaid } from '@/lib/leases';
import { grantLiveEntry } from '@/lib/live/session';
import { grantContentUnlock } from '@/lib/salon';

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
export type OrderContext = {
  type: string; item_id: string; seller_id: string;
  breakdown: { user_id: string; role: string; amount_cents: number }[];
  // AFFILIATION (dropship, Pascal 2026-07-09) : au règlement, le promoteur (owner de la
  // product-card) touche une part de NOTRE commission. commission_cents = notre marge (3%).
  affiliate?: { owner_id: string; commission_cents: number };
  // Location véhicule : finalise la réservation + échéancier au paiement (Pascal 2026-06-26).
  rental?: { annonce_id: string; dates: string[]; renter_id: string; owner_total_cents: number; pickup_time?: string | null };
  // Premium : mise en avant d'une annonce (revenu 100% plateforme, pas d'escrow). Appliqué au paiement.
  boost?: { annonce_id: string; duration_ms: number };
  // Acompte de réservation : escrow vers le vendeur + on marque l'annonce RÉSERVÉE.
  reserve?: { annonce_id: string; buyer_id: string; until_ms: number };
  // Loyer récurrent : escrow vers le bailleur + on marque l'échéance PAYÉE.
  rent?: { due_id: string };
};

export function currentProvider(): string {
  return process.env.TALK2ME_PAY_PROVIDER || process.env.TALKTOME_PAY_PROVIDER || 'sandbox';
}

export function getIntent(id: string): PaymentIntent | null {
  ensure();
  return (getDb().prepare('SELECT * FROM payment_intents WHERE id = ?').get(id) as PaymentIntent) || null;
}

/** ANTI-SPAM (Audit #57) : trop d'intents EN ATTENTE créés récemment par cet user ?
 *  Garde-fou avant d'initier un paiement (boost/réservation) — évite le flood d'intents. */
export function tooManyPendingIntents(userId: string, windowMs = 10 * 60 * 1000, max = 8): boolean {
  ensure();
  if (!userId) return false;
  try {
    const since = Date.now() - windowMs;
    const r = getDb().prepare("SELECT COUNT(*) AS n FROM payment_intents WHERE user_id = ? AND status = 'pending' AND created_at >= ?").get(userId, since) as { n: number };
    return (r?.n || 0) >= max;
  } catch { return false; }
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
/** Crédite le PROMOTEUR (affiliation dropship) une part — RÉGLÉE PAR L'ADMIN — de NOTRE commission,
 *  au moment du paiement (Pascal 2026-07-09 : « on se réfère au paiement de la card »). L'argent SORT
 *  de notre marge : on débite d'autant le compte plateforme. Alimente la Monétisation du promoteur. */
function creditAffiliate(aff: { owner_id: string; commission_cents: number } | undefined, currency: string): void {
  if (!aff || !aff.owner_id) return;
  try {
    const cut = Math.round((aff.commission_cents || 0) * getCommissionRate('affiliate_share_rate'));
    if (cut <= 0) return;
    const ref = 'affil-' + randomUUID().slice(0, 8);
    addWalletTransaction(aff.owner_id, cut, 'commission', 'Commission promoteur', Date.now(), ref, currency);
    addWalletTransaction(PLATFORM_USER_ID, -cut, 'commission', 'Reversement promoteur', Date.now(), ref, currency);
  } catch { /* best-effort : ne bloque jamais le paiement */ }
}

export function markIntentPaid(id: string, providerRef?: string | null): { ok: boolean; balance_cents?: number; error?: string } {
  ensure();
  const db = getDb();
  let rentalCtx: { oc: OrderContext; amount: number } | null = null;
  let boostCtx: { annonce_id: string; duration_ms: number } | null = null;
  let reserveCtx: { annonce_id: string; buyer_id: string; until_ms: number } | null = null;
  let rentCtx: { due_id: string } | null = null;
  let liveEntryCtx: { host: string; viewer: string; session: string } | null = null;
  let unlockCtx: { item: string; viewer: string; seller: string } | null = null;
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
        if (oc.affiliate) creditAffiliate(oc.affiliate, e.currency || 'EUR'); // commission promoteur au paiement
        if (oc.rental) rentalCtx = { oc, amount: e.amount_cents }; // finalisé après la tx (autre base)
        if (oc.reserve) reserveCtx = oc.reserve; // acompte → on marque l'annonce réservée
        if (oc.rent) rentCtx = oc.rent; // loyer → on marque l'échéance payée
        // Entrée LIVE payée → on octroie l'accès à la salle APRÈS la tx (autre base). Pascal 2026-07-15.
        const ocx = oc as OrderContext & { type?: string; seller_id?: string; item_id?: string };
        if (ocx.type === 'live_entry' && ocx.seller_id) liveEntryCtx = { host: ocx.seller_id, viewer: e.user_id, session: ocx.item_id || '' };
        // Déverrouillage d'un contenu payant du salon (photo/vidéo) → accès APRÈS la tx. Pascal 2026-07-15.
        if (ocx.type === 'content_unlock' && ocx.seller_id && ocx.item_id) unlockCtx = { item: ocx.item_id, viewer: e.user_id, seller: ocx.seller_id };
      } catch { /* order_json illisible : intent payé mais escrow non créé → à reprendre */ }
    } else if (e.purpose === 'boost' && e.order_json) {
      // Premium : pas d'escrow (revenu 100% plateforme). On applique la mise en avant
      // après la transaction (base annonces séparée). Idempotent (intent → 'paid').
      try { const oc = JSON.parse(e.order_json) as OrderContext; if (oc.boost) boostCtx = oc.boost; } catch { /* */ }
    }
    return e.user_id;
  });
  try {
    const userId = tx();
    // Location : finalise la résa (jours 'booked') + échéancier de reversement jour-par-jour.
    // Hors transaction (base annonces séparée). Idempotent via markIntentPaid 'already_paid'.
    if (rentalCtx) {
      try {
        const rc: { oc: OrderContext; amount: number } = rentalCtx;
        const r = rc.oc.rental!;
        const bk = createConfirmedBooking(r.renter_id, r.annonce_id, r.dates, rc.amount, r.pickup_time);
        if (bk.ok && bk.booking) scheduleSettlement(bk.booking.id, bk.booking.owner_id, r.dates, r.owner_total_cents);
      } catch { /* finalize best-effort */ }
    }
    // Premium : applique la mise en avant (base annonces séparée), après la tx.
    if (boostCtx) {
      try {
        const bc: { annonce_id: string; duration_ms: number } = boostCtx;
        setAnnonceBoosted(bc.annonce_id, Date.now() + bc.duration_ms);
      } catch { /* best-effort */ }
    }
    // Acompte de réservation : on marque l'annonce réservée (escrow déjà créé vers le vendeur).
    if (reserveCtx) {
      try { const rc: { annonce_id: string; buyer_id: string; until_ms: number } = reserveCtx; setAnnonceReserved(rc.annonce_id, rc.buyer_id, rc.until_ms); } catch { /* best-effort */ }
    }
    // Loyer récurrent : marque l'échéance payée (escrow déjà créé vers le bailleur).
    if (rentCtx) {
      try { const rc: { due_id: string } = rentCtx; markDuePaid(rc.due_id, id); } catch { /* best-effort */ }
    }
    // Entrée LIVE payée → on octroie l'accès à la salle (escrow déjà créé vers l'hôte). Pascal 2026-07-15.
    if (liveEntryCtx) {
      try { const lc = liveEntryCtx; grantLiveEntry(lc.host, lc.viewer, lc.session); } catch { /* best-effort */ }
    }
    // Contenu payant du salon déverrouillé (escrow déjà créé vers l'hôte). Pascal 2026-07-15.
    if (unlockCtx) {
      try { const uc = unlockCtx; grantContentUnlock(uc.item, uc.viewer, uc.seller); } catch { /* best-effort */ }
    }
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
    // Route 'mobilemoney' (opérateur déduit du n°) → on PERSISTE l'opérateur résolu sur l'intent,
    // sinon pollIntent (qui teste mvola|orange|airtel) ne saurait pas suivre le statut.
    if (provider === 'mobilemoney') {
      try { getDb().prepare('UPDATE payment_intents SET provider = ? WHERE id = ?').run(adapter.key, intent.id); } catch { /* */ }
    }
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

/**
 * Démarre le financement d'une CAMPAGNE PUB (régie). L'annonceur paie SON budget via PaPi
 * → l'argent va sur NOTRE compte PaPi (revenu pub). purpose='ad' : markIntentPaid ne crédite
 * ni wallet ni escrow (revenu 100% plateforme). Référence = intent.id (tie au .card pub côté app).
 */
export async function startAdFunding(args: { userId: string; amountCents: number; title?: string | null }): Promise<{ ok: boolean; intent?: PaymentIntent; checkout_url?: string | null; error?: string }> {
  ensure();
  const intent = createIntent({ userId: args.userId, amountCents: args.amountCents, purpose: 'ad' });
  const r = await beginProviderPayment(intent, null, `Campagne pub Talk2Me${args.title ? ' — ' + args.title : ''}`);
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
export async function startOrder(args: { userId: string; amountCents: number; currency?: string; msisdn?: string | null; orderType: string; itemId: string; sellerId: string; deliveryCents?: number; forceExternal?: boolean; dropship?: boolean; rental?: OrderContext['rental']; reserve?: OrderContext['reserve']; rent?: OrderContext['rent'] }): Promise<{ ok: boolean; mode?: 'paid' | 'pay'; escrow_id?: string; intent?: PaymentIntent; checkout_url?: string | null; error?: string; quote?: OrderQuote }> {
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
  // Taux RÉGLÉS PAR L'ADMIN (commission plateforme + frais PaPi). Défaut = constantes.
  const q = quoteOrder(amount, args.deliveryCents || 0, {
    commission: getCommissionRate('platform_commission_rate'),
    papiFee: getCommissionRate('papi_fee_rate'),
  });
  const charged = q.total; // ce que l'acheteur paie réellement
  // AFFILIATION dropship : le promoteur (owner de la card) touchera une part de NOTRE commission.
  const affiliate: OrderContext['affiliate'] | undefined = args.dropship && args.sellerId
    ? { owner_id: args.sellerId, commission_cents: q.commission }
    : undefined;
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
  //    Sauté si forceExternal (doctrine : on oublie le wallet, on passe par l'opérateur).
  if (!args.forceExternal && getWalletBalance(args.userId, currency) >= charged) {
    const r = lockEscrow(args.userId, charged, breakdown, undefined, currency);
    if (!r.ok) return { ok: false, error: r.error };
    creditAffiliate(affiliate, currency); // commission promoteur au paiement (dropship)
    return { ok: true, mode: 'paid', escrow_id: r.escrow!.id, quote: q };
  }

  // 2) Paiement externe (PaPi/MVola/Orange/Airtel) → escrow financé au règlement (callback).
  const intent = createIntent({ userId: args.userId, amountCents: charged, purpose: 'order', msisdn: args.msisdn, currency });
  setIntentOrderJson(intent.id, { type: args.orderType, item_id: args.itemId, seller_id: args.sellerId, breakdown, ...(affiliate ? { affiliate } : {}), ...(args.rental ? { rental: args.rental } : {}), ...(args.reserve ? { reserve: args.reserve } : {}), ...(args.rent ? { rent: args.rent } : {}) });
  const r = await beginProviderPayment(getIntent(intent.id)!, args.msisdn, 'Achat Talk2Me');
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, mode: 'pay', intent: getIntent(intent.id)!, checkout_url: r.checkout_url, quote: q };
}

/**
 * PREMIUM : mise en avant d'une annonce, payée via PaPi (pas d'escrow, revenu 100%
 * plateforme). Au règlement (callback → markIntentPaid purpose='boost'), on pose
 * boosted_until = now + duration. Doctrine : encaissement opérateur, jamais de wallet.
 */
export async function startBoost(args: { userId: string; amountCents: number; msisdn?: string | null; annonceId: string; durationMs: number }): Promise<{ ok: boolean; intent?: PaymentIntent; checkout_url?: string | null; error?: string }> {
  ensure();
  const amount = Math.round(args.amountCents);
  if (!amount || amount <= 0) return { ok: false, error: 'bad_amount' };
  if (!args.annonceId) return { ok: false, error: 'no_annonce' };
  const intent = createIntent({ userId: args.userId, amountCents: amount, purpose: 'boost', msisdn: args.msisdn, currency: 'MGA' });
  setIntentOrderJson(intent.id, {
    type: 'boost', item_id: `annonce:${args.annonceId}`, seller_id: PLATFORM_USER_ID,
    breakdown: [{ user_id: PLATFORM_USER_ID, role: 'plateforme', amount_cents: amount }],
    boost: { annonce_id: args.annonceId, duration_ms: Math.max(0, Math.round(args.durationMs)) },
  });
  const r = await beginProviderPayment(getIntent(intent.id)!, args.msisdn, 'Mise en avant Talk2Me');
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, intent: getIntent(intent.id)!, checkout_url: r.checkout_url };
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
export async function requestPayout(args: { userId: string; amountCents: number; msisdn?: string | null }): Promise<{ ok: boolean; balance_cents?: number; payout_id?: string; error?: string }> {
  ensure();
  const amount = Math.round(args.amountCents);
  if (!amount || amount < 100) return { ok: false, error: 'amount_too_small' };
  const provider = currentProvider();
  const db = getDb();
  const { mmMockEnabled, getAdapter, resolveAdapter } = await import('@/lib/payments/operators');
  const mock = mmMockEnabled();

  // SANDBOX pur (sans mock opérateur) : versement simulé instantané (inchangé, testable).
  if (provider === 'sandbox' && !mock) {
    try {
      const run = db.transaction(() => {
        const bal = getWalletBalance(args.userId);
        if (bal < amount) throw new Error('insufficient_balance');
        const id = randomUUID();
        const now = Date.now();
        addWalletTransaction(args.userId, -amount, 'payout', 'Retrait', now, id);
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

  // MOBILE MONEY (ou mock sandbox) : VERSEMENT RÉEL via adapter.disburse().
  // Débloque le cash-out : on ne refuse plus en dur (Audit #01). Si l'opérateur n'expose
  // pas encore de disburse (rails réels pas câblés → tâche #02), on refuse SANS débiter.
  const isMM = mock || ['mvola', 'orange', 'airtel', 'mobilemoney'].includes(provider);
  if (!isMM) return { ok: false, error: 'no_provider' };
  const adapter = mock
    ? await getAdapter('orange')                                   // le mock ignore l'opérateur
    : await resolveAdapter(provider === 'mobilemoney' ? undefined : (provider as OperatorKey), args.msisdn || '');
  if (!adapter || !adapter.disburse) return { ok: false, error: `${provider}_payout_not_configured` };

  // 1) RÉSERVER : débit wallet + payout 'pending' (l'argent est bloqué le temps du versement).
  let payoutId: string;
  try {
    const run = db.transaction(() => {
      const bal = getWalletBalance(args.userId);
      if (bal < amount) throw new Error('insufficient_balance');
      const id = randomUUID();
      const now = Date.now();
      addWalletTransaction(args.userId, -amount, 'payout', 'Retrait (en cours)', now, id);
      db.prepare('INSERT INTO payouts (id, user_id, amount_cents, msisdn, provider, status, created_at, settled_at, provider_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, args.userId, amount, args.msisdn || null, provider, 'pending', now, null, null);
      return id;
    });
    payoutId = run();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  }

  // 2) VERSER via l'opérateur. Succès → 'paid'. Échec → ROLLBACK (recrédit + 'failed') : jamais d'argent perdu.
  const rollback = () => {
    try {
      db.transaction(() => {
        addWalletTransaction(args.userId, amount, 'payout', 'Retrait échoué (remboursé)', Date.now(), payoutId + '-rb');
        db.prepare("UPDATE payouts SET status = 'failed' WHERE id = ?").run(payoutId);
      })();
    } catch { /* best-effort */ }
  };
  try {
    const d = await adapter.disburse({ amount, payeeMsisdn: args.msisdn || '', description: 'Retrait T2M', txRef: payoutId });
    if (d.ok) {
      db.prepare("UPDATE payouts SET status = 'paid', settled_at = ?, provider_ref = ? WHERE id = ?").run(Date.now(), d.ref || null, payoutId);
      return { ok: true, payout_id: payoutId, balance_cents: getWalletBalance(args.userId) };
    }
    rollback();
    return { ok: false, error: d.error || 'disburse_failed', balance_cents: getWalletBalance(args.userId) };
  } catch {
    rollback();
    return { ok: false, error: 'disburse_error', balance_cents: getWalletBalance(args.userId) };
  }
}
