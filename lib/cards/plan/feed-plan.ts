/**
 * lib/cards/plan/feed-plan — LE PLAN de rendu d'une carte de feed (Pascal 2026-07-22).
 *
 * « Un seul cerveau, plusieurs peintres » : le serveur calcule CE plan (déclaratif, SANS pixels)
 * à partir du `.card` (contenu) + du post (enveloppe : auteur, stats). Web ET natif le reçoivent et
 * le PEIGNENT avec leurs widgets natifs → même disposition partout, fluidité native gardée.
 *
 * Le natif est la RÉFÉRENCE visuelle ; ce plan porte exactement ses blocs, dans l'ordre :
 *   header(author) · media · title · body(description) · socialBar(stats) · actions(prix/achat).
 */

export type PlanBlockKind = 'header' | 'media' | 'title' | 'body' | 'social' | 'actions';

export interface PlanMedia {
  type: 'video' | 'image' | 'audio';
  url: string;
  aspect?: string;                       // ex "9 / 16"
  poster?: string;                       // vignette (images[0])
  trailer?: string;                      // aperçu jouable gratuit (film)
  full?: string;                         // média complet (débloqué à l'achat)
  tracks?: { title: string; url: string; duration?: string }[]; // album
}

export interface PlanAction {
  kind: string;                          // buy | contact | follow …
  label: string;
  priority: 'primary' | 'secondary';
}

export interface FeedCardPlan {
  id: string;
  kind: string;                          // film | album | image | texte | annonce …
  layout: string;                        // archétype de peinture (film|album|video|photo|album…)
  /** L'ordre EXACT des blocs à peindre (le natif est la référence). */
  blocks: PlanBlockKind[];
  envelope: {
    author: { name: string; avatar?: string | null };
    postedAt?: number;
    stats: { likes: number; comments: number; shares: number };
    isOwner: boolean;
  };
  content: {
    title?: string;
    body?: string;                       // la description (bloc texte)
    media: PlanMedia[];
    priceDisplay?: string;               // chaîne d'affichage — JAMAIS un montant à débiter
    actions: PlanAction[];
    badge?: string;                      // FILM / ALBUM …
    shopId?: string;                     // vitrine boutique : id du shop → rendu BoutiquePlan (devanture)
  };
}

// ── helpers purs ───────────────────────────────────────────────────────────

const str = (v: unknown, max = 4000): string | undefined =>
  (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** MGA entier → « 20 000 Ar » (chaîne d'affichage seule). */
function priceDisplay(price: unknown): string | undefined {
  if (!price || typeof price !== 'object') return undefined;
  const p = price as { amount?: unknown; currency?: unknown };
  const amount = typeof p.amount === 'number' ? p.amount : (typeof p.amount === 'string' ? parseInt(p.amount, 10) : NaN);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const cur = typeof p.currency === 'string' ? p.currency : 'Ar';
  return `${Math.round(amount).toLocaleString('fr-FR').replace(/ | /g, ' ')} ${cur}`;
}

/** Archétype de peinture, dérivé UNE fois du `.card` (types spec:1). */
function layoutOf(types: string[], hasVideo: boolean, hasAudio: boolean): string {
  if (types.includes('film') || (types.includes('video') && types.includes('product'))) return 'film';
  if (types.includes('album')) return 'album';
  if (hasVideo || types.includes('video')) return 'video';
  if (hasAudio || types.includes('audio')) return 'audio';
  if (types.includes('image')) return 'photo';
  return 'texte';
}

function badgeOf(layout: string): string | undefined {
  switch (layout) {
    case 'film': return 'FILM';
    case 'album': return 'ALBUM';
    default: return undefined;
  }
}

function mediaOf(card: Record<string, unknown>): PlanMedia[] {
  const images = Array.isArray(card.images) ? (card.images as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const video = card.video && typeof card.video === 'object' ? card.video as Record<string, unknown> : null;
  const audio = card.audio && typeof card.audio === 'object' ? card.audio as Record<string, unknown> : null;
  if (video) {
    const url = str(video.url) || str(video.trailer) || str(video.full);
    if (url) return [{
      type: 'video', url,
      aspect: str(video.aspect) || '9 / 16',
      poster: images[0],
      trailer: str(video.trailer),
      full: str(video.full),
    }];
  }
  if (audio) {
    const rawTracks = Array.isArray(audio.tracks) ? audio.tracks as Record<string, unknown>[] : [];
    const tracks = rawTracks.map((t) => ({ title: str(t.title) || 'Piste', url: str(t.url) || '', duration: str(t.duration, 12) }))
      .filter((t) => t.url);
    return [{ type: 'audio', url: str(audio.url) || tracks[0]?.url || '', poster: images[0], tracks }];
  }
  if (images.length) return images.map((url) => ({ type: 'image' as const, url }));
  return [];
}

function actionsOf(card: Record<string, unknown>): PlanAction[] {
  const raw = Array.isArray(card.actions) ? card.actions as Record<string, unknown>[] : [];
  return raw.map((a) => ({
    kind: str(a.kind) || 'action',
    label: str(a.label, 40) || 'Ouvrir',
    priority: (a.priority === 'secondary' ? 'secondary' : 'primary') as 'primary' | 'secondary',
  })).slice(0, 4);
}

// ── entrée : enveloppe (post) + contenu (.card) → PLAN ───────────────────────

export interface FeedEnvelopeInput {
  id: string;
  author?: { name?: string | null; display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
  postedAt?: number;
  likes?: number;
  comment_count?: number;
  share_count?: number;
  isOwner?: boolean;
  caption?: string | null;               // repli description si le .card n'a pas de text.body
}

/**
 * Construit le PLAN à partir du post (enveloppe) + du `.card` parsé (contenu).
 * `card` = objet spec:1 (card_data) ; peut être null (post nu) → on peint depuis l'enveloppe seule.
 */
export function buildFeedCardPlan(env: FeedEnvelopeInput, card: Record<string, unknown> | null): FeedCardPlan {
  const types = card && Array.isArray(card.types) ? (card.types as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const media = card ? mediaOf(card) : [];
  const hasVideo = media.some((m) => m.type === 'video');
  const hasAudio = media.some((m) => m.type === 'audio');
  const rawBody = (card && card.text && typeof card.text === 'object' ? str((card.text as Record<string, unknown>).body) : undefined)
    || str(env.caption);
  // Vitrine boutique : la carte image porte "<nom du magasin> [VITRINE:<shopId>]" dans text.body.
  const vitrine = rawBody ? rawBody.match(/\[VITRINE:([^\]]+)\]/) : null;
  const shopId = vitrine ? vitrine[1] : undefined;
  const cleanBody = rawBody ? (rawBody.replace(/\s*\[VITRINE:[^\]]+\]/g, '').trim() || undefined) : undefined;
  const layout = shopId ? 'boutique' : layoutOf(types, hasVideo, hasAudio);

  const cardTitle = card ? str(card.title, 200) : undefined;
  const title = shopId ? (cardTitle || cleanBody) : cardTitle;   // boutique : le nom = titre
  const body = shopId ? undefined : cleanBody;                    // marqueur [VITRINE:] jamais affiché brut
  const actions = card ? actionsOf(card) : [];
  const price = card ? priceDisplay(card.price) : undefined;

  // Ordre des blocs = référence native. On n'inclut que les blocs qui ont du contenu.
  const blocks: PlanBlockKind[] = ['header'];
  if (media.length) blocks.push('media');
  if (title) blocks.push('title');
  if (body) blocks.push('body');
  blocks.push('social');
  if (actions.length || price) blocks.push('actions');

  const a = env.author || {};
  const name = str(a.display_name || undefined) || str(a.name || undefined) || str(a.username || undefined) || 'Anonyme';

  return {
    id: env.id,
    kind: types[0] || layout,
    layout,
    blocks,
    envelope: {
      author: { name, avatar: a.avatar_url ?? null },
      postedAt: env.postedAt,
      stats: { likes: env.likes ?? 0, comments: env.comment_count ?? 0, shares: env.share_count ?? 0 },
      isOwner: !!env.isOwner,
    },
    content: { title, body, media, priceDisplay: price, actions, badge: badgeOf(layout), shopId },
  };
}
