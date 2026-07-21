/**
 * lib/cards/v2/reader/seo — LE CONTEXTE SEO du lecteur unique (P1, 1er pilote public).
 *
 * Refonte SuperCard (étape 6, Phase B). Prouve qu'une surface publique (page SSR / partage)
 * est produite par LE lecteur unique, en contexte `seo`, sans logique propre à la page :
 * `renderSeo(card)` sort les métadonnées (title/description/canonical/OG/prix/locale) à partir
 * du ViewModel `renderCard(card, 'seo')` + de quelques champs d'identité. Déterministe, grounded
 * (jamais d'invention — que le vrai contenu de la carte). Aligné sur les conventions legacy
 * (`lib/cards/card-seo.ts`) : SITE, longueurs, canonique `/card/{slug}--{id}`. Pur (browser-safe).
 */
import type { SuperCardV2 } from '../types';
import { renderCard } from './reader';
import { displayMoney } from './services';

const SITE = 'Talk2Me';
const DEFAULT_BASE = 'https://talk2me.fr';
const TITLE_MAX = 60;
const DESC_MAX = 158;

export interface SeoMeta {
  title: string;
  heading: string;
  description: string;
  canonical: string;
  ogType: string;
  image?: string;
  price?: number;
  currency?: string;
  publishedTime?: string;
  locale?: string;
  siteName: string;
}

function clean(s?: string): string {
  return (s || '')
    .replace(/\[[A-Z0-9_]+:[^\]]*\]/g, ' ') // marqueurs internes [VITRINE:…]…
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function truncate(s: string, max: number): string {
  s = clean(s);
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}
function displayName(card: SuperCardV2): string {
  const t = clean(card.title);
  if (t && t.length > 2) return t;
  const body = clean(card.text?.body);
  if (body) return truncate(body.split(/[.!?\n]/)[0] || body, 70);
  return t || 'Découverte';
}
export function cardSlug(card: SuperCardV2): string {
  return displayName(card)
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '') || 'card';
}
export function cardPath(card: SuperCardV2): string { return `/card/${cardSlug(card)}--${card.id}`; }

function ogTypeFor(card: SuperCardV2): string {
  switch (card.kind) {
    case 'album': return 'music.album';
    case 'audio': return 'music.song';
    case 'video': case 'film': return 'video.other';
    case 'product': case 'boutique': return 'product';
    case 'article': return 'article';
    case 'restaurant': return 'restaurant';
    default: return 'website';
  }
}
function qualifier(card: SuperCardV2): string {
  const price = card.price ? displayMoney.formatDisplay(card.price) : ''; // formateur UNIQUE (pas de 2e format)
  const place = clean(card.place?.city || card.place?.address)?.split(',')[0];
  switch (card.kind) {
    case 'product': case 'boutique': return [price, clean(card.source?.name)].filter(Boolean).join(' · ');
    case 'restaurant': return ['plats', place].filter(Boolean).join(' à ');
    case 'listing': return price || 'annonce';
    case 'album': case 'audio': return 'écouter & discuter';
    default: return place || '';
  }
}

/** Nom d'action par famille (comme le suffixe legacy), pour clore la description assemblée. */
function nounFor(card: SuperCardV2): string {
  switch (card.kind) {
    case 'album': case 'audio': return 'À écouter et enrichir';
    case 'product': case 'boutique': case 'restaurant': case 'listing': return 'À découvrir et commander';
    default: return 'À découvrir';
  }
}

/**
 * Description SEO : le vrai texte s'il est consistant, SINON ASSEMBLÉE depuis les données
 * STRUCTURÉES (specs, lieu, prix) — grounded, jamais d'invention. Corrige la régression où une
 * carte sans `text.body` (ex. un vol dont les infos sont dans `specs`) retombait sur le seul titre.
 */
function buildDescription(card: SuperCardV2, viewBody?: string): string {
  const body = clean(viewBody || card.text?.body);
  if (body.length >= 40) return truncate(body, DESC_MAX);
  const bits: string[] = [];
  if (card.specs) {
    for (const [k, v] of Object.entries(card.specs)) {
      if (v !== '' && v != null) bits.push(`${clean(k)} : ${clean(String(v))}`);
    }
  }
  const place = clean(card.place?.city || card.place?.address).split(',')[0];
  if (place && !bits.some((b) => b.includes(place))) bits.push(place);
  if (card.price) bits.push(displayMoney.formatDisplay(card.price));
  const core = bits.length ? bits.join(' · ') : (body || displayName(card));
  return truncate(`${core} — ${nounFor(card)} sur ${SITE}.`, DESC_MAX);
}

/** Produit les métadonnées SEO d'une carte, via le lecteur unique (contexte `seo`). */
export function renderSeo(card: SuperCardV2, opts?: { baseUrl?: string }): SeoMeta {
  const base = (opts?.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
  const view = renderCard(card, 'seo');                 // ← le lecteur unique pilote la sélection
  const heading = displayName(card);
  const core = qualifier(card) ? `${heading} — ${qualifier(card)}` : heading;
  const title = truncate(`${core} | ${SITE}`, TITLE_MAX);
  const description = buildDescription(card, view.body);
  // og:image = une IMAGE (cover puis toute image), sinon la miniature d'une vidéo — JAMAIS une URL vidéo brute.
  const image = view.media.find((m) => m.role === 'cover' && m.type === 'image')?.url
    || view.media.find((m) => m.type === 'image')?.url
    || view.media.find((m) => m.type === 'video')?.meta?.thumbnail;

  const meta: SeoMeta = {
    title, heading, description,
    canonical: base + cardPath(card),
    ogType: ogTypeFor(card),
    siteName: SITE,
  };
  if (image) meta.image = image;
  if (card.price) { meta.price = card.price.amount; meta.currency = card.price.currency; }
  if (card.published_at) meta.publishedTime = typeof card.published_at === 'number' ? new Date(card.published_at).toISOString() : String(card.published_at);
  if (card.language) meta.locale = card.language;
  return meta;
}
