/**
 * lib/cards/v2/convert — CONVERTISSEUR spec:1 → spec:2 (le garant de la DOUBLE LECTURE, G2).
 *
 * Refonte SuperCard (étape 6, Phase A). Normalise une carte de l'ANCIENNE forme
 * (`lib/cards/supercard.ts`, spec:1) vers le SCHÉMA CANONIQUE (spec:2). Appliqué à la LECTURE
 * pendant la migration : une surface migrée lit du spec:2, qu'il vienne d'une carte déjà
 * canonique OU d'une carte legacy convertie à la volée. Rien n'est réécrit sur disque ici.
 *
 * Dé-duplications actées (étape 3) appliquées ici :
 *   • `vehicle.rental` / `property.rental` / `property.transaction` → `offer.type` (fin du flag dupliqué)
 *   • `pub.banner|jingle|video` → `media[]` (rôles banner/jingle/spot)
 *   • `shopRef` (+ hack `[VITRINE:id]`) → `links[{rel:'storefront'}]`
 *   • `price.currency` (Ar|EUR|MGA) → `MGA` unique (le CODE ; le montant, toujours en ariary, est conservé)
 *   • `images` + `video` + `audio` + `videos` → `media[]` unifié
 *   • `keywords`/`hashtags`/`mentions` → `discovery{}`
 *
 * Entrée typée `any` volontairement (la carte legacy est faiblement typée) — pur, browser-safe.
 */
import type {
  SuperCardV2, MediaElement, ItemElement, CardStatus, CardVisibility, OfferType, ActionKind,
} from './types';
import { MAX_COMPOSITION_DEPTH } from './registry';
import { validateCard, type ValidationResult } from './validate';

type V1 = Record<string, any>;

/** Convertit une carte legacy (spec:1) en SuperCard canonique (spec:2). */
export function convertV1toV2(v1: V1, opts?: { now?: number; depth?: number; ancestors?: object[] }): SuperCardV2 {
  const now = opts?.now ?? nowMs();
  const depth = opts?.depth ?? 0;
  const ancestors = opts?.ancestors ?? []; // objets legacy du CHEMIN courant (détection de cycle par chemin, pas dédup)
  const types: string[] = Array.isArray(v1?.types) ? v1.types : [];
  const channel: string | undefined = v1?.channel;
  const hasItems = Array.isArray(v1?.items) && v1.items.length > 0;

  const kind = deriveKind(types, channel, hasItems);
  const facets = deriveFacets(types, kind);
  if (v1?.vehicle && !facets.includes('vehicle')) facets.push('vehicle'); // la découverte porte la facette du bloc
  if (v1?.property && !facets.includes('property')) facets.push('property');
  const status = mapStatus(v1?.state);
  const created = toDate(v1?.createdAt) ?? now;
  const updated = toDate(v1?.updatedAt) ?? created;

  const media = collectMedia(v1);
  media.push(...collectMediaPub(v1?.pub)); // dé-duplication : créas pub (banner/jingle/spot) → media
  const offer = deriveOffer(v1, kind);
  const links = deriveLinks(v1);

  const card: SuperCardV2 = {
    format: 't2m.card',
    spec: 2,
    id: String(v1?.id ?? ''),
    kind,
    owner: String(v1?.owner || 'system'),
    status,
    visibility: mapVisibility(v1?.visibility),
    created_at: created,
    updated_at: updated,
  };

  if (facets.length) card.facets = facets;
  if (status === 'published') card.published_at = created; // approximation de migration (pas d'historique de status)
  const gov = deriveGovernance(v1);
  if (gov) card.governance = gov;

  // Contenu
  if (typeof v1?.title === 'string' && v1.title) card.title = v1.title;
  if (v1?.text?.body) card.text = { body: String(v1.text.body) };
  if (media.length) card.media = media;
  const price = mapPrice(v1?.price);
  if (price) card.price = price;
  if (offer) card.offer = offer;
  const place = mapPlace(v1?.place);
  if (place) card.place = place;
  if (Array.isArray(v1?.categories) && v1.categories.length) card.categories = v1.categories.map(String);
  const specs = mapSpecs(v1?.specs);
  if (specs) card.specs = specs;
  if (Number.isInteger(v1?.stock)) card.stock = v1.stock;
  const discovery = mapDiscovery(v1);
  if (discovery) card.discovery = discovery;
  const actions = mapActions(v1?.actions);
  if (actions.length) card.actions = actions;
  if (v1?.rating && (v1.rating.score != null || v1.rating.count != null)) card.rating = { score: num(v1.rating.score), count: num(v1.rating.count) };
  if (v1?.link?.url) card.link = { url: String(v1.link.url), reader: v1.link.reader };
  const deposit = mapPrice(v1?.deposit);
  if (deposit) card.deposit = deposit;
  if (v1?.source && (v1.source.name || v1.source.label)) card.source = { name: v1.source.name, label: v1.source.label, icon: v1.source.icon };

  // Blocs métier typés (dé-dupliqués — rental/transaction sortis vers offer)
  const vehicle = mapVehicle(v1?.vehicle); if (vehicle) card.vehicle = vehicle;
  const property = mapProperty(v1?.property); if (property) card.property = property;
  if (v1?.music) card.music = v1.music;
  const pub = mapPub(v1?.pub); if (pub) card.pub = pub;

  // Composition
  const items = mapItems(v1, now, depth, ancestors);
  if (items.length) card.items = items;
  if (links.length) card.links = links;
  const providerRef = mapProviderRef(v1);
  if (providerRef) card.provider_ref = providerRef;

  return card;
}

/**
 * Convertit ET valide (le convertisseur ne doit pas être une porte dérobée : sa sortie passe le
 * rempart). À utiliser en LECTURE double : si `validation.ok` est faux, la carte legacy ne respecte
 * pas la doctrine (ex. devise étrangère non convertie) → l'appelant décide (ignorer / journaliser).
 */
export function convertAndValidate(v1: V1, opts?: { now?: number }): { card: SuperCardV2; validation: ValidationResult } {
  const card = convertV1toV2(v1, opts);
  return { card, validation: validateCard(card) };
}

// ── Helpers ──
function nowMs(): number { return typeof Date !== 'undefined' ? Date.now() : 0; }
function num(v: any): number | undefined { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function toDate(v: any): number | undefined { if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return Date.parse(v); return undefined; }

function deriveKind(types: string[], channel: string | undefined, hasItems: boolean): string {
  if (types.includes('album')) return 'album';
  if (types.includes('film')) return 'film';
  if (types.includes('pub')) return 'pub';
  if (types.includes('room')) return 'room';
  if (channel === 'ad') return 'pub';
  if (channel === 'eat') return 'restaurant';
  if (channel === 'annonce') return 'listing';
  if (channel === 'boutique') return hasItems ? 'boutique' : 'product';
  const order = ['video', 'audio', 'image', 'article', 'restaurant', 'place', 'product', 'listing', 'event', 'job', 'recipe', 'profile', 'link'];
  for (const t of order) if (types.includes(t)) return t === 'article' ? 'article' : t;
  if (types.includes('social_post')) return 'post';
  return 'post';
}

function deriveFacets(types: string[], kind: string): string[] {
  const allowed = new Set(['social_post', 'product', 'place', 'audio', 'video', 'image']);
  return types.filter((t) => t !== kind && allowed.has(t));
}

function mapStatus(state: any): CardStatus {
  if (state == null) return 'published';                 // défaut legacy (makeCard posait 'published')
  const known = ['draft', 'scheduled', 'published', 'archived', 'suspended', 'deleted'];
  if (known.includes(state)) return state;
  return 'draft';                                        // état inconnu/masquant → JAMAIS public par défaut
}

function mapVisibility(v: any): CardVisibility {
  if (v === 'private') return 'private';
  if (v === 'friends') return 'restricted';
  if (v === 'public') return 'public';
  if (v === 'unlisted' || v === 'restricted') return v;
  if (v == null) return 'public';                        // défaut legacy (feed public)
  return 'private';                                      // valeur inconnue → RESTRICTIVE, jamais publique
}

function deriveGovernance(v1: V1): SuperCardV2['governance'] | undefined {
  const g: any = {};
  if (v1?.entityKey) g.entityKey = v1.entityKey;
  if (v1?.signature) g.signature = v1.signature;
  if (v1?.affiliation?.ownerCut != null) g.affiliation = { ownerCut: v1.affiliation.ownerCut };
  return Object.keys(g).length ? g : undefined;
}

function aspectToOrientation(aspect: any): 'h' | 'v' | 'square' | undefined {
  if (typeof aspect !== 'string') return undefined;
  const m = aspect.split(/[:x/]/).map(Number);
  if (m.length === 2 && m[0] && m[1]) { if (m[0] > m[1]) return 'h'; if (m[0] < m[1]) return 'v'; return 'square'; }
  return undefined;
}

/** images + video + videos + audio → media[] unifié, avec rôles. */
function collectMedia(v1: V1): MediaElement[] {
  const out: MediaElement[] = [];
  const images: string[] = Array.isArray(v1?.images) ? v1.images : [];
  images.forEach((url, i) => { if (url) out.push({ url: String(url), type: 'image', ...(i === 0 ? { role: 'cover' as const } : {}) }); });

  const vid = v1?.video;
  if (vid) {
    const orientation = aspectToOrientation(vid.aspect);
    if (vid.trailer) out.push({ url: String(vid.trailer), type: 'video', role: 'trailer', ...(orientation ? { orientation } : {}) });
    if (vid.full) out.push({ url: String(vid.full), type: 'video', role: 'full', ...(orientation ? { orientation } : {}) });
    if (vid.url && vid.url !== vid.trailer && vid.url !== vid.full) out.push({ url: String(vid.url), type: 'video', ...(orientation ? { orientation } : {}) });
    if (vid.embed) out.push({ url: String(vid.embed), type: 'video', meta: { external_url: String(vid.embed) } });
  }
  if (Array.isArray(v1?.videos)) v1.videos.forEach((u: any) => { if (u && (!vid || u !== vid.url)) out.push({ url: String(u), type: 'video' }); });

  const au = v1?.audio;
  if (au) {
    const meta: any = {};
    if (au.title) meta.title = au.title; if (au.thumbnail) meta.thumbnail = au.thumbnail;
    if (au.author) meta.author = au.author; if (au.external_url) meta.external_url = au.external_url;
    if (au.track_id != null) meta.track_id = String(au.track_id);
    if (au.embed) out.push({ url: String(au.embed), type: 'audio', ...(Object.keys(meta).length ? { meta } : {}) });
    if (au.url) out.push({ url: String(au.url), type: 'audio', role: 'track', ...(Object.keys(meta).length ? { meta } : {}) });
    if (Array.isArray(au.tracks)) au.tracks.forEach((t: any) => { if (t?.url) out.push({ url: String(t.url), type: 'audio', role: 'track', meta: { title: t.title, author: t.artist, duration: num(t.duration) } }); });
  }
  return out;
}

// Kinds marchands : seuls eux peuvent porter une offre de « vente » (pas d'invention pour un film/post payant).
const MERCHANT_KINDS = new Set(['product', 'boutique', 'listing', 'restaurant']);
/** rental / transaction / gratuit → offer.type universel (dé-duplication). */
function deriveOffer(v1: V1, kind: string): { type: OfferType } | undefined {
  const rental = v1?.vehicle?.rental === true || v1?.property?.rental === true;
  const trans = String(v1?.property?.transaction || '').toLowerCase();
  if (rental || trans.includes('location') || trans.includes('rent')) return { type: 'rent' };
  if (!MERCHANT_KINDS.has(kind)) return undefined;       // un film/post/formation payant n'est PAS « en vente »
  const p = v1?.price?.amount;
  if (typeof p === 'number' && p === 0) return { type: 'free' };
  if (typeof p === 'number' && p > 0) return { type: 'sale' };
  return undefined;
}

function mapPrice(p: any): { amount: number; currency: string } | undefined {
  if (!p || typeof p.amount !== 'number') return undefined;
  const cur = p.currency;
  // P3 (INTRANSIGEANT) : Ar/MGA/absente = MÊME devise → on normalise juste le CODE en MGA.
  // Une devise ÉTRANGÈRE (EUR, USD…) n'est JAMAIS relabelisée sans conversion (ce serait fausser le
  // montant) : on la CONSERVE telle quelle → le validateur la REJETTE et force un traitement humain.
  const currency = (cur === 'Ar' || cur === 'MGA' || cur == null || cur === '') ? 'MGA' : String(cur);
  return { amount: Math.round(p.amount), currency };
}

function mapPlace(p: any): SuperCardV2['place'] | undefined {
  if (!p) return undefined;
  const out: any = {};
  if (typeof p.lat === 'number') out.lat = p.lat;
  if (typeof p.lng === 'number') out.lng = p.lng;
  if (p.address) out.address = String(p.address);
  if (p.city) out.city = String(p.city);                 // ne pas perdre la ville (SEO géo)
  return Object.keys(out).length ? out : undefined;
}

function mapSpecs(s: any): Record<string, string | number | boolean> | undefined {
  if (!s || typeof s !== 'object') return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(s)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v as any;
  return Object.keys(out).length ? out : undefined;
}

function mapDiscovery(v1: V1): SuperCardV2['discovery'] | undefined {
  const d: any = {};
  if (Array.isArray(v1?.hashtags) && v1.hashtags.length) d.hashtags = v1.hashtags.map(String);
  if (Array.isArray(v1?.keywords) && v1.keywords.length) d.keywords = v1.keywords.map(String);
  if (Array.isArray(v1?.mentions) && v1.mentions.length) d.mentions = v1.mentions.map(String);
  return Object.keys(d).length ? d : undefined;
}

const V2_ACTIONS = new Set<ActionKind>(['open', 'buy', 'order', 'reserve', 'book', 'unlock', 'contact', 'apply', 'tip', 'pay', 'save', 'share', 'follow', 'route']);
function mapActions(actions: any): SuperCardV2['actions'] & any[] {
  if (!Array.isArray(actions)) return [] as any;
  return actions
    .filter((a: any) => a && V2_ACTIONS.has(a.kind) && typeof a.label === 'string')
    .map((a: any, i: number) => {
      const out: any = { kind: a.kind as ActionKind, label: a.label, priority: (i === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary' };
      const target = a.target ?? a.url;                  // ne pas perdre la CIBLE (legacy portait l'URL dans `url`)
      if (typeof target === 'string' && target) out.target = target;
      return out;
    });
}

function mapVehicle(v: any): SuperCardV2['vehicle'] | undefined {
  if (!v) return undefined;
  const out: any = {};
  if (v.type) out.body_type = v.type; if (v.marque) out.make = v.marque; if (v.modele) out.model = v.modele;
  if (v.annee != null) out.year = num(v.annee);
  if (v.km != null) out.mileage = { value: num(v.km) ?? 0, unit: 'km' };
  if (v.carburant) out.fuel = v.carburant; if (v.boite) out.transmission = v.boite;
  if (v.places != null) out.seats = num(v.places); if (v.etat) out.condition = v.etat;
  if (v.driver_option) out.driver_option = v.driver_option;
  // NB : v.rental est VOLONTAIREMENT ignoré ici → il est passé à offer.type (dé-duplication).
  return Object.keys(out).length ? out : undefined;
}

function mapProperty(p: any): SuperCardV2['property'] | undefined {
  if (!p) return undefined;
  const out: any = {};
  if (p.type) out.property_type = p.type;
  if (p.surface != null) out.surface = { value: num(p.surface) ?? 0, unit: 'm2' };
  if (p.pieces != null) out.rooms = num(p.pieces); if (p.chambres != null) out.bedrooms = num(p.chambres);
  if (p.etage != null) out.floor = num(p.etage);
  if (p.meuble != null) out.furnished = p.meuble === true || p.meuble === 'oui';
  // p.transaction / p.rental → offer.type (dé-duplication).
  return Object.keys(out).length ? out : undefined;
}

function mapPub(p: any): SuperCardV2['pub'] | undefined {
  if (!p) return undefined;
  const out: any = {};
  if (p.format) out.format = p.format;
  if (typeof p.budget === 'number') out.budget = { amount: Math.round(p.budget), currency: 'MGA' };
  if (p.target) out.target = { scope: p.target.scope, zone: p.target.zone };
  // p.banner/jingle/video → media[] (collectMediaPub), pas ici.
  return Object.keys(out).length ? out : undefined;
}

/** shopRef → links[storefront] (fin du hack [VITRINE:id]). */
function deriveLinks(v1: V1): SuperCardV2['links'] & any[] {
  const out: any[] = [];
  if (v1?.shopRef?.id) out.push({ rel: 'storefront', target_id: String(v1.shopRef.id), preview: { title: v1.shopRef.name, cover: v1.shopRef.cover } });
  return out;
}

function mapProviderRef(v1: V1): SuperCardV2['provider_ref'] | undefined {
  const a = v1?.api;
  if (a?.provider) return { provider: String(a.provider), endpoint: a.endpoint, ref: a.ref };
  return undefined;
}

/** items[] (cards embarquées spec:1) → ItemElement[] (carrier card inline) ; slides[] → primitives. */
function mapItems(v1: V1, now: number, depth: number, ancestors: object[]): ItemElement[] {
  const out: ItemElement[] = [];
  // NB : les créas pub (banner/jingle/spot) sont des MÉDIAS, pas des items — traité en amont.
  if (Array.isArray(v1?.items) && depth + 1 <= MAX_COMPOSITION_DEPTH) { // garde profondeur + anti-cycle (DoS import)
    const path = ancestors.concat(v1);                    // chemin courant (ancêtres + ce parent)
    v1.items.forEach((child: any, i: number) => {
      if (!child || typeof child !== 'object' || path.includes(child)) return; // CYCLE par chemin (pas dédup)
      const childKind = deriveKind(Array.isArray(child?.types) ? child.types : [], child?.channel, Array.isArray(child?.items) && child.items.length > 0);
      out.push({ role: roleForChildKind(childKind), order: i, carrier: 'card', mode: 'inline', card: convertV1toV2(child, { now, depth: depth + 1, ancestors: path }) });
    });
  }
  if (Array.isArray(v1?.slides)) {
    v1.slides.forEach((s: any, i: number) => {
      out.push({ role: 'slide', order: (v1?.items?.length || 0) + i, carrier: 'primitive', primitive_type: 'section', content: { heading: s.heading, points: s.points, image: s.image } });
    });
  }
  return out;
}

function roleForChildKind(kind: string): ItemElement['role'] {
  if (kind === 'audio') return 'track';
  if (kind === 'product') return 'product';
  if (kind === 'restaurant') return 'dish';
  if (kind === 'listing') return 'listing';
  return 'item';
}

/** pub.banner/jingle/video → média avec rôles (dé-duplication). Fusionné dans collectMedia si besoin. */
function collectMediaPub(pub: any): MediaElement[] {
  const out: MediaElement[] = [];
  if (!pub) return out;
  if (pub.banner) out.push({ url: String(pub.banner), type: 'image', role: 'banner' });
  if (pub.jingle) out.push({ url: String(pub.jingle), type: 'audio', role: 'jingle' });
  if (pub.video) out.push({ url: String(pub.video), type: 'video', role: 'spot' });
  return out;
}
