/**
 * Talk2Me #402 — Référencement des cards (Pascal 2026-06-05).
 *
 * Verbatim Pascal : "il devrait trouver Young thug car il est dans la DB
 * en card donc on référence mal les cards il faut un module référencement
 * qui s'occupe de récupérer les descriptions les titres les hashtags pour
 * les recevoir dans les recherches attaches de la carte correspondante"
 * + "suivant la card il faut maper et sortir une map que peut lire T2M".
 *
 * Module unique de mapping UnifiedCard → CardMetadataMap. Donne au moteur
 * de recherche T2M Officiel (FTS5) un blob indexable type-aware (titre,
 * auteur, channel, hashtags, description, tags). Le LIKE actuel sur
 * `messages.text` rate toutes les cards YouTube/Spotify/etc. parce que
 * leurs metadata vivent dans des colonnes JSON séparées (`youtube`,
 * `tiktok`) ou dans le `unified_card` calculé à la volée.
 *
 * Architecture :
 *   UnifiedCard (lib/embed-hub) → extractCardMetadata() → CardMetadataMap
 *   CardMetadataMap → searchableFromMap() → blob FTS5
 *
 * Discriminated union pour pouvoir router le rendu / la recherche par
 * type. Champs optionnels = best-effort selon ce que l'extracteur a réussi
 * à récupérer (oEmbed, scraping, etc.).
 *
 * Doctrine :
 * - [[modular-no-scattered-patches]] : 1 module = 1 responsabilité,
 *   ici le mapping centralisé pour ne pas dupliquer la logique dans
 *   tools.ts, handler.ts, search-cards.ts.
 * - [[talk2me-hub-universel]] : Cards = couche unifiée, les metadata
 *   d'indexation vivent au même endroit que les UnifiedCard.
 */

import type { UnifiedCard } from '@/lib/embed-hub/types';

export type CardMetadataMap =
  | {
      type: 'youtube';
      title: string;
      channel: string;
      description?: string;
      tags: string[];
      hashtags: string[];
      duration_sec?: number;
      video_id: string;
      thumbnail_url?: string;
    }
  | {
      type: 'spotify';
      title: string;
      artist: string;
      album?: string;
      genre?: string;
      duration_sec?: number;
      spotify_id: string;
    }
  | {
      type: 'tiktok';
      title: string;
      author_handle: string;
      description?: string;
      hashtags: string[];
      sound?: string;
      video_id?: string;
    }
  | {
      type: 'apple-music';
      title: string;
      artist: string;
      album?: string;
      track_id?: string;
    }
  | {
      type: 'soundcloud';
      title: string;
      artist: string;
      track_id?: string;
    }
  | {
      type: 'article';
      title: string;
      domain: string;
      author?: string;
      excerpt?: string;
      tags: string[];
      reading_time_min?: number;
    }
  | {
      type: 'image';
      caption?: string;
      tags: string[];
      url: string;
    }
  | {
      type: 'place';
      name: string;
      address?: string;
      category?: string;
      lat?: number;
      lon?: number;
    }
  | {
      type: 'video';
      title?: string;
      duration_sec?: number;
      url: string;
    }
  | {
      type: 'texte';
      body: string;
      hashtags: string[];
    }
  | {
      type: 'pdf';
      title?: string;
      url: string;
      pages?: number;
    }
  | {
      type: 'unknown';
      raw_url?: string;
      raw_text?: string;
    };

// ============================================================================
// Helpers texte
// ============================================================================

/**
 * Extrait les hashtags d'un texte (regex /#\w+/g). Dedupe + lowercase + sans #.
 * Ex: "salut #Music #music #rap" → ['music', 'rap']
 */
export function extractHashtagsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/(?<![\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const tag = m.slice(1).toLowerCase();
    if (tag.length === 0) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Mentions @pseudo d'un texte (sans @, casse préservée). Pour tagger + faire remonter le post. */
export function extractMentionsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/(?<![\p{L}\p{N}_])@[\p{L}\p{N}_]+/gu);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const h = m.slice(1);
    if (h.length === 0 || seen.has(h.toLowerCase())) continue;
    seen.add(h.toLowerCase());
    out.push(h);
  }
  return out;
}

/**
 * Remet la légende dans le BON ORDRE DE LECTURE (Pascal 2026-07-12) : les « petits malins »
 * qui collent les #hashtags AVANT la description → on déplace le bloc de hashtags de TÊTE à la
 * fin (prose d'abord, tags ensuite). On ne touche PAS aux hashtags déjà inline dans une phrase
 * (sinon on casserait le sens). Normalisation à la publication, pas pendant la frappe.
 */
export function reorderCaptionForReading(text: string): string {
  if (!text) return text;
  const lead = /^(?:\s*#[\p{L}\p{N}_]+)+\s*/u.exec(text);
  if (!lead) return text;
  const rest = text.slice(lead[0].length).trim();
  if (!rest) return text.trim(); // que des hashtags → rien à réordonner
  const tags = (lead[0].match(/#[\p{L}\p{N}_]+/gu) || []).join(' ');
  return `${rest} ${tags}`.trim();
}

function pickStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function pickNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ============================================================================
// Extraction principale : UnifiedCard → CardMetadataMap
// ============================================================================

export interface ExtractCardMetadataOpts {
  /** Texte du message d'origine (pour récupérer hashtags / caption inline). */
  rawText?: string;
}

/**
 * Map une UnifiedCard (lib/embed-hub) vers une CardMetadataMap typée.
 * Switch sur `source` du UnifiedCard. Best-effort : si un champ manque,
 * on dégrade vers `unknown` ou on laisse undefined plutôt que d'inventer.
 */
export function extractCardMetadata(
  card: UnifiedCard | null | undefined,
  opts: ExtractCardMetadataOpts = {},
): CardMetadataMap {
  if (!card) {
    return { type: 'unknown', raw_text: opts.rawText };
  }

  const rawText = opts.rawText || '';
  const meta = (card.meta || {}) as Record<string, unknown>;

  switch (card.source) {
    case 'youtube': {
      const videoId = pickStr(meta.video_id) || '';
      const tags = Array.isArray(meta.tags)
        ? (meta.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      const hashtags = extractHashtagsFromText(
        `${card.title || ''} ${card.description || ''} ${rawText}`,
      );
      return {
        type: 'youtube',
        title: card.title || '',
        channel: card.author?.name || pickStr(meta.channel) || '',
        description: card.description,
        tags,
        hashtags,
        duration_sec: pickNum(meta.duration_sec),
        video_id: videoId,
        thumbnail_url: card.thumbnail_url,
      };
    }

    case 'spotify': {
      return {
        type: 'spotify',
        title: card.title || '',
        artist: card.author?.name || pickStr(meta.artist) || '',
        album: pickStr(meta.album),
        genre: pickStr(meta.genre),
        duration_sec: pickNum(meta.duration_sec),
        spotify_id: pickStr(meta.id) || pickStr(meta.spotify_id) || '',
      };
    }

    case 'tiktok': {
      const hashtags = extractHashtagsFromText(
        `${card.title || ''} ${card.description || ''} ${rawText}`,
      );
      return {
        type: 'tiktok',
        title: card.title || '',
        author_handle: card.author?.name || pickStr(meta.user) || '',
        description: card.description,
        hashtags,
        sound: pickStr(meta.sound),
        video_id: pickStr(meta.videoId) || pickStr(meta.video_id),
      };
    }

    case 'apple-music':
    case 'applemusic': {
      return {
        type: 'apple-music',
        title: card.title || '',
        artist: card.author?.name || pickStr(meta.artist) || '',
        album: pickStr(meta.album),
        track_id: pickStr(meta.trackId) || pickStr(meta.id),
      };
    }

    case 'soundcloud': {
      return {
        type: 'soundcloud',
        title: card.title || '',
        artist: card.author?.name || pickStr(meta.artist) || '',
        track_id: pickStr(meta.slug) || pickStr(meta.id),
      };
    }

    case 'maps':
    case 'place': {
      return {
        type: 'place',
        name: card.title || '',
        address: pickStr(meta.address),
        category: pickStr(meta.category),
        lat: pickNum(meta.lat),
        lon: pickNum(meta.lon) ?? pickNum(meta.lng),
      };
    }

    case 'image': {
      const tags = Array.isArray(meta.tags)
        ? (meta.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      return {
        type: 'image',
        caption: card.description || card.title,
        tags,
        url: card.external_url,
      };
    }

    case 'video': {
      return {
        type: 'video',
        title: card.title,
        duration_sec: pickNum(meta.duration_sec),
        url: card.external_url,
      };
    }

    case 'pdf': {
      return {
        type: 'pdf',
        title: card.title,
        url: card.external_url,
        pages: pickNum(meta.pages),
      };
    }

    case 'article':
    case 'web':
    case 'fallback': {
      const url = card.external_url || '';
      const tags = Array.isArray(meta.tags)
        ? (meta.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      return {
        type: 'article',
        title: card.title || '',
        domain: domainFromUrl(url),
        author: card.author?.name,
        excerpt: card.description,
        tags,
        reading_time_min: pickNum(meta.reading_time_min),
      };
    }

    // ─── Plateformes sociales (twitter, facebook, instagram, etc.) ──────────
    // Pas de discriminant dédié au MVP : on les map en `article` pour rester
    // recherchable (titre + domaine + author + excerpt). Future-proof : si
    // Pascal veut un type spécifique social_post, ajouter un cas ici.
    case 'twitter':
    case 'facebook':
    case 'instagram':
    case 'linkedin':
    case 'pinterest':
    case 'reddit':
    case 'vimeo':
    case 'dailymotion':
    case 'twitch':
    case 'loom':
    case 'deezer': {
      const url = card.external_url || '';
      return {
        type: 'article',
        title: card.title || '',
        domain: domainFromUrl(url),
        author: card.author?.name,
        excerpt: card.description,
        tags: [],
      };
    }

    default: {
      // Source inconnue : on garde une trace pour debug + on extrait quand
      // même titre + url pour rester recherchable a minima.
      return {
        type: 'unknown',
        raw_url: card.external_url,
        raw_text: card.title || rawText || undefined,
      };
    }
  }
}

// ============================================================================
// Helper : map texte direct → CardMetadataMap (cas direct_cards type='texte'
// ou message sans URL).
// ============================================================================

export function metadataMapFromText(body: string): CardMetadataMap {
  return {
    type: 'texte',
    body: body || '',
    hashtags: extractHashtagsFromText(body || ''),
  };
}

// ============================================================================
// Helper : map direct_card type='image'|'video' sans extracteur web.
// ============================================================================

export function metadataMapFromDirectMedia(args: {
  type: 'image' | 'video' | 'texte';
  caption: string | null;
  text: string | null;
  media_url: string | null;
}): CardMetadataMap {
  const { type, caption, text, media_url } = args;
  if (type === 'texte') {
    return metadataMapFromText(text || caption || '');
  }
  if (type === 'image') {
    return {
      type: 'image',
      caption: caption || text || undefined,
      tags: extractHashtagsFromText(`${caption || ''} ${text || ''}`),
      url: media_url || '',
    };
  }
  // video
  return {
    type: 'video',
    title: caption || text || undefined,
    url: media_url || '',
  };
}

// ============================================================================
// Helper : produit un blob de texte indexable depuis une CardMetadataMap.
// Utilisé pour alimenter la colonne FTS5 `card_search`. Concat tous les
// champs textuels du map (titre, auteur, description, hashtags, tags, etc.).
// ============================================================================

export interface SearchableFields {
  type: string;
  title: string;
  description: string;
  author: string;
  tags: string;
  hashtags: string;
  body: string;
}

export function searchableFromMap(map: CardMetadataMap): SearchableFields {
  switch (map.type) {
    case 'youtube':
      return {
        type: 'youtube',
        title: map.title,
        description: map.description || '',
        author: map.channel,
        tags: (map.tags || []).join(' '),
        hashtags: (map.hashtags || []).join(' '),
        body: `${map.title} ${map.channel} ${map.description || ''}`.trim(),
      };
    case 'spotify':
      return {
        type: 'spotify',
        title: map.title,
        description: map.album || '',
        author: map.artist,
        tags: map.genre || '',
        hashtags: '',
        body: `${map.title} ${map.artist} ${map.album || ''} ${map.genre || ''}`.trim(),
      };
    case 'tiktok':
      return {
        type: 'tiktok',
        title: map.title,
        description: map.description || '',
        author: map.author_handle,
        tags: '',
        hashtags: (map.hashtags || []).join(' '),
        body: `${map.title} ${map.author_handle} ${map.description || ''} ${map.sound || ''}`.trim(),
      };
    case 'apple-music':
      return {
        type: 'apple-music',
        title: map.title,
        description: map.album || '',
        author: map.artist,
        tags: '',
        hashtags: '',
        body: `${map.title} ${map.artist} ${map.album || ''}`.trim(),
      };
    case 'soundcloud':
      return {
        type: 'soundcloud',
        title: map.title,
        description: '',
        author: map.artist,
        tags: '',
        hashtags: '',
        body: `${map.title} ${map.artist}`.trim(),
      };
    case 'article':
      return {
        type: 'article',
        title: map.title,
        description: map.excerpt || '',
        author: map.author || '',
        tags: (map.tags || []).join(' '),
        hashtags: '',
        body: `${map.title} ${map.domain} ${map.author || ''} ${map.excerpt || ''}`.trim(),
      };
    case 'image':
      return {
        type: 'image',
        title: map.caption || '',
        description: '',
        author: '',
        tags: (map.tags || []).join(' '),
        hashtags: '',
        body: `${map.caption || ''} ${(map.tags || []).join(' ')}`.trim(),
      };
    case 'place':
      return {
        type: 'place',
        title: map.name,
        description: map.address || '',
        author: '',
        tags: map.category || '',
        hashtags: '',
        body: `${map.name} ${map.address || ''} ${map.category || ''}`.trim(),
      };
    case 'video':
      return {
        type: 'video',
        title: map.title || '',
        description: '',
        author: '',
        tags: '',
        hashtags: '',
        body: (map.title || '').trim(),
      };
    case 'texte':
      return {
        type: 'texte',
        title: '',
        description: '',
        author: '',
        tags: '',
        hashtags: (map.hashtags || []).join(' '),
        body: (map.body || '').trim(),
      };
    case 'pdf':
      return {
        type: 'pdf',
        title: map.title || '',
        description: '',
        author: '',
        tags: '',
        hashtags: '',
        body: `${map.title || ''}`.trim(),
      };
    case 'unknown':
    default:
      return {
        type: 'unknown',
        title: '',
        description: '',
        author: '',
        tags: '',
        hashtags: '',
        body: `${(map as { raw_text?: string }).raw_text || ''}`.trim(),
      };
  }
}
