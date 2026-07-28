/**
 * ENVOI DE COLIS P2P (Pascal 2026-07-26) — un particulier envoie un colis/courrier SANS boutique.
 * On NE crée PAS un 3e système : le colis passe par le moteur d'acheminement (Système B, shipment.ts)
 * + l'escrow réel, exactement comme une commande boutique. Le PRIX vient du TARIF de l'agence
 * (transport_profile : base + par km) déclaré à l'inscription — pas d'enchère (ça, c'est le Système A).
 *
 * Ici : uniquement le DEVIS (pur, réutilisable). Le paiement + création du colis = startParcel (payments.ts).
 */
import { getDb, createDirectCard } from '@/lib/db';
import { distanceKm, DELIVERY_BASE_CENTS, DELIVERY_PER_KM_CENTS } from '@/lib/commerce-pricing';
import { writeCardFile } from '@/lib/cards/card-file';
import type { SuperCard } from '@/lib/cards/supercard';

export interface ParcelAgency {
  uid: string; name: string; depot_lat: number; depot_lng: number; depot_label: string | null;
  base_cents: number; per_km_cents: number;
}

/** Résout une agence transporteur (vérifiée, dépôt posé, accepte les colis). `agencyId` = 'carrier:<uid>' ou <uid>. */
export function getParcelAgency(agencyId: string): ParcelAgency | null {
  const uid = agencyId.startsWith('carrier:') ? agencyId.slice('carrier:'.length) : agencyId;
  const r = getDb().prepare(`
    SELECT u.id AS uid, COALESCE(u.display_name, u.username) AS name,
           tp.depot_lat, tp.depot_lng, tp.depot_label,
           tp.price_base_cents, tp.price_per_km_cents
    FROM transport_profile tp JOIN users u ON u.id = tp.user_id
    WHERE tp.user_id = ? AND tp.cni_status='verified' AND tp.accepts_parcels=1
      AND tp.depot_lat IS NOT NULL AND tp.depot_lng IS NOT NULL
      AND tp.fleet IS NOT NULL AND tp.fleet != '[]' AND tp.fleet != ''
      AND tp.doc_rcs IS NOT NULL AND tp.doc_nif IS NOT NULL
  `).get(uid) as { uid: string; name: string | null; depot_lat: number; depot_lng: number; depot_label: string | null; price_base_cents: number | null; price_per_km_cents: number | null } | undefined;
  if (!r) return null;
  return {
    uid: r.uid, name: r.name || 'Agence', depot_lat: r.depot_lat, depot_lng: r.depot_lng, depot_label: r.depot_label,
    base_cents: r.price_base_cents ?? DELIVERY_BASE_CENTS, per_km_cents: r.price_per_km_cents ?? DELIVERY_PER_KM_CENTS,
  };
}

/** Liste des agences qui acceptent les colis (les plus proches d'un point si fourni).
 *  `excludeUid` : on n'affiche JAMAIS sa propre agence (on ne s'envoie pas un colis à soi-même). */
export function listParcelAgencies(nearLat?: number, nearLng?: number, limit = 20, excludeUid?: string): (ParcelAgency & { dist_km: number | null })[] {
  const rows = getDb().prepare(`
    SELECT u.id AS uid, COALESCE(u.display_name, u.username) AS name,
           tp.depot_lat, tp.depot_lng, tp.depot_label, tp.price_base_cents, tp.price_per_km_cents
    FROM transport_profile tp JOIN users u ON u.id = tp.user_id
    WHERE tp.cni_status='verified' AND tp.accepts_parcels=1
      AND tp.depot_lat IS NOT NULL AND tp.depot_lng IS NOT NULL
      AND tp.fleet IS NOT NULL AND tp.fleet != '[]' AND tp.fleet != ''
      AND tp.doc_rcs IS NOT NULL AND tp.doc_nif IS NOT NULL
      AND tp.user_id != ?
    LIMIT 60
  `).all(excludeUid || '') as { uid: string; name: string | null; depot_lat: number; depot_lng: number; depot_label: string | null; price_base_cents: number | null; price_per_km_cents: number | null }[];
  return rows.map((r) => ({
    uid: r.uid, name: r.name || 'Agence', depot_lat: r.depot_lat, depot_lng: r.depot_lng, depot_label: r.depot_label,
    base_cents: r.price_base_cents ?? DELIVERY_BASE_CENTS, per_km_cents: r.price_per_km_cents ?? DELIVERY_PER_KM_CENTS,
    dist_km: (nearLat != null && nearLng != null) ? distanceKm(nearLat, nearLng, r.depot_lat, r.depot_lng) : null,
  })).sort((a, b) => (a.dist_km ?? 1e9) - (b.dist_km ?? 1e9)).slice(0, limit);
}

/** Agence de transport (flotte + RCS + NIF) la plus proche d'un point → à qui confier une livraison
 *  boutique automatiquement. Renvoie son uid, ou null si aucune agence dispo près. */
export function nearestTransportAgency(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null;
  const list = listParcelAgencies(lat, lng, 1);
  return list.length ? list[0].uid : null;
}

/** Devis = tarif agence : base + par km × distance (origine → destination), arrondi 100 Ar. */
export function quoteParcel(agencyId: string, oLat: number, oLng: number, dLat: number, dLng: number): { ok: boolean; error?: string; price_cents?: number; km?: number; agency?: ParcelAgency } {
  const agency = getParcelAgency(agencyId);
  if (!agency) return { ok: false, error: 'agency_unavailable' };
  if (![oLat, oLng, dLat, dLng].every((n) => Number.isFinite(n))) return { ok: false, error: 'bad_points' };
  const km = distanceKm(oLat, oLng, dLat, dLng);
  const price = Math.max(agency.base_cents, Math.round((agency.base_cents + agency.per_km_cents * km) / 100) * 100);
  return { ok: true, price_cents: price, km, agency };
}

const AGENCY_COVER = 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=800'; // dépôt/logistique

/** DOCTRINE .card : l'inscription agence PUBLIE une SuperCard SERVICE sur le hub (le service existe
 *  comme card, pas juste une ligne DB). Action = « Envoyer un colis » → /envoyer-colis?agency=<uid>.
 *  Idempotent : 1 seule card par agence (marqueur [AGENCE:<uid>]). Dépubliée si l'agence n'accepte plus. */
export async function publishAgencyCard(userId: string, agency: { uid: string; name: string; depot_label: string | null; base_cents: number; per_km_cents: number }, active: boolean): Promise<{ ok: boolean; card_id?: string }> {
  const db = getDb();
  const marker = `[AGENCE:${agency.uid}]`;
  const existing = db.prepare("SELECT id FROM direct_cards WHERE user_id = ? AND caption LIKE ? AND deleted_at IS NULL LIMIT 1").get(userId, `%${marker}%`) as { id: string } | undefined;
  if (!active) { // l'agence a coupé « accepte les colis » → on retire la card du hub
    if (existing) db.prepare('UPDATE direct_cards SET deleted_at = ? WHERE id = ?').run(Date.now(), existing.id);
    return { ok: true };
  }
  const km = 5; // exemple de tarif pour la description (base + 5 km)
  const example = Math.round((agency.base_cents + agency.per_km_cents * km) / 100) * 100;
  const body = `Agence de livraison — confie-nous tes colis. Dépôt : ${agency.depot_label || 'voir carte'}. Tarif : base ${agency.base_cents.toLocaleString('fr-FR')} Ar + ${agency.per_km_cents.toLocaleString('fr-FR')} Ar/km (ex. 5 km ≈ ${example.toLocaleString('fr-FR')} Ar). Paiement protégé, retrait au code.`;
  const caption = `${agency.name} — Envoi de colis ${marker}`;
  const buildCard = (cardId: string): SuperCard => ({
    format: 't2m.card', spec: 1, id: cardId, version: 1, state: 'published',
    title: `${agency.name} — Envoi de colis`, types: ['service'], channel: 'service', owner: userId,
    images: [AGENCY_COVER], text: { body },
    // Action unique « Envoyer un colis » (route interne). PAS de champ `link` (l'aperçu de lien
    // planterait sur une URL relative et cassait tout écran affichant la carte — profil/feed).
    actions: [{ kind: 'open', label: 'Envoyer un colis', url: `/envoyer-colis?agency=${agency.uid}` }],
  } as unknown as SuperCard);
  // category=null → visible sur le HUB (comme une vitrine boutique). Le `channel:'service'` de la
  // .card porte la sémantique service ; c'est la category direct_cards qui décide de l'inclusion feed.
  if (existing) {
    db.prepare('UPDATE direct_cards SET media_url = ?, caption = ?, category = NULL WHERE id = ?').run(AGENCY_COVER, caption, existing.id);
    await writeCardFile(buildCard(existing.id));
    return { ok: true, card_id: existing.id };
  }
  const card = createDirectCard(userId, { type: 'image', media_url: AGENCY_COVER, caption, category: null });
  await writeCardFile(buildCard(card.id));
  return { ok: true, card_id: card.id };
}
