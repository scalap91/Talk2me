/**
 * lib/client/pay-for-card — LE « A — Act » (Card OS, Pascal 2026-07-01).
 * UN seul point d'entrée de paiement pour N'IMPORTE QUELLE card. Lit `card.channel`
 * (le switch) + `card.id` et route vers le rail EXISTANT (`/api/commerce/buy` unifié,
 * `/api/annonces/reserve` pour l'acompte). Le PRIX est TOUJOURS résolu côté serveur —
 * la card ne fait que pointer l'objet, jamais porter un montant de confiance.
 *
 * Le lecteur fournit le contexte qu'il connaît (shop, panier, msisdn, pay_auth_id).
 * Rien de nouveau côté paiement : escrow / provider / pay-auth restent tels quels.
 */
import type { SuperCard, CardActionKind, CardChannel } from '@/lib/cards/supercard';

export interface PayCtx {
  shopKey?: string | null;
  shopId?: string | null;
  items?: { item_id: string; qty?: number }[];
  msisdn?: string | null;
  payAuthId?: string | null;
  lat?: number;
  lng?: number;
  forceExternal?: boolean;
}

export interface PayForCardResult {
  ok: boolean;
  needsMobileAuth?: boolean;   // step-up desktop → ouvrir MobilePayAuthModal(authId)
  authId?: string;
  mode?: 'paid' | 'pay';       // 'paid' = escrow bloqué via solde ; 'pay' = paiement en cours
  escrowId?: string;
  intentId?: string;
  checkoutUrl?: string | null; // page de paiement (null si push USSD)
  currency?: string;
  quote?: unknown;
  error?: string;
}

/** channel (switch) → type attendu par /api/commerce/buy. */
function typeForChannel(channel: CardChannel | undefined): 'boutique' | 'plat' | 'annonce' {
  return channel === 'eat' ? 'plat' : channel === 'annonce' ? 'annonce' : 'boutique';
}

// payForCard ne lit QUE id + channel de la card → on accepte un objet minimal (utile
// pour un panier : plusieurs articles, un seul `channel`, items dans le ctx).
export async function payForCard(card: Pick<SuperCard, 'id' | 'channel'>, action: CardActionKind, ctx: PayCtx = {}): Promise<PayForCardResult> {
  try {
    // Acompte / réservation (annonce) → rail dédié existant.
    if (action === 'reserve') {
      const r = await fetch('/api/annonces/reserve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id, pay_auth_id: ctx.payAuthId ?? undefined }),
      }).then((x) => x.json());
      if (r?.needs_mobile_auth) return { ok: false, needsMobileAuth: true, authId: r.auth_id };
      return r?.ok
        ? { ok: true, mode: r.mode, escrowId: r.escrow_id, intentId: r.intent_id, checkoutUrl: r.checkout_url }
        : { ok: false, error: r?.error || 'reserve_failed' };
    }

    // Achat / commande (boutique / eat / annonce) → checkout protégé unifié existant.
    const type = typeForChannel(card.channel);
    const body: Record<string, unknown> = {
      type,
      msisdn: ctx.msisdn ?? undefined,
      pay_auth_id: ctx.payAuthId ?? undefined,
      force_external: ctx.forceExternal ?? undefined,
      ...(ctx.lat != null ? { lat: ctx.lat } : {}),
      ...(ctx.lng != null ? { lng: ctx.lng } : {}),
    };
    if (type === 'annonce') {
      body.annonce_id = card.id;
    } else {
      // boutique / plat : l'objet = card.id ; le SHOP vient du lecteur.
      if (ctx.items && ctx.items.length) body.items = ctx.items;
      else body.item_id = card.id;
      if (ctx.shopKey) body.shop_key = ctx.shopKey;
      if (ctx.shopId) body.shop_id = ctx.shopId;
    }
    const r = await fetch('/api/commerce/buy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((x) => x.json());
    if (r?.needs_mobile_auth) return { ok: false, needsMobileAuth: true, authId: r.auth_id };
    return r?.ok
      ? { ok: true, mode: r.mode, escrowId: r.escrow_id, intentId: r.intent_id, checkoutUrl: r.checkout_url, currency: r.currency, quote: r.quote }
      : { ok: false, error: r?.error || 'order_failed' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
