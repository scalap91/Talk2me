/**
 * Talk2Me #337 — Modèle unifié pour ConversationView.
 *
 * Le composant ConversationView est partagé entre :
 *  - la conversation IA solo (app/page.tsx)
 *  - la conversation P2P (app/c/[conv_id]/page.tsx)
 *
 * Cette interface est la projection commune.
 */
import type {
  YouTubeCardData,
  PlaceCardData,
  RecipeCardData,
  ProductCardData,
  WebSearchData,
  TikTokCardData,
} from '@/lib/chat-types';
import type { WikipediaCardData } from '@/lib/wikipedia-search';
import type { WeatherCardData } from '@/lib/weather';
import type { UnifiedCard } from '@/lib/embed-hub/types';

export interface ConversationPeer {
  /** ID stable du peer (user-id ou 'ai-self'). */
  id: string;
  /** Nom affiché dans le header. */
  name: string;
  /** Sous-titre (présence, statut). */
  subtitle?: string | null;
  /** URL avatar. null → fallback gradient + initiales. */
  avatarUrl?: string | null;
  /** Type de pair : conv IA solo OU humain (P2P). */
  kind: 'ai' | 'human';
  /** En ligne / hors ligne / typing — utilisé pour le pastille verte. */
  presence?: 'online' | 'offline' | 'typing';
  /** Genre IA (pour copy / pronoms futur). */
  ai_gender?: 'feminin' | 'masculin';
}

/**
 * Auteur d'une bulle dans le flux unifié.
 *
 * Talk2Me #338 (Pascal 2026-06-04) — passe de 3 à 4 valeurs pour distinguer
 * MON IA (côté droit) de l'IA DE L'AMI (côté gauche) en P2P.
 *
 * - 'me'       : moi humain → bulle droite, couleur violet/bleu
 * - 'me-ai'    : MON IA (Léa pour moi) → bulle droite, variante AI
 * - 'peer'     : ami humain OU IA en mode solo → bulle gauche, couleur neutre/bleu
 * - 'peer-ai'  : IA DE L'AMI (T2M d'Alex pour Alex) → bulle gauche, variante AI
 *
 * Compat : l'ancienne valeur 'ai_reply' est mappée → 'peer-ai' au runtime.
 */
export type UnifiedAuthor = 'me' | 'me-ai' | 'peer' | 'peer-ai' | 'ai_reply';

export interface UnifiedMessage {
  id: string;
  /**
   * - 'me'      : bulle droite (moi humain)
   * - 'me-ai'   : bulle droite, variante AI (mon IA pour moi)
   * - 'peer'    : bulle gauche (peer humain OU IA en mode solo)
   * - 'peer-ai' : bulle gauche, variante AI (IA de l'ami)
   * - 'ai_reply': legacy, équivalent 'peer-ai'
   */
  author: UnifiedAuthor;
  /** Texte brut, peut être vide si que des cards. */
  content: string;
  /** Timestamp ms unix pour l'heure sous la bulle + le séparateur date. */
  timestamp?: number;
  /** Nom auteur (affiché pour bulles peer/ai_reply, optionnel pour me). */
  author_name?: string;
  /** Avatar auteur. Si ai_reply : avatar de l'IA. Si peer humain : avatar du contact. */
  author_avatar_url?: string | null;
  /** Lien de citation (mini-quote rendue dans la bulle). */
  quotedPreview?: { author_name: string; text: string } | null;
  /** ID du message original cité (pour le drag-to-reply WhatsApp-style). */
  quoted_message_id?: string | null;

  // === Cards riches (8 types) ===
  youtube?: YouTubeCardData | null;
  places?: PlaceCardData[] | null;
  intent_query?: string | null;
  user_lat?: number | null;
  user_lng?: number | null;
  recipe?: RecipeCardData | null;
  products?: ProductCardData[] | null;
  wikipedia?: WikipediaCardData | null;
  weather?: WeatherCardData | null;
  web_search?: WebSearchData | null;
  /**
   * Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo TikTok safe filtrée par
   * les 5 garde-fous handler-side. Render TikTokEmbed (iframe officielle).
   */
  tiktok?: TikTokCardData | null;
  /** True → afficher GeolocRequestBubble (cas IA solo). */
  requires_geoloc?: boolean;
  /** Liens additionnels à embedder (cas IA solo). */
  extraLinks?: string[];

  /**
   * Talk2Me média chat (Pascal 2026-06-04) — fichier partagé dans la conv
   * (image / vidéo / audio) avec lecteur intégré + bouton download.
   */
  media?: {
    url: string;
    type: 'image' | 'video' | 'audio';
    filename?: string | null;
    size?: number | null;
    mime?: string | null;
    poster?: string | null;
  } | null;

  /**
   * Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — UnifiedCards
   * RE-SERVIES par l'IA officielle sous le texte. Pour chaque card,
   * UnifiedCardRenderer (variant=inline-chat). Cap 3.
   * Bug fix verbatim Pascal : "il ne sait pas me ressevir en card dorigine
   * le contenue quil a citer".
   */
  attached_cards?: UnifiedCard[] | null;
}
