import 'server-only';

/**
 * Talk2Me — RÉMUNÉRATION TERRAIN sur une vente (Pascal 2026-07-30, étendu 2026-08-05).
 * Quand une vente se règle sur une fiche (boutique / resto-eat / plat maison / service) qui a un
 * CONTRIBUTEUR-RÉFÉRENT (rail shop_referents), il touche sa part (0,75 %) et l'override remonte
 * parrain/grand-parrain — via le moteur UNIQUE logContribution (network.ts) : split 0,75/0,15/0,10,
 * stop grand-parrain, garde-fou anti-perte (≤ notre commission plateforme).
 * Isolé + best-effort : une commission terrain ne DOIT JAMAIS casser un paiement.
 * B (2026-08-05) : ne dépend PLUS de orderType='boutique' — dès qu'il y a un référent on crédite,
 * avec le bon code de contribution selon le kind (resto/plat → resto_client ; service → annonce_sale).
 */
import { getReferent } from '@/lib/referents';
import { getContributor, logContribution } from '@/lib/network';
import { getSimpleShop, getItemShop } from '@/lib/simple-shop';

export function creditFieldOnSale(a: { orderType?: string | null; shopId?: string | null; articleCents: number; label?: string | null; cardId?: string | null }): void {
  try {
    const article = Math.round(a.articleCents || 0);
    if (article <= 0) return;
    // Fiche concernée : shop_id explicite, SINON dérivé de la card (achat Card OS direct,
    // shop_id absent — l'escrow porte card_id). Fix Pascal 2026-08-05 : sans ça, l'override
    // ne partait pas sur une vente de .card en direct.
    let shopId = a.shopId || null;
    if (!shopId && a.cardId) { try { shopId = getItemShop(a.cardId)?.shopId || null; } catch { /* */ } }
    if (!shopId) return;
    // La fiche a-t-elle un RÉFÉRENT actif ? (getReferent ne renvoie que sur les fiches simple_shops.)
    const ref = getReferent(shopId);
    if (!ref || !getContributor(ref.referent_id)) return;
    const kind = getSimpleShop(shopId)?.kind || 'boutique';
    const code = (kind === 'eat' || kind === 'plat_maison') ? 'resto_client'
      : (kind === 'service' || kind === 'emploi') ? 'annonce_sale'
      : 'boutique_sale';
    logContribution(ref.referent_id, code, {
      valueCents: article, targetId: a.shopId, targetLabel: (a.label || 'Vente').slice(0, 80),
    });
  } catch { /* une commission terrain ne casse JAMAIS un règlement */ }
}
