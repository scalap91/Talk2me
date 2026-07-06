/**
 * Talk2Me — Monde 3D : géoréférencement des pièces (Pascal 2026-06-21).
 *
 * BRIQUE MINIMALE : convertit les VRAIES coordonnées GPS (lat/lng) des pièces
 * (resto/boutique/plat — déjà stockées) en coordonnées LOCALES du monde 3D, en
 * mètres autour d'une origine (centre du quartier/ville). On place ensuite la
 * façade GLB de chaque pièce à (x, 0, z) dans la scène Three.js, et le décor
 * (HunyuanWorld) remplit l'espace entre elles.
 *
 * Projection équirectangulaire locale (exacte à ~quelques cm sur l'échelle d'un
 * quartier/ville, largement suffisant). Pure, sans dépendance, client+serveur.
 *
 * Convention 3D : X = est (+) / ouest (−), Z = SUD (+) / nord (−) — repère Three.js
 * main gauche où l'on regarde vers −Z ; on met le nord en −Z pour que « avancer »
 * (−Z) = aller vers le nord. Y = hauteur (toujours 0 au sol).
 */

export interface LatLng { lat: number; lng: number }
export interface WorldXZ { x: number; z: number }

const EARTH_M_PER_DEG_LAT = 110540; // mètres par degré de latitude (quasi constant)
const M_PER_DEG_LNG_AT_EQ = 111320; // mètres par degré de longitude à l'équateur
const toRad = (d: number) => (d * Math.PI) / 180;

/** GPS → coordonnées locales du monde (mètres) autour d'une origine. */
export function worldFromGps(p: LatLng, origin: LatLng): WorldXZ {
  const mPerLng = M_PER_DEG_LNG_AT_EQ * Math.cos(toRad(origin.lat));
  return {
    x: (p.lng - origin.lng) * mPerLng,          // est/ouest
    z: -(p.lat - origin.lat) * EARTH_M_PER_DEG_LAT, // nord = −Z
  };
}

/** Inverse : coordonnées locales (mètres) → GPS (pour caméra/minimap). */
export function gpsFromWorld(w: WorldXZ, origin: LatLng): LatLng {
  const mPerLng = M_PER_DEG_LNG_AT_EQ * Math.cos(toRad(origin.lat));
  return {
    lat: origin.lat - w.z / EARTH_M_PER_DEG_LAT,
    lng: origin.lng + w.x / mPerLng,
  };
}

/** Distance réelle entre deux points GPS (haversine, mètres) — pour le LOD « autour de moi ». */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Pièces à charger : celles dans `radiusM` mètres autour de la position courante (LOD). */
export function piecesWithin<T extends LatLng>(center: LatLng, items: T[], radiusM = 500): T[] {
  return items.filter((it) => distanceMeters(center, it) <= radiusM);
}
