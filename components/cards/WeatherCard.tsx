'use client';

/**
 * WeatherCard — météo actuelle réelle (Open-Meteo).
 *
 * Doctrine talktome-cards-primaute : card riche, text="".
 * Doctrine retranscrire-api : valeurs affichées telles que reçues
 * (arrondies à 1 décimale côté serveur pour lisibilité, pas recalculées).
 * Doctrine no-excuses : si data===null, on ne rend rien (le parent gère).
 */

import React from 'react';
import { motion } from 'framer-motion';
import type { WeatherCardData } from '@/lib/weather';

interface WeatherCardProps {
  weather: WeatherCardData;
}

const WeatherCard: React.FC<WeatherCardProps> = ({ weather }) => {
  const {
    temperature_c,
    feels_like_c,
    condition_label,
    icon,
    wind_kmh,
    humidity_pct,
    place_label,
    source_url,
  } = weather;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-br from-red-500/15 via-red-500/10 to-transparent p-4"
    >
      <div className="flex items-start gap-4">
        <div className="text-5xl leading-none" aria-hidden>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-white tabular-nums">
              {Math.round(temperature_c)}°
            </span>
            <span className="text-sm text-white/60">
              {condition_label}
            </span>
          </div>
          {place_label && (
            <div className="text-xs text-white/55 mt-0.5 truncate">{place_label}</div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/55">
            {feels_like_c !== null && (
              <span>Ressenti {Math.round(feels_like_c)}°</span>
            )}
            {wind_kmh !== null && <span>Vent {wind_kmh} km/h</span>}
            {humidity_pct !== null && <span>Humidité {humidity_pct} %</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
        <span>via Open-Meteo</span>
        <a
          href={source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-white/60"
        >
          source
        </a>
      </div>
    </motion.div>
  );
};

export default WeatherCard;
