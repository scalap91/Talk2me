/**
 * lib/cards/v2/registry — LE REGISTRE canonique (spec:2), source UNIQUE versionnée.
 *
 * Refonte SuperCard (étape 6, Phase A). C'est LA vérité : la liste des `kind`, `facets`,
 * `role`, `rel`, blocs métier, actions, et le jeu FERMÉ des champs de premier ordre.
 * Le validateur (validate.ts) s'appuie EXCLUSIVEMENT sur ce registre. Web ↔ natif partagent
 * cette même définition (EV6 : jamais deux définitions concurrentes).
 *
 * ÉVOLUTION (EV1/EV2) : on AJOUTE des entrées (kind, role, rel, bloc) ; on ne renomme/retire
 * jamais un concept existant sans incrément de `spec` + migration (EV4). Pur (browser-safe).
 */

/** Types canoniques (kind) — le lecteur s'appuie d'abord dessus. Ajout = additif. */
export const KINDS = [
  'post', 'image', 'video', 'audio', 'article', 'social_post',
  'product', 'boutique', 'listing', 'restaurant', 'place',
  'album', 'film', 'pub', 'formation', 'dating', 'story', 'room',
  'recipe', 'event', 'job', 'profile', 'link',
  // Cycle de vie de création (Pascal 2026-07-21) : œuvre-en-projet + graphe de production.
  // `project` = carte vivante ; `mission`/`resource` = seules cartes autonomes neuves.
  // asset/opportunity NE SONT PAS des kinds : ce sont des provenances de candidat (arêtes).
  'project', 'mission', 'resource',
] as const;

/** Facettes secondaires (non structurantes). Ouvert/additif. */
export const FACETS = [
  'social_post', 'product', 'place', 'audio', 'video', 'image', 'vehicle', 'property',
  // domaine d'un `project` (project.domain porté en facette : film | album | event).
  'film', 'album', 'event',
] as const;

export const STATUSES = ['draft', 'scheduled', 'published', 'archived', 'suspended', 'deleted'] as const;
export const VISIBILITIES = ['public', 'private', 'unlisted', 'restricted'] as const;
export const OFFER_TYPES = ['sale', 'rent', 'exchange', 'free'] as const;

/** Devises autorisées. MGA = Ariary, devise unique de la plateforme (P3). */
export const CURRENCIES = ['MGA'] as const;

export const MEDIA_TYPES = ['image', 'video', 'audio'] as const;
export const MEDIA_ROLES = ['cover', 'trailer', 'full', 'track', 'jingle', 'banner', 'spot'] as const;
export const MEDIA_ORIENTATIONS = ['h', 'v', 'square'] as const;

export const ACTION_KINDS = [
  'open', 'buy', 'order', 'reserve', 'book', 'unlock',
  'contact', 'apply', 'tip', 'pay', 'save', 'share', 'follow', 'route',
  // cycle de vie de création : rejoindre un projet / y contribuer.
  'join', 'contribute',
] as const;
export const ACTION_PRIORITIES = ['primary', 'secondary'] as const;

/** Champs INTERDITS dans une action (A2 : aucune action ne porte d'argent). */
export const ACTION_FORBIDDEN_KEYS = ['amount', 'price', 'currency', 'price_cents', 'total'] as const;

export const ITEM_ROLES = [
  'track', 'episode', 'chapter', 'slide', 'page',
  'product', 'dish', 'listing', 'item',
  'cover', 'trailer', 'preview', 'attachment',
  'ingredient', 'component', 'variant', 'option',
  'section', 'bundle',
] as const;
export const ITEM_CARRIERS = ['card', 'primitive'] as const;
export const ITEM_MODES = ['inline', 'ref'] as const;
export const PRIMITIVE_TYPES = ['section', 'text', 'media', 'separator', 'spacer'] as const;

export const LINK_RELS = ['storefront', 'related', 'derived_from', 'mentions', 'bundle_of'] as const;

export const SERVICE_MODES = ['dine_in', 'takeaway', 'delivery'] as const;

/** Blocs métier typés connus. Ajout d'un domaine = ajout ici (EV2), sans toucher au socle. */
export const KNOWN_BLOCKS = ['vehicle', 'property', 'music', 'pub', 'dating', 'food', 'job', 'project', 'mission', 'resource'] as const;

// ── Cycle de vie de création (project / mission / resource) — Pascal 2026-07-21, archi gelée ──
// Jeux FERMÉS des sous-états. `need.kind` / `mission.kind` / `resource.kind` restent des CHAÎNES
// LIBRES : ce sont des TAGS DE CAPACITÉ (le matching se fait par capacité dérivée, pas par kind).
/** Domaine d'un projet (porté aussi en facette). */
export const PROJECT_DOMAINS = ['film', 'album', 'event', 'other'] as const;
/** Étapes de vie créative d'un projet. */
export const PROJECT_LIFECYCLE = ['idea', 'writing', 'preproduction', 'shooting', 'postproduction', 'ready'] as const;
/** Étapes soumises à validation humaine versionnée. */
export const APPROVAL_STAGES = ['screenplay', 'breakdown', 'storyboard'] as const;
export const APPROVAL_STATES = ['draft', 'approved', 'locked'] as const;
/** Statut d'un besoin (need). */
export const NEED_STATUSES = ['detected', 'searching', 'matched', 'partially_filled', 'mission_open', 'fulfilled', 'cancelled'] as const;
/** Provenance d'un candidat = échelle de certitude (asset le + sûr → mission dernier recours).
 *  asset/opportunity = arêtes (ref carte existante ou external_ref) ; resource/mission = cartes. */
export const CANDIDATE_PROVENANCES = ['asset', 'resource', 'opportunity', 'mission'] as const;
export const CANDIDATE_STATUSES = ['detected', 'linked', 'suggested', 'converting', 'confirmed', 'open', 'filled', 'rejected'] as const;
/** Statut d'un contributeur au projet. */
export const CONTRIBUTOR_STATUSES = ['invited', 'active', 'completed', 'removed'] as const;
/** Rémunération d'une mission : par défaut revenue_share, jamais de paiement immédiat.
 *  AUCUN {amount,currency} dans ces blocs — la répartition passe par affiliation/escrow existants. */
export const MISSION_COMPENSATION_MODES = ['volunteer', 'revenue_share'] as const;
/** État de recrutement d'une mission (le socle `status` reste draft/published/…). */
export const MISSION_STATES = ['draft', 'open', 'assigned', 'submitted', 'accepted', 'closed'] as const;
export const APPLICATION_STATUSES = ['submitted', 'shortlisted', 'accepted', 'rejected'] as const;

/**
 * Jeu FERMÉ des champs de premier ordre autorisés. Un champ hors de cette liste = « champ
 * maison » → REJETÉ à l'écriture. C'est la règle « aucun champ hors du schéma » (étape 5).
 */
export const TOP_LEVEL_FIELDS = [
  // enveloppe
  'format', 'spec',
  // strate 1 — identité & gouvernance
  'id', 'kind', 'facets', 'owner', 'source', 'status', 'visibility', 'language',
  'created_at', 'updated_at', 'published_at', 'governance',
  // strate 2 — contenu
  'title', 'text', 'media', 'price', 'offer', 'place', 'categories', 'rayon', 'specs',
  'stock', 'discovery', 'actions', 'rating', 'link', 'presentation',
  'hours', 'service_modes', 'tariff', 'availability', 'expires_at', 'deposit',
  // strate 3 — blocs métier
  ...KNOWN_BLOCKS,
  // strate 4 — composition & liens
  'items', 'links', 'provider_ref',
] as const;

/** Champs OBLIGATOIRES de l'enveloppe/identité. */
export const REQUIRED_FIELDS = ['format', 'spec', 'id', 'kind', 'owner', 'status', 'visibility', 'created_at', 'updated_at'] as const;

/**
 * Profondeur MAXIMALE de composition (C2). La VALEUR est un paramètre d'implémentation
 * (le langage exige seulement qu'un plafond existe et soit contrôlé) — réglable ici.
 */
export const MAX_COMPOSITION_DEPTH = 4;

/** Version du registre = version du schéma qu'il décrit. */
export const REGISTRY_SPEC = 2;

// ── JEUX FERMÉS des sous-objets (le rempart descend à TOUS les étages, pas juste au top-level) ──
export const ACTION_KEYS = ['kind', 'label', 'target', 'priority'] as const;
export const MEDIA_KEYS = ['url', 'type', 'role', 'orientation', 'meta'] as const;
export const MEDIA_META_KEYS = ['title', 'thumbnail', 'author', 'external_url', 'track_id', 'duration', 'lyrics_ref'] as const;
export const ITEM_KEYS = ['role', 'order', 'carrier', 'mode', 'card', 'ref', 'preview', 'primitive_type', 'content', 'context_overrides'] as const;
export const PREVIEW_KEYS = ['title', 'cover', 'price'] as const;
export const LINK_KEYS = ['rel', 'target_id', 'preview'] as const;
export const LINK_PREVIEW_KEYS = ['title', 'cover'] as const;
export const LINK_READERS = ['inline', 'embed', 'preview'] as const;
export const OFFER_KEYS = ['type'] as const;
export const PLACE_KEYS = ['lat', 'lng', 'address', 'city'] as const;
export const SOURCE_KEYS = ['name', 'label', 'icon', 'url'] as const;
export const RATING_KEYS = ['score', 'count'] as const;
export const GOVERNANCE_KEYS = ['entityKey', 'affiliation', 'signature'] as const;
export const PROVIDER_REF_KEYS = ['provider', 'endpoint', 'ref'] as const;
export const TARIFF_KEYS = ['label', 'price'] as const;
export const CONTEXT_OVERRIDE_KEYS = ['presentation'] as const;
export const PRESENTATION_KEYS = ['bg_variant', 'accent', 'emphasis', 'density_hint', 'aspect_pref', 'badge_override'] as const;

/**
 * Schéma FERMÉ de chaque bloc métier : clés autorisées + clés qui portent de l'argent
 * (routées vers validateMoney). `music` reste souple (DDEX riche, sans argent) mais fermé au
 * top-level de ses sous-sections. Un bloc ne contient JAMAIS une facette du socle (BR2).
 */
export interface BlockSchema { keys: readonly string[]; money?: readonly string[]; loose?: boolean }
export const BLOCK_SCHEMAS: Record<string, BlockSchema> = {
  vehicle: { keys: ['body_type', 'make', 'model', 'year', 'mileage', 'fuel', 'transmission', 'seats', 'doors', 'condition', 'driver_option'] },
  property: { keys: ['property_type', 'surface', 'rooms', 'bedrooms', 'bathrooms', 'floor', 'furnished', 'energy_class', 'amenities'] },
  dating: { keys: ['age', 'gender', 'seeking', 'intent'] },
  food: { keys: ['dietary', 'allergens', 'spice_level', 'portion'] },
  job: { keys: ['contract', 'experience', 'remote', 'sector', 'salary_range'] },
  pub: { keys: ['format', 'budget', 'target', 'pacing'], money: ['budget'] },
  music: { keys: ['work', 'recording', 'release', 'rights', 'ids'], loose: true },
  // Cycle de vie de création — clés fermées du haut du bloc. Sous-documents imbriqués
  // (film/scenes/needs/candidates…) validés par des validateurs DÉDIÉS (validate.ts), pas
  // par BLOCK_FIELD_TYPES (plat). AUCUN argent dans ces blocs (scan anti-argent + P3).
  project: { keys: ['domain', 'lifecycle', 'intent', 'source_card_id', 'constraints', 'approvals', 'contributors', 'film', 'album', 'needs'] },
  mission: { keys: ['project_card_id', 'need_id', 'kind', 'quantity_required', 'quantity_filled', 'location', 'date_window', 'requirements', 'compensation', 'applications', 'state'] },
  resource: { keys: ['kind', 'quantity_available', 'unit', 'location', 'capabilities', 'availability', 'metadata'] },
};

/**
 * TYPE de valeur de chaque champ de bloc (le rempart descend des clés aux VALEURS) :
 * s=string · n=number · b=boolean · s[]=string[] · measure={value:number,unit:string}
 * money={amount,currency} · salary={min,max,currency} · target={scope,zone}.
 * Tout ce qui n'est pas listé (ex. `music`) est traité en « loose » avec scan anti-argent.
 */
export const BLOCK_FIELD_TYPES: Record<string, Record<string, string>> = {
  vehicle: { body_type: 's', make: 's', model: 's', year: 'n', mileage: 'measure', fuel: 's', transmission: 's', seats: 'n', doors: 'n', condition: 's', driver_option: 's' },
  property: { property_type: 's', surface: 'measure', rooms: 'n', bedrooms: 'n', bathrooms: 'n', floor: 'n', furnished: 'b', energy_class: 's', amenities: 's[]' },
  dating: { age: 'n', gender: 's', seeking: 's', intent: 's' },
  food: { dietary: 's[]', allergens: 's[]', spice_level: 's', portion: 's' },
  job: { contract: 's', experience: 's', remote: 's', sector: 's', salary_range: 'salary' },
  pub: { format: 's', budget: 'money', target: 'target', pacing: 's' },
};

export const isLinkRel2 = (v: unknown): boolean => (LINK_RELS as readonly string[]).includes(v as string);

// Helpers d'appartenance (typés, réutilisés par le validateur).
export const isKind = (v: unknown): boolean => (KINDS as readonly string[]).includes(v as string);
export const isStatus = (v: unknown): boolean => (STATUSES as readonly string[]).includes(v as string);
export const isVisibility = (v: unknown): boolean => (VISIBILITIES as readonly string[]).includes(v as string);
export const isOfferType = (v: unknown): boolean => (OFFER_TYPES as readonly string[]).includes(v as string);
export const isCurrency = (v: unknown): boolean => (CURRENCIES as readonly string[]).includes(v as string);
export const isMediaType = (v: unknown): boolean => (MEDIA_TYPES as readonly string[]).includes(v as string);
export const isMediaRole = (v: unknown): boolean => (MEDIA_ROLES as readonly string[]).includes(v as string);
export const isActionKind = (v: unknown): boolean => (ACTION_KINDS as readonly string[]).includes(v as string);
export const isItemRole = (v: unknown): boolean => (ITEM_ROLES as readonly string[]).includes(v as string);
export const isPrimitiveType = (v: unknown): boolean => (PRIMITIVE_TYPES as readonly string[]).includes(v as string);
export const isLinkRel = (v: unknown): boolean => (LINK_RELS as readonly string[]).includes(v as string);
export const isTopLevelField = (v: string): boolean => (TOP_LEVEL_FIELDS as readonly string[]).includes(v);
