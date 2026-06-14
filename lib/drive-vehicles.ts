/**
 * Talk N Drive — catégories de véhicule (#23).
 * L'app est mondiale : la catégorie est choisie par le CHAUFFEUR à l'inscription,
 * jamais imposée. On ne « code » pas le tuk-tuk. Selon la position GPS (pays), on
 * RÉORDONNE / met en avant les catégories pertinentes — sans jamais en cacher une
 * (un chauffeur reste libre). Demain les mêmes catégories servent au COLIS.
 */

export interface VehicleCat {
  key: string;
  label: string;
  emoji: string;
  /** Peut transporter un colis (sert Brique 2). */
  parcel: boolean;
}

export const VEHICLE_CATS: VehicleCat[] = [
  { key: 'tuktuk', label: 'Tuk-tuk', emoji: '🛺', parcel: true },
  { key: 'moto', label: 'Moto', emoji: '🏍️', parcel: true },
  { key: 'voiture', label: 'Voiture', emoji: '🚗', parcel: true },
  { key: 'velo', label: 'Vélo', emoji: '🚲', parcel: true },
  { key: 'camionnette', label: 'Camionnette', emoji: '🚐', parcel: true },
  { key: 'taxi', label: 'Taxi', emoji: '🚕', parcel: false },
  { key: 'pied', label: 'À pied', emoji: '🚶', parcel: true },
];

export const VEHICLE_MAP: Record<string, VehicleCat> = Object.fromEntries(
  VEHICLE_CATS.map((v) => [v.key, v])
);

/** Ordre de mise en avant par pays (nom FR renvoyé par geolocateCountry / Nominatim). */
const COUNTRY_PRIORITY: Record<string, string[]> = {
  Madagascar: ['tuktuk', 'moto', 'voiture', 'velo'],
  France: ['voiture', 'velo', 'moto', 'camionnette'],
  Maroc: ['taxi', 'voiture', 'moto', 'tuktuk'],
  default: ['voiture', 'moto', 'tuktuk', 'velo'],
};

/** Renvoie les catégories réordonnées pour un pays (toutes restent présentes). */
export function vehiclesForCountry(country?: string | null): VehicleCat[] {
  const pri = (country && COUNTRY_PRIORITY[country]) || COUNTRY_PRIORITY.default;
  const rank = (k: string) => {
    const i = pri.indexOf(k);
    return i === -1 ? pri.length + 1 : i;
  };
  return [...VEHICLE_CATS].sort((a, b) => rank(a.key) - rank(b.key));
}

export function vehicleLabel(key: string): string {
  const v = VEHICLE_MAP[key];
  return v ? `${v.emoji} ${v.label}` : key;
}
