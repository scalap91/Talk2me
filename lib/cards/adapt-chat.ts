import 'server-only';

/**
 * Talk2Me — Adaptateurs Cards CONVERSATIONNELLES → SuperCard (.card), Pascal 2026-07-01.
 * Le chat produit des cards (YouTube, lieu, recette, météo, wiki, produit, web) via des
 * types legacy. Ici on les convertit en `.card` UNIQUE → elles deviennent réutilisables
 * (Garder / Envoyer à un ami / Publier au feed). Le RENDU du chat reste inchangé ; ces
 * adaptateurs servent la sérialisation et les actions. Aucun prix fabriqué (on retranscrit
 * le libellé de l'API tel quel).
 */
import { makeCard, type SuperCard } from './supercard';
import type { YouTubeCardData, PlaceCardData, RecipeCardData, ProductCardData, WebSearchResultData } from '../chat-types';
import type { WeatherCardData } from '../weather';
import type { WikipediaCardData } from '../wikipedia-search';

function slug(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'x';
}
function prune<T extends Record<string, unknown>>(o: T): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '') out[k] = String(v);
  return out;
}

export function fromChatYouTube(v: YouTubeCardData): SuperCard {
  return makeCard({
    id: 'yt_' + v.video_id,
    types: v.is_music ? ['audio', 'video'] : ['video'],
    title: v.title,
    video: { url: `https://youtu.be/${v.video_id}`, embed: `https://www.youtube.com/embed/${v.video_id}` },
    ...(v.thumbnail ? { images: [v.thumbnail] } : {}),
    ...(v.description ? { text: { body: v.description } } : {}),
    source: { name: v.channel, label: 'YouTube' },
  });
}

export function fromChatPlace(p: PlaceCardData): SuperCard {
  const specs = prune({
    Cuisine: p.cuisine, Distance: typeof p.distance_m === 'number' ? Math.round(p.distance_m) + ' m' : null,
    Téléphone: p.phone, Horaires: p.opening_hours_raw || p.opening_hours,
  });
  return makeCard({
    id: 'place_' + slug(p.name) + '_' + p.lat.toFixed(4) + '_' + p.lng.toFixed(4),
    types: ['place'],
    title: p.name,
    ...(p.image_url ? { images: [p.image_url] } : {}),
    place: { lat: p.lat, lng: p.lng, ...(p.address ? { address: p.address } : {}) },
    link: { url: p.website || p.maps_url, reader: 'preview' },
    ...(p.category ? { categories: [p.category] } : {}),
    ...(Object.keys(specs).length ? { specs } : {}),
    source: { name: 'OpenStreetMap', label: 'Lieu' },
  });
}

export function fromChatRecipe(r: RecipeCardData): SuperCard {
  const specs = prune({ Préparation: r.prep_time, Portions: r.servings, Difficulté: r.difficulty });
  return makeCard({
    id: 'recipe_' + slug(r.name),
    types: ['recipe'],
    title: r.name,
    ...(r.image ? { images: [r.image] } : {}),
    ...(r.description ? { text: { body: r.description } } : {}),
    link: { url: r.source_url, reader: 'preview' },
    ...(Object.keys(specs).length ? { specs } : {}),
    source: { name: r.source, label: 'Recette' },
  });
}

export function fromChatWikipedia(w: WikipediaCardData): SuperCard {
  return makeCard({
    id: 'wiki_' + slug(w.title),
    types: ['article'],
    title: w.title,
    ...(w.thumbnail ? { images: [w.thumbnail] } : {}),
    text: { body: w.extract },
    link: { url: w.page_url, reader: 'preview' },
    source: { name: 'Wikipédia', label: 'Article' },
  });
}

export function fromChatWeather(w: WeatherCardData): SuperCard {
  const specs = prune({
    Température: Math.round(w.temperature_c) + '°C',
    Ressenti: w.feels_like_c != null ? Math.round(w.feels_like_c) + '°C' : null,
    Vent: w.wind_kmh != null ? Math.round(w.wind_kmh) + ' km/h' : null,
    Humidité: w.humidity_pct != null ? Math.round(w.humidity_pct) + ' %' : null,
  });
  return makeCard({
    id: 'weather_' + w.lat.toFixed(3) + '_' + w.lng.toFixed(3),
    types: ['link'],
    title: (w.place_label ? w.place_label + ' — ' : '') + w.condition_label,
    place: { lat: w.lat, lng: w.lng },
    specs,
    source: { name: 'Open-Meteo', label: 'Météo' },
  });
}

export function fromChatProduct(p: ProductCardData): SuperCard {
  // Prix : on retranscrit le LIBELLÉ de l'API (jamais un montant fabriqué).
  const specs = prune({ Prix: p.price_label, État: p.condition });
  return makeCard({
    id: 'prod_' + slug(p.id || p.title),
    types: ['product'],
    channel: 'boutique',
    title: p.title,
    ...(p.image_url ? { images: [p.image_url] } : {}),
    link: { url: p.source_url, reader: 'preview' },
    ...(Object.keys(specs).length ? { specs } : {}),
    source: { name: p.source, label: 'Produit' },
  });
}

export function fromChatWebResult(r: WebSearchResultData): SuperCard {
  return makeCard({
    id: 'web_' + slug(r.url),
    types: ['link'],
    title: r.title,
    ...(r.thumbnail ? { images: [r.thumbnail] } : {}),
    ...(r.snippet ? { text: { body: r.snippet } } : {}),
    link: { url: r.url, reader: 'preview' },
    source: { name: r.source || 'Web', label: 'Web', ...(r.favicon ? { icon: r.favicon } : {}) },
  });
}
