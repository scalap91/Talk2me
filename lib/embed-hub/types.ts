/**
 * Talk2Me — Universal Embed Hub (Pascal 2026-06-05)
 *
 * Types unifiés pour le moteur de cards multi-plateformes. Phase 1 = scaffolding
 * en parallèle des embeds existants (cf. components/embeds/). Migration en
 * Phase 2+. Doctrine `project_talk2me_universal_embed_hub`.
 */

export type CardType =
  | 'video'
  | 'audio'
  | 'image'
  | 'discussion'
  | 'social_post'
  | 'place'
  | 'hotel'
  | 'restaurant'
  | 'product'
  | 'article';

export interface UnifiedAuthor {
  name: string;
  url?: string;
  avatar_url?: string;
}

export interface UnifiedEmbed {
  kind: 'iframe' | 'audio' | 'image' | 'video' | 'custom';
  src?: string;
  aspect_ratio?: string; // ex: "16 / 9", "9 / 16", "1 / 1"
  height?: number; // px fixe (audio)
  allow?: string;
  allow_fullscreen?: boolean;
  // Pour kind='image' : URL image directe + dimensions optionnelles.
  // Bug #5 audit #413 (extractor image direct, Pascal 2026-06-05).
  image_url?: string;
  alt?: string;
}

export type UnifiedAction =
  | { kind: 'open'; label: string; url: string }
  | { kind: 'share'; label: string }
  | { kind: 'save'; label: string }
  | { kind: 'comment'; label: string }
  | { kind: 'book'; label: string; url: string }
  | { kind: 'directions'; label: string; lat: number; lng: number }
  | { kind: 'custom'; label: string; href?: string };

export interface UnifiedCard {
  source: string; // 'youtube' | 'tiktok' | ...
  source_label: string; // "YouTube"
  source_icon_url?: string;

  type: CardType;
  title: string;
  author?: UnifiedAuthor;
  thumbnail_url?: string;
  description?: string;

  external_url: string;
  embed?: UnifiedEmbed;

  meta?: Record<string, unknown>;
  actions: UnifiedAction[];
}

export interface ExtractorResult {
  ok: boolean;
  card?: UnifiedCard;
  reason?: string;
}

export interface ExtractorContext {
  baseUrl: string; // pour calls à des sub-APIs T2M
  resolverTimeoutMs?: number; // 5000 par défaut
  /**
   * Hostname public visible par le browser, à utiliser pour les embeds
   * qui exigent un `parent=` matchant l'Origin réel (Twitch, etc.).
   * Bug #2 audit #413 (Pascal 2026-06-05). Optionnel : fallback baseUrl.
   */
  publicHostname?: string;
}

export type Extractor = (
  url: string,
  ctx: ExtractorContext
) => Promise<ExtractorResult>;
