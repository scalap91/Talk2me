/**
 * Open-Meteo (sans clé) — météo actuelle pour lat/lng.
 * Doctrine retranscrire-API : on retourne les valeurs réelles, jamais arrondies au hasard.
 * Cache mémoire 30 min par cellule arrondie 0.1° (≈ 11 km).
 */

export interface WeatherCardData {
  temperature_c: number;
  feels_like_c: number | null;
  condition_label: string;
  icon: string;
  wind_kmh: number | null;
  humidity_pct: number | null;
  source: 'open-meteo';
  source_url: string;
  observed_at: string;
  lat: number;
  lng: number;
  place_label: string | null;
}

interface CacheEntry {
  data: WeatherCardData | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min
const FETCH_TIMEOUT = 8000;
const USER_AGENT = 'Talk2MeBot/0.1 (+https://genius-web.fr/talktome)';

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
  } finally {
    clearTimeout(id);
  }
}

interface OpenMeteoCurrent {
  temperature_2m?: number;
  apparent_temperature?: number;
  relative_humidity_2m?: number;
  weather_code?: number;
  wind_speed_10m?: number;
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent;
  current_units?: Record<string, string>;
}

/** WMO weather code → {icon, label_fr}. Source: open-meteo doc. */
const WMO: Record<number, { icon: string; label: string }> = {
  0: { icon: '☀️', label: 'Ciel dégagé' },
  1: { icon: '🌤️', label: 'Plutôt dégagé' },
  2: { icon: '⛅', label: 'Partiellement nuageux' },
  3: { icon: '☁️', label: 'Couvert' },
  45: { icon: '🌫️', label: 'Brouillard' },
  48: { icon: '🌫️', label: 'Brouillard givrant' },
  51: { icon: '🌦️', label: 'Bruine légère' },
  53: { icon: '🌦️', label: 'Bruine modérée' },
  55: { icon: '🌦️', label: 'Bruine dense' },
  56: { icon: '🌦️', label: 'Bruine verglaçante légère' },
  57: { icon: '🌦️', label: 'Bruine verglaçante dense' },
  61: { icon: '🌧️', label: 'Pluie faible' },
  63: { icon: '🌧️', label: 'Pluie modérée' },
  65: { icon: '🌧️', label: 'Pluie forte' },
  66: { icon: '🌧️', label: 'Pluie verglaçante faible' },
  67: { icon: '🌧️', label: 'Pluie verglaçante forte' },
  71: { icon: '🌨️', label: 'Neige faible' },
  73: { icon: '🌨️', label: 'Neige modérée' },
  75: { icon: '🌨️', label: 'Neige forte' },
  77: { icon: '🌨️', label: 'Grains de neige' },
  80: { icon: '🌦️', label: 'Averses faibles' },
  81: { icon: '🌦️', label: 'Averses modérées' },
  82: { icon: '⛈️', label: 'Averses violentes' },
  85: { icon: '🌨️', label: 'Averses de neige faibles' },
  86: { icon: '🌨️', label: 'Averses de neige fortes' },
  95: { icon: '⛈️', label: 'Orage' },
  96: { icon: '⛈️', label: 'Orage avec grêle' },
  99: { icon: '⛈️', label: 'Orage violent avec grêle' },
};

function decodeWeatherCode(code: number | undefined): { icon: string; label: string } {
  if (code === undefined || code === null) return { icon: '🌡️', label: 'Conditions inconnues' };
  return WMO[code] || { icon: '🌡️', label: 'Conditions inconnues' };
}

export async function getWeather(
  lat: number,
  lng: number,
  placeLabel?: string | null,
): Promise<WeatherCardData | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cacheKey = `${lat.toFixed(1)}|${lng.toFixed(1)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&timezone=auto&wind_speed_unit=kmh`;

  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res.ok) {
      cache.set(cacheKey, { data: null, fetchedAt: Date.now() });
      return null;
    }
    const data = (await res.json()) as OpenMeteoResponse;
    const cur = data.current;
    if (!cur || typeof cur.temperature_2m !== 'number') {
      cache.set(cacheKey, { data: null, fetchedAt: Date.now() });
      return null;
    }
    const { icon, label } = decodeWeatherCode(cur.weather_code);
    const result: WeatherCardData = {
      temperature_c: Math.round(cur.temperature_2m * 10) / 10,
      feels_like_c:
        typeof cur.apparent_temperature === 'number'
          ? Math.round(cur.apparent_temperature * 10) / 10
          : null,
      condition_label: label,
      icon,
      wind_kmh:
        typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : null,
      humidity_pct:
        typeof cur.relative_humidity_2m === 'number'
          ? Math.round(cur.relative_humidity_2m)
          : null,
      source: 'open-meteo',
      source_url: `https://open-meteo.com/`,
      observed_at: new Date().toISOString(),
      lat,
      lng,
      place_label: placeLabel || null,
    };
    cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (e) {
    console.error('[weather] error', e);
    cache.set(cacheKey, { data: null, fetchedAt: Date.now() });
    return null;
  }
}
