/**
 * lib/cards/v2/types — SuperCard SCHÉMA CANONIQUE (spec:2).
 *
 * Refonte SuperCard (Pascal 2026-07-19, étapes 1–5 figées). Ce fichier décrit la FORME
 * canonique cible du langage `.card`. Il vit À CÔTÉ de `lib/cards/supercard.ts` (spec:1)
 * pendant toute la migration — RIEN n'est branché ici (Phase A : fondations isolées).
 *
 * Pur (browser-safe) : aucun import Node, utilisable serveur ET client.
 * Doctrine : 4 strates (identité / contenu / blocs métier / composition), un concept = un
 * nom, l'argent en une seule représentation, le volatile JAMAIS dans la carte.
 */

export const CARD_FORMAT_V2 = 't2m.card' as const;
export const CARD_SPEC_V2 = 2 as const;

// ── Enveloppe : énumérations d'identité ──
export type CardStatus = 'draft' | 'scheduled' | 'published' | 'archived' | 'suspended' | 'deleted';
export type CardVisibility = 'public' | 'private' | 'unlisted' | 'restricted';
export type OfferType = 'sale' | 'rent' | 'exchange' | 'free';

// ── Sous-structures de contenu ──
export type MediaType = 'image' | 'video' | 'audio';
export type MediaRole = 'cover' | 'trailer' | 'full' | 'track' | 'jingle' | 'banner' | 'spot';
export type MediaOrientation = 'h' | 'v' | 'square';

export interface MediaElement {
  url: string;
  type: MediaType;
  role?: MediaRole;
  orientation?: MediaOrientation;
  meta?: {
    title?: string; thumbnail?: string; author?: string;
    external_url?: string; track_id?: string; duration?: number;
    /** Karaoké : pointeur vers la ressource lyrics (entity_lyrics) — RÉFÉRENCÉ, jamais le timing. */
    lyrics_ref?: string;
  };
}

export type ActionKind =
  | 'open' | 'buy' | 'order' | 'reserve' | 'book' | 'unlock'
  | 'contact' | 'apply' | 'tip' | 'pay' | 'save' | 'share' | 'follow' | 'route'
  | 'join' | 'contribute';

export interface CardActionV2 {
  kind: ActionKind;
  label: string;               // lu tel quel — jamais recalculé
  target?: string;             // id, JAMAIS un montant (A2)
  priority?: 'primary' | 'secondary';
}

export interface Money { amount: number; currency: string } // amount entier (unité réelle, pas de centimes)

export interface Place { lat?: number; lng?: number; address?: string; city?: string }

export interface Discovery { hashtags?: string[]; keywords?: string[]; mentions?: string[] }

export interface Presentation {
  bg_variant?: string; accent?: string; emphasis?: string;
  density_hint?: string; aspect_pref?: string; badge_override?: string;
}

export interface TariffLine { label: string; price: Money }

// ── Composition (strate 4) ──
export type ItemRole =
  | 'track' | 'episode' | 'chapter' | 'slide' | 'page'          // séquence
  | 'product' | 'dish' | 'listing' | 'item'                     // catalogue
  | 'cover' | 'trailer' | 'preview' | 'attachment'              // adjoint
  | 'ingredient' | 'component' | 'variant' | 'option'           // décomposition
  | 'section' | 'bundle';                                       // regroupement

export type ItemCarrier = 'card' | 'primitive';
export type PrimitiveType = 'section' | 'text' | 'media' | 'separator' | 'spacer';

export interface ItemElement {
  role: ItemRole;
  order?: number;
  carrier: ItemCarrier;
  // carrier = 'card'
  mode?: 'inline' | 'ref';
  card?: SuperCardV2;                                      // mode inline
  ref?: string;                                            // mode ref
  preview?: { title?: string; cover?: string; price?: Money }; // cache d'affichage — jamais la vérité (C4)
  // carrier = 'primitive'
  primitive_type?: PrimitiveType;
  content?: Record<string, unknown>;
  // présentation locale seulement (jamais des données)
  context_overrides?: { presentation?: Presentation };
}

export type LinkRel = 'storefront' | 'related' | 'derived_from' | 'mentions' | 'bundle_of';
export interface LinkV2 { rel: LinkRel; target_id: string; preview?: { title?: string; cover?: string } }

export interface ProviderRef { provider: string; endpoint?: string; ref?: string }

// ── Blocs métier typés (strate 3) — faits de domaine uniquement ──
export interface VehicleBlock {
  body_type?: string; make?: string; model?: string; year?: number;
  mileage?: { value: number; unit: string }; fuel?: string; transmission?: string;
  seats?: number; doors?: number; condition?: string; driver_option?: string;
}
export interface PropertyBlock {
  property_type?: string; surface?: { value: number; unit: string };
  rooms?: number; bedrooms?: number; bathrooms?: number; floor?: number;
  furnished?: boolean; energy_class?: string; amenities?: string[];
}
export interface DatingBlock { age?: number; gender?: string; seeking?: string; intent?: string }
export interface FoodBlock { dietary?: string[]; allergens?: string[]; spice_level?: string; portion?: string }
export interface JobBlock { contract?: string; experience?: string; remote?: string; sector?: string; salary_range?: { min?: number; max?: number; currency?: string } }
// music / pub : structures riches — typées largement ici, validées par le registre.
export type MusicBlock = Record<string, unknown>;
export interface PubBlock { format?: string; budget?: Money; target?: { scope?: string; zone?: string }; pacing?: unknown }

// ── Cycle de vie de création (Pascal 2026-07-21, archi gelée) : project / mission / resource ──
// `kind` dans ces blocs = TAG DE CAPACITÉ (le moteur matche par capacité dérivée, pas par card-kind).
// AUCUN argent ici : la rémunération = `share_bps` (entier) + rails affiliation/escrow existants.
export type CandidateProvenance = 'asset' | 'resource' | 'opportunity' | 'mission';

/** Réponse candidate à un besoin. asset/opportunity = arêtes (ref carte OU external_ref) ; resource/mission = cartes. */
export interface NeedCandidate {
  provenance: CandidateProvenance;
  ref?: string;              // id OPAQUE d'une carte existante
  external_ref?: string;     // signal volatil (météo, événement…) — jamais figé dans la carte
  status?: string;           // CANDIDATE_STATUSES
  score?: number;            // entier 0–100
  quantity?: number;
}

export interface ProjectNeed {
  id: string;
  kind: string;              // TAG DE CAPACITÉ requise (pas un card-kind)
  title?: string;
  description?: string;
  status?: string;           // NEED_STATUSES
  source?: { type?: string; id?: string };
  quantity?: { required?: number; filled?: number; unit?: string };
  location?: string;
  priority?: number;
  requirements?: Record<string, unknown>;
  candidates?: NeedCandidate[];   // UNIFIE resource_links + mission_links (v2)
  auto_created?: boolean;
  detected_by?: string;
}

export interface ProjectContributor { ref: string; roles?: string[]; share_bps?: number; status?: string }
export interface ProjectApproval { stage: string; state: string; by_ref?: string; at?: string | number }

export interface ProjectBlock {
  domain?: string;           // PROJECT_DOMAINS : film | album | event | other
  lifecycle?: string;        // PROJECT_LIFECYCLE
  intent?: string;
  source_card_id?: string;   // si adaptation d'une œuvre existante
  constraints?: { locations?: string[]; people?: number; devices?: number; target_duration_ms?: number };
  approvals?: ProjectApproval[];
  contributors?: ProjectContributor[];  // refs OPAQUES + parts entières (bps)
  film?: Record<string, unknown>;   // sous-document de domaine (scenes/shots/takes/timeline)
  album?: Record<string, unknown>;
  needs?: ProjectNeed[];
}

export interface MissionApplication { ref: string; resource_card_id?: string; quantity_offered?: number; status?: string }
export interface MissionBlock {
  project_card_id?: string;
  need_id?: string;
  kind?: string;             // tag de capacité
  quantity_required?: number;
  quantity_filled?: number;
  location?: string;
  date_window?: { start?: string | number; end?: string | number };
  requirements?: Record<string, unknown>;
  compensation?: { mode?: string; share_bps?: number };  // AUCUN {amount,currency}
  applications?: MissionApplication[];
  state?: string;            // MISSION_STATES
}

export interface ResourceBlock {
  kind?: string;             // tag de capacité
  quantity_available?: number;
  unit?: string;
  location?: string;
  capabilities?: string[];   // hint OPTIONNEL (le moteur dérive le reste)
  availability?: Array<{ start?: string | number; end?: string | number }>;
  metadata?: Record<string, unknown>;
}

/** La SuperCard canonique (spec:2). Toutes les facettes sont OPTIONNELLES sauf l'identité. */
export interface SuperCardV2 {
  // Enveloppe
  format: typeof CARD_FORMAT_V2;
  spec: number;
  // Strate 1 — identité & gouvernance
  id: string;
  kind: string;
  facets?: string[];
  owner: string;
  // Apporteur/contributeur qui a fait entrer ou créé cette card et la GÈRE (droit d'édition).
  // La card reste au `owner` ; le proprio peut RÉVOQUER à tout moment (parrain = null). Cf calculateur contributeur.
  parrain?: string | null;
  source?: { name?: string; label?: string; icon?: string; url?: string };
  status: CardStatus;
  visibility: CardVisibility;
  language?: string;
  created_at: string | number;
  updated_at: string | number;
  published_at?: string | number | null;
  governance?: { entityKey?: string; affiliation?: { ownerCut?: number }; signature?: string };
  // Strate 2 — contenu
  title?: string;
  text?: { body?: string };
  media?: MediaElement[];
  price?: Money;
  offer?: { type: OfferType };
  place?: Place;
  categories?: string[];
  rayon?: string;
  specs?: Record<string, string | number | boolean>;
  stock?: number;
  discovery?: Discovery;
  actions?: CardActionV2[];
  rating?: { score?: number; count?: number };
  link?: { url: string; reader?: 'inline' | 'embed' | 'preview' };
  presentation?: Presentation;
  hours?: unknown;
  service_modes?: string[];
  tariff?: TariffLine[];
  availability?: { ref: string };
  expires_at?: string | number;
  deposit?: Money;
  // Strate 3 — blocs métier typés
  vehicle?: VehicleBlock;
  property?: PropertyBlock;
  music?: MusicBlock;
  pub?: PubBlock;
  dating?: DatingBlock;
  food?: FoodBlock;
  job?: JobBlock;
  // Strate 3 (suite) — cycle de vie de création
  project?: ProjectBlock;
  mission?: MissionBlock;
  resource?: ResourceBlock;
  // Strate 4 — composition & liens
  items?: ItemElement[];
  links?: LinkV2[];
  provider_ref?: ProviderRef;
}
