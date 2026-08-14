import 'server-only';

/**
 * Talk2Me — RÉMUNÉRATION TERRAIN sur une vente (Pascal 2026-07-30, étendu 2026-08-05).
 * Quand une vente se règle sur une fiche (boutique / resto-eat / plat maison / service / annonce /
 * VÉHICULE en location) qui a un CONTRIBUTEUR-RÉFÉRENT (rail shop_referents, keyé sur l'id de la
 * fiche — annonce comprise depuis Module 2), il touche sa part (0,75 %) et l'override remonte
 * parrain/grand-parrain — via le moteur UNIQUE logContribution (network.ts) : split 0,75/0,15/0,10,
 * stop grand-parrain, garde-fou anti-perte (≤ notre commission plateforme).
 * Isolé + best-effort : une commission terrain ne DOIT JAMAIS casser un paiement.
 * B (2026-08-05) : ne dépend PLUS de orderType='boutique' — dès qu'il y a un référent on crédite,
 * avec le bon code de contribution selon le kind (resto/plat → resto_client ; service → annonce_sale).
 */
import { getReferent } from '@/lib/referents';
import { getContributor, logContribution } from '@/lib/network';
import { getSimpleShop, getItemShop } from '@/lib/simple-shop';

// Types de transaction TRANSPORT (pas de boutique : le « référent » = le parrain du transporteur).
const TRANSPORT_ORDERS = new Set(['ride', 'parcel', 'move', 'encombrants']);

export function creditFieldOnSale(a: { orderType?: string | null; shopId?: string | null; articleCents: number; label?: string | null; cardId?: string | null; sellerId?: string | null; escrowRef?: string | null }): void {
  try {
    const article = Math.round(a.articleCents || 0);
    if (article <= 0) return;
    // Fiche concernée : shop_id explicite, SINON dérivé de la card (achat Card OS direct,
    // shop_id absent — l'escrow porte card_id). Fix Pascal 2026-08-05 : sans ça, l'override
    // ne partait pas sur une vente de .card en direct.
    let shopId = a.shopId || null;
    if (!shopId && a.cardId) {
      // La FICHE porteuse du référent = l'annonce, quand le cardId est préfixé :
      //  `rental:<id>`  = location véhicule ; `reserve:<id>` = acompte de réservation d'une annonce classique.
      if (a.cardId.startsWith('rental:')) shopId = a.cardId.slice('rental:'.length);
      else if (a.cardId.startsWith('reserve:')) shopId = a.cardId.slice('reserve:'.length);
      else { try { shopId = getItemShop(a.cardId)?.shopId || null; } catch { /* */ } }
    }
    if (shopId) {
      // La fiche a-t-elle un RÉFÉRENT actif ? getReferent est GÉNÉRIQUE (shop_referents keyé sur l'id) :
      // il répond pour une boutique/service/plat MAIS AUSSI pour une annonce/VÉHICULE (Module 2, 2026-08-12).
      const ref = getReferent(shopId);
      if (ref && getContributor(ref.referent_id)) {
        // Pas de simple_shop pour cet id → c'est une annonce/véhicule (location, vente d'annonce) → 'annonce_sale'.
        const kind = getSimpleShop(shopId)?.kind || 'annonce';
        const code = (kind === 'eat' || kind === 'plat_maison') ? 'resto_client'
          : (kind === 'service' || kind === 'emploi' || kind === 'annonce') ? 'annonce_sale'
          : 'boutique_sale';
        logContribution(ref.referent_id, code, {
          valueCents: article, targetId: shopId, targetLabel: (a.label || 'Vente').slice(0, 80),
          orderRef: a.escrowRef ?? null, // libérée au wallet quand l'escrow se libère (vente conclue)
        });
        return;
      }
    }
    // TRANSPORT (Pascal 2026-08-12) : course/colis/passager n'a pas de boutique-référent. Le « référent »
    // = le PARRAIN (sponsor réseau) du TRANSPORTEUR (agence = son propriétaire ; sinon le chauffeur).
    // UNE seule chaîne, tirée de nos 3% (logContribution plafonne à la commission plateforme).
    // Pas de sponsor (transporteur non-contributeur) → rien, c'est voulu.
    if (a.sellerId && TRANSPORT_ORDERS.has((a.orderType || '').toLowerCase())) {
      const parrain = getContributor(a.sellerId)?.sponsor_id;
      if (parrain && getContributor(parrain)) {
        logContribution(parrain, 'ride_done', {
          valueCents: article, targetId: a.sellerId, targetLabel: (a.label || 'Transport').slice(0, 80),
          orderRef: a.escrowRef ?? null, // libérée quand la course/le colis se conclut (releaseEscrow)
        });
      }
    }
  } catch { /* une commission terrain ne casse JAMAIS un règlement */ }
}
