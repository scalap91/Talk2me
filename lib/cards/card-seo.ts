/**
 * core/card-engine — SEO ENGINE (Module 1, Pascal 2026-07-08).
 *
 * `cardSeo(card)` = LA brique centrale : à partir d'une SuperCard, sort toutes les
 * métadonnées SEO/GEO d'une page-entité vivante — de façon DÉTERMINISTE et GROUNDED
 * (titre/description = templates par type remplis avec le VRAI contenu de la card ;
 * jamais d'invention). Les mots-clés ne sont PAS une balise meta (morte depuis ~2009) :
 * ce sont les vrais termes du contenu, réutilisés pour le maillage/JSON-LD.
 *
 * Aucun réseau, aucune IA, pur calcul → utilisable dans generateMetadata (SSR).
 * Voir mémoire [[project_talk2me_page_entite_vivante]] + [[project_talk2me_seo_platform_core]].
 */
import type { SuperCard } from './supercard';

const SITE = 'Talk2Me';
const DEFAULT_BASE = 'https://talk2me.fr';
const TITLE_MAX = 60;
const DESC_MAX = 158;

export interface CardSeo {
  title: string;
  description: string;
  canonical: string;
  keywords: string[];
  openGraph: {
    title: string;
    description: string;
    url: string;
    type: string;
    siteName: string;
    images: string[];
  };
  twitter: { card: 'summary' | 'summary_large_image'; title: string; description: string; images: string[] };
  jsonLd: Record<string, unknown>;
}

/** Type dominant de la card (choisit le template SEO + le schema.org). */
function primaryType(card: SuperCard): 'music' | 'product' | 'eat' | 'annonce' | 'place' | 'article' | 'generic' {
  const t = card.types || [];
  const has = (x: string) => t.includes(x as never) || card.channel === x;
  if (has('music') || card.audio?.embed) return 'music';
  if (has('boutique') || has('product')) return 'product';
  if (has('eat') || card.channel === 'eat') return 'eat';
  if (has('annonce') || card.channel === 'annonce') return 'annonce';
  if (has('place') || card.place?.address) return 'place';
  if (has('article') || (card.link?.url && !card.price)) return 'article';
  return 'generic';
}

function clean(s?: string): string {
  return (s || '').replace(/\s+/g, ' ').replace(/<[^>]*>/g, '').trim();
}
function truncate(s: string, max: number): string {
  s = clean(s);
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}
function money(card: SuperCard): string {
  if (typeof card.price?.amount !== 'number') return '';
  const cur = card.price.currency || '';
  return `${card.price.amount}${cur ? ' ' + cur : ''}`.trim();
}

/** TITRE : template par type rempli avec les vraies données ; ~60 car. max. */
function buildTitle(card: SuperCard, kind: ReturnType<typeof primaryType>): string {
  const name = clean(card.title) || 'Découverte';
  const place = clean(card.place?.address)?.split(',')[0];
  const src = clean(card.source?.name);
  let qualifier = '';
  switch (kind) {
    case 'music': qualifier = 'écouter & discuter'; break;
    case 'product': qualifier = [money(card), src].filter(Boolean).join(' · '); break;
    case 'eat': qualifier = ['plats', place].filter(Boolean).join(' à '); break;
    case 'annonce': qualifier = money(card) || 'annonce'; break;
    case 'place': qualifier = place || 'à découvrir'; break;
    default: qualifier = '';
  }
  const core = qualifier ? `${name} — ${qualifier}` : name;
  return truncate(`${core} | ${SITE}`, TITLE_MAX);
}

/** DESCRIPTION : contenu réel d'abord (texte enrichi → source), sinon template factuel. ~158 car. */
function buildDescription(card: SuperCard, kind: ReturnType<typeof primaryType>): string {
  const body = clean(card.text?.body);
  if (body.length >= 40) return truncate(body, DESC_MAX);
  const label = clean(card.source?.label);
  if (label.length >= 40) return truncate(label, DESC_MAX);
  // Template factuel (grounded : uniquement de vrais attributs).
  const bits: string[] = [];
  bits.push(clean(card.title));
  const specs = card.specs ? Object.entries(card.specs).slice(0, 3).map(([k, v]) => `${k} : ${v}`) : [];
  if (specs.length) bits.push(specs.join(', '));
  if (money(card)) bits.push(money(card));
  if (card.rating?.count) bits.push(`${card.rating.count} avis`);
  const noun = kind === 'music' ? 'À écouter et enrichir' : kind === 'product' || kind === 'eat' || kind === 'annonce' ? 'À découvrir et commander' : 'À découvrir';
  return truncate(`${bits.filter(Boolean).join(' · ')} — ${noun} sur ${SITE}.`, DESC_MAX);
}

/** MOTS-CLÉS : vrais termes du contenu (pas une balise meta) → maillage + JSON-LD. */
function buildKeywords(card: SuperCard): string[] {
  const raw = [
    ...(card.keywords || []),
    ...(card.categories || []),
    ...(card.types || []),
    ...(card.specs ? Object.values(card.specs) : []),
    card.source?.name,
  ].filter((x): x is string => typeof x === 'string' && x.trim().length > 1);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const norm = k.trim().toLowerCase();
    if (!seen.has(norm)) { seen.add(norm); out.push(k.trim()); }
  }
  return out.slice(0, 15);
}

/** JSON-LD schema.org par type (vrais champs uniquement). */
function buildJsonLd(card: SuperCard, kind: ReturnType<typeof primaryType>, url: string, description: string): Record<string, unknown> {
  const image = (card.images && card.images[0]) || undefined;
  const publisher = { '@type': 'Organization', name: SITE, url: DEFAULT_BASE };
  const base: Record<string, unknown> = { '@context': 'https://schema.org', name: clean(card.title), url, description };
  if (image) base.image = image;
  const offers = typeof card.price?.amount === 'number'
    ? { '@type': 'Offer', price: card.price.amount, priceCurrency: card.price.currency || 'EUR', availability: 'https://schema.org/InStock' }
    : undefined;
  switch (kind) {
    case 'music':
      return { ...base, '@type': 'MusicRecording', ...(card.source?.name ? { byArtist: { '@type': 'MusicGroup', name: card.source.name } } : {}) };
    case 'product':
    case 'annonce':
      return { ...base, '@type': 'Product', ...(card.source?.name ? { brand: { '@type': 'Brand', name: card.source.name } } : {}), ...(offers ? { offers } : {}), ...(card.rating?.score ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: card.rating.score, reviewCount: card.rating.count || 1 } } : {}) };
    case 'eat':
    case 'place':
      return { ...base, '@type': 'LocalBusiness', ...(card.place?.address ? { address: card.place.address } : {}), ...(card.place?.lat && card.place?.lng ? { geo: { '@type': 'GeoCoordinates', latitude: card.place.lat, longitude: card.place.lng } } : {}) };
    case 'article':
      return { ...base, '@type': 'Article', headline: clean(card.title), publisher, ...(card.link?.url ? { sameAs: card.link.url } : {}) };
    default:
      return { ...base, '@type': 'CreativeWork', publisher };
  }
}

/**
 * cardSeo — toutes les métadonnées SEO/GEO d'une card, prêtes pour generateMetadata (SSR).
 * @param opts.baseUrl  domaine public (défaut talk2me.fr)
 * @param opts.path     chemin public de la page-entité (défaut /card/{id})
 */
export function cardSeo(card: SuperCard, opts?: { baseUrl?: string; path?: string }): CardSeo {
  const base = (opts?.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  const path = opts?.path || `/card/${card.id}`;
  const canonical = base + (path.startsWith('/') ? path : '/' + path);
  const kind = primaryType(card);
  const title = buildTitle(card, kind);
  const description = buildDescription(card, kind);
  const keywords = buildKeywords(card);
  const images = (card.images || []).filter(Boolean).slice(0, 4);
  const ogType = kind === 'music' ? 'music.song' : kind === 'product' || kind === 'annonce' ? 'product' : kind === 'article' ? 'article' : 'website';
  return {
    title,
    description,
    canonical,
    keywords,
    openGraph: { title, description, url: canonical, type: ogType, siteName: SITE, images },
    twitter: { card: images.length ? 'summary_large_image' : 'summary', title, description, images },
    jsonLd: buildJsonLd(card, kind, canonical, description),
  };
}
