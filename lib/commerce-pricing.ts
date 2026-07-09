/**
 * Talk2Me — TARIFICATION ACHAT (Pascal 2026-06-24). Source UNIQUE pour l'affichage
 * (côté acheteur) ET le débit réel (serveur). Modèle : l'ACHETEUR paie tout par-dessus
 * le prix de l'article — il n'y a pas de marge mangée.
 *
 *   Total payé = Article (→ vendeur) + Commission T2M (notre part) + Frais PaPi + Livraison
 *
 * Taux : commission T2M 3% ; PaPi Transit ≈ 3,8% (MVola, le plus courant à Mada — à
 * affiner par méthode quand on passera en Direct 1,2%). Montants en plus petite unité
 * (Ariary entier, cf money.ts).
 */
export const COMMISSION_RATE = 0.03;   // notre commission plateforme
export const PAPI_FEE_RATE = 0.038;    // frais PaPi mode Transit (MVola ~3,8%)

export interface OrderQuote {
  article: number;     // prix vendeur (lui revient)
  commission: number;  // notre part (3%)
  papi_fee: number;    // frais PaPi (répercutés à l'acheteur)
  delivery: number;    // livraison (0 si non applicable)
  total: number;       // ce que l'acheteur paie réellement
}

// LIVRAISON calculée par distance (modèle Drive : base + tarif/km). Tarifs en ARIARY,
// configurables via env. Défauts calés sur les coursiers réels d'Antananarivo
// (recherche 2026-06-24 : vélo 2 500–9 500 Ar, moto ~7 000 Ar/course) → base 2 500 +
// 700/km donne 5 km=6 000, 10 km=9 500, fidèle au marché.
export const DELIVERY_BASE_CENTS = Number(process.env.DELIVERY_BASE_CENTS) || 2500;   // base livraison (Ar)
export const DELIVERY_PER_KM_CENTS = Number(process.env.DELIVERY_PER_KM_CENTS) || 700; // par km (Ar)

/** Distance haversine (km) entre 2 points GPS. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Frais de livraison = base + tarif/km × distance (arrondi 100 Ar). 0 si pas de distance. */
export function deliveryFareCents(km: number | null | undefined): number {
  if (!Number.isFinite(km as number) || (km as number) < 0) return 0;
  return Math.round((DELIVERY_BASE_CENTS + DELIVERY_PER_KM_CENTS * (km as number)) / 100) * 100;
}

/** Livraison à appliquer : frais fixes boutique si définis, sinon calcul par distance
 *  (Drive) entre la position du vendeur et celle de l'acheteur. 0 si rien de connu. */
export function resolveDelivery(t: { deliveryCents?: number; originLat?: number | null; originLng?: number | null }, lat?: number, lng?: number): number {
  if (t.deliveryCents && t.deliveryCents > 0) return t.deliveryCents;
  if (t.originLat != null && t.originLng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return deliveryFareCents(distanceKm(t.originLat, t.originLng, lat as number, lng as number));
  }
  return 0;
}

/** Taux optionnels (réglés par l'admin, passés par le serveur). Défaut = constantes. */
export function quoteOrder(articleCents: number, deliveryCents = 0, rates?: { commission?: number; papiFee?: number }): OrderQuote {
  const article = Math.max(0, Math.round(articleCents));
  const delivery = Math.max(0, Math.round(deliveryCents));
  const cRate = typeof rates?.commission === 'number' ? rates.commission : COMMISSION_RATE;
  const pRate = typeof rates?.papiFee === 'number' ? rates.papiFee : PAPI_FEE_RATE;
  const commission = Math.round(article * cRate);
  const papi_fee = Math.round(article * pRate);
  const total = article + commission + papi_fee + delivery;
  return { article, commission, papi_fee, delivery, total };
}
