/**
 * lib/cards/adapt — ADAPTATEURS « existant → SuperCard » (Card OS, Pascal 2026-06-30).
 * Permet d'exposer ce qui existe déjà (UnifiedCard de l'embed-hub, etc.) SOUS forme de
 * SuperCard SANS rien migrer — c'est la façade Card (même principe que la façade db.ts).
 * Pur (browser-safe). On enrichira avec fromDirectCard/fromProduct/fromAnnonce ensuite.
 */
import type { UnifiedCard, UnifiedAction } from '@/lib/embed-hub/types';
import type { StoreProduct } from '@/lib/db';
import { makeCard, type SuperCard, type CardType, type CardAction } from '@/lib/cards/supercard';
import type { PlaceCardData, RecipeCardData, YouTubeCardData } from '@/lib/chat-types';

function mapType(t: UnifiedCard['type']): CardType {
  if (t === 'discussion') return 'social_post';
  return t as CardType; // les autres valeurs coïncident avec CardType
}

function mapAction(a: UnifiedAction): CardAction | null {
  switch (a.kind) {
    case 'open': return { kind: 'open', label: a.label, url: a.url };
    case 'book': return { kind: 'reserve', label: a.label, url: a.url };
    case 'directions': return { kind: 'route', label: a.label };
    case 'save': return { kind: 'save', label: a.label };
    case 'share': return { kind: 'share', label: a.label };
    case 'custom': return { kind: 'open', label: a.label, url: a.href };
    default: return null; // 'comment' n'a pas d'équivalent direct
  }
}

function parsePrice(label: string | null): { amount?: number; currency?: string } | undefined {
  if (!label) return undefined;
  const m = label.replace(/\s/g, '').replace(',', '.').match(/([\d.]+)/);
  const amount = m ? parseFloat(m[1]) : undefined;
  if (amount == null || isNaN(amount)) return undefined;
  const currency = /€|eur/i.test(label) ? 'EUR' : /\$/.test(label) ? 'USD' : 'EUR';
  return { amount, currency };
}

/** Item d'annonce tel que renvoyé par /api/annonces (DepItem). */
export interface AnnonceItem {
  id: string;
  media_url: string | null;
  title: string;
  category: string;
  price_label: string | null;
  description: string | null;
  city: string | null;
  rental?: boolean;
  driver_option?: string | null;
  photos?: string[] | null;
  attributes?: Record<string, string> | null;
  quantity?: number | null;
  deposit_cents?: number | null;
}

/**
 * Convertit une ANNONCE en SuperCard — chaque champ du formulaire va dans SON rayon.
 * channel='annonce' (le switch) ; les spécificités (attributs, location, chauffeur)
 * vont dans le rayon UNIVERSEL `specs`. Aucun champ dédié par type.
 */
export function fromAnnonceItem(it: AnnonceItem): SuperCard {
  const price = parsePrice(it.price_label);
  const specs: Record<string, string> = { ...(it.attributes || {}) };
  if (it.rental) specs['Location'] = 'oui';
  if (it.driver_option) specs['Chauffeur'] = it.driver_option;
  const images = (it.photos && it.photos.length ? it.photos : it.media_url ? [it.media_url] : []).filter(Boolean) as string[];
  return makeCard({
    id: it.id,
    types: ['listing'],
    channel: 'annonce',
    title: it.title,
    ...(images.length ? { images } : {}),
    ...(it.description ? { text: { body: it.description } } : {}),
    ...(price ? { price } : {}),
    ...(it.city ? { place: { address: it.city } } : {}),
    categories: [it.category],
    ...(Object.keys(specs).length ? { specs } : {}),
    ...(it.deposit_cents != null ? { deposit: { amount: it.deposit_cents / 100, currency: price?.currency || 'EUR' } } : {}),
    ...(it.quantity != null ? { stock: it.quantity } : {}),
    actions: [
      { kind: 'contact', label: 'Contacter' },
      { kind: 'save', label: 'Enregistrer' },
    ],
  });
}

/** Convertit un produit de la Boutique (vraie base) en SuperCard. */
export function fromStoreProduct(p: StoreProduct): SuperCard {
  return makeCard({
    id: p.id,
    title: p.title,
    types: ['product'],
    channel: 'boutique',
    images: p.image ? [p.image] : undefined,
    price: parsePrice(p.price_label),
    categories: p.category ? [p.category] : undefined,
    actions: [{ kind: 'buy', label: 'Acheter' }, { kind: 'share', label: 'Partager' }],
    source: { name: 't2m', label: 'Boutique' },
  });
}

/** Convertit une image-card du feed (table direct_cards) en SuperCard.
 *  Si un PRODUIT est attaché (partagé depuis le Shop), on ajoute la facette produit
 *  (prix LIVE via AliExpress + action Acheter) → la MÊME card Shop vit dans le feed. */
export function fromFeedImageCard(item: {
  id: string; media_url: string | null; caption: string | null; text: string | null; attached_product_json?: string | null;
}): SuperCard {
  const body = (item.text || item.caption || '').trim();

  let prod: { title?: string; image_url?: string | null; price_label?: string | null; currency?: string | null } | null = null;
  if (item.attached_product_json) {
    try { prod = JSON.parse(item.attached_product_json); } catch { prod = null; }
  }

  if (prod) {
    const parsed = parsePrice(prod.price_label || null);
    return makeCard({
      id: item.id,
      title: prod.title || '',
      types: ['image', 'social_post', 'product'],
      images: item.media_url ? [item.media_url] : prod.image_url ? [prod.image_url] : undefined,
      text: body ? { body } : undefined,
      // prix LIVE résolu chez le fournisseur (le fichier ne fige pas le prix mort)
      price: { live: true, currency: parsed?.currency || prod.currency || 'EUR', ...(parsed?.amount != null ? { amount: parsed.amount } : {}) },
      api: { provider: 'aliexpress', ref: (prod.title || '').slice(0, 60) },
      actions: [{ kind: 'buy', label: 'Acheter' }],
    });
  }

  return makeCard({
    id: item.id,
    title: '',
    types: ['image', 'social_post'],
    images: item.media_url ? [item.media_url] : undefined,
    text: body ? { body } : undefined,
  });
}

/** Convertit un POST du feed (conversation aplatie OU direct-card) en SuperCard.
 *  « Perce le papier pour tous les posts » (Pascal 2026-07-02) : QUE des perforations —
 *  média = lien, texte = caption, author = source. La barre sociale (♥/💬/↗) reste au
 *  LECTEUR (le feed), jamais dans le papier. Grounding : pas de média → images:[]. */
export function fromPost(p: {
  id: string; kind?: string; caption?: string | null; text?: string | null; media_url?: string | null;
  author?: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
}): SuperCard {
  const body = (p.caption || p.text || '').trim();
  const media = p.media_url || '';
  const isVideo = p.kind === 'video_card' || /\.(mp4|webm|mov)(\?|$)/i.test(media);
  const name = p.author?.display_name || p.author?.username || 'Utilisateur';
  const primary: CardType = isVideo ? 'video' : media ? 'image' : 'social_post';
  return makeCard({
    id: p.id,
    title: '', // le texte vit dans text.body ; pas de titre pour ne pas doubler
    types: primary === 'social_post' ? ['social_post'] : [primary, 'social_post'],
    images: !isVideo && media ? [media] : undefined,
    video: isVideo && media ? { url: media, aspect: '9 / 16' } : undefined,
    text: body ? { body } : undefined,
    source: { name, label: name, icon: p.author?.avatar_url || undefined },
  });
}

// ─── Cards de LÉA (conversation) → SuperCard (Gemini directeur, 2026-07-02) ───
// Doctrine « la conversation fabrique l'univers » : les Éclats de Léa SONT des
// SuperCards dès l'origine → « Garder » envoie LE MÊME .card au Hub (zéro conversion).

/** Un LIEU proposé par Léa → SuperCard. */
export function fromPlace(p: PlaceCardData): SuperCard {
  const isResto = /restau|resto|food|cafe|café|bar/i.test(p.category || '') || !!p.cuisine;
  const dist = Number.isFinite(p.distance_m) ? `${Math.round(p.distance_m)} m` : undefined;
  return makeCard({
    id: `place:${p.name}:${Math.round(p.distance_m || 0)}`,
    title: p.name,
    types: isResto ? ['restaurant', 'place'] : ['place'],
    place: { address: p.address || undefined },
    text: p.cuisine ? { body: p.cuisine } : undefined,
    specs: { ...(p.category ? { Catégorie: p.category } : {}), ...(dist ? { Distance: dist } : {}) },
    source: { name: p.category || 'Lieu', label: p.category || 'Lieu' },
    actions: [{ kind: 'route', label: 'Itinéraire', url: p.directions_url || p.google_maps_url || p.maps_url }],
  });
}

/** Une RECETTE proposée par Léa → SuperCard. */
export function fromRecipe(r: RecipeCardData): SuperCard {
  return makeCard({
    id: `recipe:${r.source_url}`,
    title: r.name,
    types: ['recipe'],
    images: r.image ? [r.image] : undefined,
    text: r.description ? { body: r.description } : undefined,
    specs: { ...(r.prep_time ? { Temps: r.prep_time } : {}), ...(r.servings ? { Portions: r.servings } : {}), ...(r.difficulty ? { Difficulté: r.difficulty } : {}) },
    source: { name: r.source, label: r.source },
    link: { url: r.source_url, reader: 'preview' },
    actions: [{ kind: 'open', label: 'Voir la recette', url: r.source_url }],
  });
}

/** Une VIDÉO YouTube proposée par Léa → SuperCard (embed = lien qui streame). */
export function fromYouTube(y: YouTubeCardData): SuperCard {
  return makeCard({
    id: `yt:${y.video_id}`,
    title: y.title,
    types: y.is_music ? ['audio', 'video'] : ['video'],
    video: { embed: `https://www.youtube.com/embed/${y.video_id}`, aspect: '16 / 9' },
    images: y.thumbnail ? [y.thumbnail] : undefined,
    text: y.description ? { body: y.description } : undefined,
    source: { name: y.channel, label: y.channel },
    link: { url: `https://www.youtube.com/watch?v=${y.video_id}`, reader: 'embed' },
    actions: [{ kind: 'open', label: 'Regarder', url: `https://www.youtube.com/watch?v=${y.video_id}` }],
  });
}

/** Convertit une UnifiedCard (embed-hub) en SuperCard universelle. */
export function fromUnifiedCard(u: UnifiedCard, id?: string): SuperCard {
  const video =
    u.embed && (u.embed.kind === 'iframe' || u.embed.kind === 'video')
      ? { embed: u.embed.src, aspect: u.embed.aspect_ratio }
      : undefined;
  const images: string[] = [];
  if (u.embed?.kind === 'image' && (u.embed.image_url || u.embed.src)) images.push((u.embed.image_url || u.embed.src) as string);
  if (u.thumbnail_url) images.push(u.thumbnail_url);

  return makeCard({
    id,
    title: u.title,
    types: [mapType(u.type)],
    text: u.description ? { body: u.description } : undefined,
    images: images.length ? images : undefined,
    video,
    audio: u.embed?.kind === 'audio' ? { embed: u.embed.src } : undefined,
    link: u.external_url ? { url: u.external_url, reader: 'preview' } : undefined,
    source: { name: u.source, label: u.source_label, icon: u.source_icon_url },
    actions: (u.actions || []).map(mapAction).filter(Boolean) as CardAction[],
  });
}
