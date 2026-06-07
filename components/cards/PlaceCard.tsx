'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export interface Place {
  name: string;
  category: string;
  cuisine: string | null;
  address: string | null;
  distance_m: number;
  maps_url: string;
  google_maps_url: string;
  directions_url?: string;
  source_url?: string;
  website?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  opening_hours_raw?: string | null;
  open_status?: {
    is_open: boolean | null;
    label: string | null;
  } | null;
  image_url?: string | null;
  lat: number;
  lng: number;
}

interface PlaceCardProps {
  places: Place[];
  /**
   * Mot-clé métier utilisé pour le deep-link Maps "search" (ex "pharmacie",
   * "restaurant", "boulangerie"). Si absent, fallback sur category POI précis.
   */
  intentQuery?: string;
  /** Position user au moment de la recherche (centre de la recherche Maps). */
  userLat?: number;
  userLng?: number;
}

const categoryEmoji = (category: string): string => {
  const map: Record<string, string> = {
    restaurant: '🍽️',
    cafe: '☕',
    fast_food: '🍔',
    bar: '🍸',
    pub: '🍺',
    biergarten: '🍻',
    ice_cream: '🍦',
    food_court: '🥡',
    bakery: '🥐',
    pharmacy: '💊',
    hospital: '🏥',
    clinic: '🏥',
    doctors: '👨‍⚕️',
    dentist: '🦷',
    school: '🏫',
    tourism: '📍',
    leisure: '🎡',
  };
  return map[category] || '📍';
};

const categoryLabel = (category: string, cuisine: string | null): string => {
  const map: Record<string, string> = {
    restaurant: 'Restaurant',
    cafe: 'Café',
    fast_food: 'Fast-food',
    bar: 'Bar',
    pub: 'Pub',
    biergarten: 'Brasserie',
    ice_cream: 'Glacier',
    food_court: 'Food court',
    bakery: 'Boulangerie',
    pharmacy: 'Pharmacie',
    hospital: 'Hôpital',
    clinic: 'Clinique',
    doctors: 'Médecin',
    dentist: 'Dentiste',
    school: 'École',
    tourism: 'Lieu',
    leisure: 'Loisir',
  };
  let label = map[category] || category.charAt(0).toUpperCase() + category.slice(1);
  if (cuisine) {
    const primary = cuisine.split(';')[0].trim();
    if (primary) label += ` · ${primary}`;
  }
  return label;
};

const formatDistance = (m: number): string => {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
};

const PlaceCard: React.FC<PlaceCardProps> = ({ places, intentQuery, userLat, userLng }) => {
  if (!places || places.length === 0) return null;

  return (
    // Wrapper racine : full-width + overflow-x-hidden pour clipper toute
    // fuite horizontale du ruban interne (safety net contre le débordement
    // viewport mobile signalé par Pascal 2026-06-03).
    <div className="w-full overflow-x-hidden">
      {/* Ruban scrollable interne : SEUL ce div overflow-x-auto.
          Le scroll vertical du chat reste indépendant.
          px-1 = respiration latérale ; pb-2 = espace sous les cards. */}
      <div
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 px-1"
        role="list"
        aria-label="Lieux à proximité"
      >
        {places.map((place, idx) => (
          <PlaceCardItem
            key={`${place.lat}-${place.lng}-${idx}`}
            place={place}
            idx={idx}
            intentQuery={intentQuery}
            userLat={userLat}
            userLng={userLng}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Construit le deep-link Google Maps "search" contextualisé sur l'intent
 * détecté par DeepSeek (ex: "pharmacie", "restaurant"), centré sur la
 * position user. Si intentQuery absent → fallback sur le POI précis (lat/lng).
 *
 * Doctrine talktome-action-contextualisee : le bouton Maps ne doit PAS
 * ouvrir le POI random de la card, mais bien la recherche métier autour
 * du user. La card reste la preuve d'un POI réel ; le bouton est
 * "voir tous les X autour de moi".
 */
function buildMapsSearchUrl(
  place: Place,
  intentQuery?: string,
  userLat?: number,
  userLng?: number
): string {
  if (intentQuery && typeof userLat === 'number' && typeof userLng === 'number') {
    return `https://www.google.com/maps/search/${encodeURIComponent(intentQuery)}/@${userLat},${userLng},15z`;
  }
  if (intentQuery) {
    // intent connu mais pas de position : recherche brute (Maps centrera lui-même)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(intentQuery)}`;
  }
  // Fallback POI précis (rétrocompat)
  return (
    place.google_maps_url ||
    place.maps_url ||
    `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
  );
}

const PlaceCardItem: React.FC<{
  place: Place;
  idx: number;
  intentQuery?: string;
  userLat?: number;
  userLng?: number;
}> = ({ place, idx, intentQuery, userLat, userLng }) => {
  const [enrichedPhoto, setEnrichedPhoto] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const photoUrl = place.image_url || enrichedPhoto;
  const showPhoto = !!photoUrl && !imgError;

  useEffect(() => {
    if (place.image_url) return; // already has image, skip fetch

    const controller = new AbortController();

    const params = new URLSearchParams({
      name: place.name,
      cuisine: place.cuisine || '',
      category: place.category,
    });

    fetch(`/api/enrich/photo?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data?.photo) {
          setEnrichedPhoto(data.photo);
        }
      })
      .catch(() => {
        // noop on error
      });

    return () => {
      controller.abort();
    };
  }, [place.name, place.lat, place.category, place.cuisine, place.image_url]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: idx * 0.06 }}
      className="min-w-[78%] max-w-[78%] shrink-0 snap-start bg-white/[0.04] backdrop-blur-md border border-white/8 rounded-2xl overflow-hidden"
    >
      {/* Photo cover */}
      <div className="relative w-full h-[140px] overflow-hidden">
        {showPhoto ? (
          <img
            src={photoUrl!}
            alt={place.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-white/[0.06] flex items-center justify-center">
            <span className="text-6xl opacity-30 font-emoji">{categoryEmoji(place.category)}</span>
          </div>
        )}

        {/* Badge ouvert/fermé */}
        {place.open_status?.is_open === true && (
          <div className="absolute bottom-2 left-2 bg-emerald-500/15 text-emerald-300 text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {place.open_status.label || 'Ouvert'}
          </div>
        )}
        {place.open_status?.is_open === false && (
          <div className="absolute bottom-2 left-2 bg-orange-500/15 text-orange-300 text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            {place.open_status.label || 'Fermé'}
          </div>
        )}
      </div>

      {/* Corps */}
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-emoji">{categoryEmoji(place.category)}</span>
          <h3 className="text-[15px] font-semibold text-white truncate">{place.name}</h3>
        </div>

        <p className="text-xs text-white/55 mt-0.5">
          {categoryLabel(place.category, place.cuisine)}
        </p>

        <p
          className="text-[11px] text-white/45 mt-1 truncate"
          title={place.address || undefined}
        >
          {formatDistance(place.distance_m)}
          {place.address ? ` · ${place.address}` : ''}
        </p>

        {/* Boutons */}
        <div className="flex gap-2 mt-3">
          <a
            href={buildMapsSearchUrl(place, intentQuery, userLat, userLng)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={
              intentQuery
                ? `Rechercher ${intentQuery} autour de moi sur Google Maps`
                : `Voir ${place.name} sur Google Maps`
            }
            className="flex-1 text-center py-2 rounded-full text-[11px] font-medium bg-red-500/15 text-red-200 border border-red-400/20 hover:bg-red-500/25 transition"
          >
            <span className="font-emoji">📍</span> Maps
          </a>
          <a
            href={place.directions_url || `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Itinéraire vers ${place.name}`}
            className="flex-1 text-center py-2 rounded-full text-[11px] font-medium bg-white/[0.06] text-white/80 border border-white/8 hover:bg-white/[0.10] transition"
          >
            <span className="font-emoji">🧭</span> Itinéraire
          </a>
          <a
            href={place.source_url || place.website || place.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Plus d'infos sur ${place.name}`}
            className="flex-1 text-center py-2 rounded-full text-[11px] font-medium bg-white/[0.06] text-white/80 border border-white/8 hover:bg-white/[0.10] transition"
          >
            <span className="font-emoji">🔗</span> Plus
          </a>
        </div>

        {/* Footer source */}
        <p className="text-[10px] text-white/35 text-center mt-3">via OpenStreetMap</p>
      </div>
    </motion.div>
  );
};

export default PlaceCard;
