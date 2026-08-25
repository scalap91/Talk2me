/**
 * lib/cards/supercard — LE MOTEUR DE LA SUPERCARD (Card OS, Pascal 2026-06-30).
 * UNE seule card universelle, source de vérité. Sa forme persistée = un FICHIER `.card`
 * (JSON auto-décrit : entête `format`/`spec` + identité + facettes optionnelles + actions).
 * Doctrine gelée : /schema/card-os. Pur (browser-safe) — aucun import Node, utilisable
 * côté serveur ET client. Les lecteurs (Feed/Eat/Boutique…) lisent CE type ; ils ne
 * créent plus leur propre forme de card.
 */

export const CARD_FORMAT = 't2m.card';
export const CARD_SPEC = 1;

/** Types métier — une card PEUT en cumuler plusieurs (ex. ['product','video']). */
export type CardType =
  | 'video' | 'audio' | 'image' | 'article' | 'social_post'
  | 'place' | 'restaurant' | 'hotel' | 'product' | 'listing'
  | 'event' | 'job' | 'company' | 'profile' | 'recipe' | 'destination' | 'link'
  // 'room' — SALLE 3D encapsulée en SuperCard (Pascal 2026-07-02). La card = enveloppe
  // légère (couverture room_photo + action open → /piece?u=owner) ; la scène WebGL
  // reste l'expérience plein écran lancée par l'action. Partageable comme un .card.
  | 'room'
  // 'album' (musique multi-pistes MP3) · 'film' (bande-annonce + film complet) — médias natifs
  // vendables. Le lecteur détecte album via audio.tracks[], film via video.trailer/full. Pascal 2026-07-17.
  | 'album' | 'film'
  // 'pub' — PUBLICITÉ (régie) : bannière+jingle ou pré-roll vidéo, servie par le moteur régie,
  // jamais mélangée visuellement au feed. Bloc `pub` typé. Pascal 2026-07-18.
  | 'pub'
  // 'boutique' — VITRINE : la card enveloppe (couverture + grille de produits `items`), lue par
  // SuperCardView variant="boutique". Distinct du `channel:'boutique'` (rail commerce) : ici c'est
  // le TYPE de contenu (conteneur boutique), utilisé par StatusBar/ma-boutique/simple-shop.
  | 'boutique';

/** Le SWITCH commerce PRINCIPAL — à quel canal (lecteur + rail de paiement) la card
 *  appartient. eat = resto/plat · annonce = petite annonce · boutique = produit boutique.
 *  Distinct des `types` (contenu) : il pilote le LECTEUR commerce et le LIBELLÉ du bouton.
 *  Le rail de paiement, lui, est câblé UNE fois (lit price + action, quel que soit le channel). */
export type CardChannel = 'eat' | 'annonce' | 'boutique' | 'ad';

export type CardActionKind =
  | 'open' | 'buy' | 'reserve' | 'order' | 'contact'
  | 'route' | 'apply' | 'save' | 'share' | 'follow' | 'pay';

export interface CardAction {
  kind: CardActionKind;
  label: string;
  url?: string;
  params?: string[]; // ex. réserver → ['date','nb_personnes','type_chambre']
}

/** L'objet unique. Toutes les facettes sont OPTIONNELLES — le lecteur choisit. */
export interface SuperCard {
  // — Entête de format (rend le fichier .card auto-identifiable)
  format: typeof CARD_FORMAT;
  spec: number;

  // — Identité (socle)
  id: string;
  types: CardType[];
  /** Switch commerce principal (eat | annonce | boutique). Choisit lecteur + libellé paiement. */
  channel?: CardChannel;
  title: string;
  owner?: string;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
  state?: 'draft' | 'published' | 'archived';
  signature?: string; // arc long : confiance native
  // Clé d'entité = empreinte de dédup (son YouTube, produit, lieu…). Deux partages du
  // MÊME contenu portent la MÊME clé → 1 seule card canonique (page-entité vivante), le
  // 2e partageur devient contributeur. null/absent = contenu perso/original (pas de dédup).
  // Calculée par computeEntityKey() (lib/cards/entity-key.ts). Pascal 2026-07-08.
  entityKey?: string;

  // — Boîte à outils (facettes ; le LECTEUR révèle ce qu'il veut)
  text?: { body?: string };
  images?: string[];
  // `trailer`/`full` = FILM natif vendable : bande-annonce (aperçu gratuit, jouée au feed) +
  // film complet (débloqué à l'achat). `url` reste la vidéo principale (= trailer si présent,
  // sinon full) pour que les lecteurs existants jouent au moins l'aperçu. Pascal 2026-07-17.
  video?: { url?: string; embed?: string; aspect?: string; trailer?: string; full?: string };
  // Toutes les vidéos attachées (multi-clips de l'éditeur) — leurs URLs figurent dans le .card.
  // `video.url` reste la vidéo principale/1re ; `videos` liste TOUT. Pascal 2026-07-12.
  videos?: string[];
  // Rayon audio (son attaché). `embed` = lecteur (iframe YouTube…). Les autres champs
  // portent l'ENRICHISSEMENT natif récupéré au collage (titre, miniature, source, auteur)
  // + `track_id` = lien vers la base music-hub — pour que .card / page individuelle / lecteurs
  // .card-purs gardent la carte riche, pas juste l'embed nu. Pascal 2026-07-12.
  // `url` = MP3 DIRECT uploadé (/uploads) ; `tracks` = ALBUM natif multi-pistes (fichiers uploadés,
  // pochette = images[0]). Le web n'avait que le son YouTube unique ; ceci est l'extension
  // natif-first vendable (marketplace à l'auteur). Pascal 2026-07-17.
  audio?: { embed?: string; title?: string; thumbnail?: string; source_label?: string; author?: string; external_url?: string; track_id?: number;
    url?: string; tracks?: { title: string; artist?: string; url: string; duration?: string }[] };
  // MÉTADONNÉES MUSICALES DDEX-ready (Pascal 2026-07-18). Le .card CONTIENT les standards de
  // l'industrie (ne les remplace pas) : 4 couches distinctes ŒUVRE (ISWC) / ENREGISTREMENT (ISRC) /
  // SORTIE (UPC) + CRÉDITS + DROITS + IDENTIFIANTS. Source unique pour un futur export DDEX ERN
  // vers un agrégateur (Revelator/SonoSuite/FUGA). Cf mémoire benchmark distribution musique.
  music?: {
    work?: { title?: string; version?: string; iswc?: string; language?: string; genre?: string; subgenre?: string;
      writers?: { name: string; role?: string; share?: number }[] };
    recording?: { isrc?: string; artist_main?: string; featured?: string[]; producers?: string[]; mix?: string; master?: string;
      engineer?: string; duration?: string; country?: string; explicit?: boolean; format?: string; sample_rate?: string };
    release?: { type?: 'single' | 'ep' | 'album' | 'compilation'; title?: string; upc?: string; ean?: string; track_no?: number;
      label?: string; distributor?: string; release_date?: string; territories?: string[] };
    rights?: { master_owner?: string; composition_owner?: string; cmo?: string; cmo_id?: string; copyright_c?: string; copyright_p?: string;
      samples_cleared?: boolean; ai_cleared?: boolean; ownership_declared?: boolean };
    ids?: { t2m?: string; ext_dist?: string };
  };
  // Blocs métier TYPÉS des annonces (unification .card, Pascal 2026-07-18) : au lieu de balancer les
  // attributs dans `specs` en vrac, chaque domaine a son bloc de premier ordre (comme `music`). Le
  // lecteur unique s'en sert pour un rendu riche. `vehicle` = Automobile · `property` = Immobilier.
  vehicle?: { type?: string; marque?: string; modele?: string; annee?: string; km?: string; carburant?: string;
    boite?: string; places?: string; etat?: string; rental?: boolean; driver_option?: string };
  property?: { type?: string; transaction?: string; surface?: string; pieces?: string; chambres?: string;
    meuble?: string; etage?: string; rental?: boolean };
  // Publicité (régie) — bloc TYPÉ. La card `pub` est servie par le moteur régie comme bannière+jingle
  // ou pré-roll vidéo ≤10s, JAMAIS mélangée visuellement au feed (cf régie pub). `budget` = payé PaPi.
  pub?: { format?: 'banner' | 'video'; banner?: string; jingle?: string; video?: string; budget?: number;
    target?: { scope?: 'national' | 'region' | 'ville'; zone?: string }; paid?: boolean };
  link?: { url: string; reader?: 'inline' | 'embed' | 'preview' };
  place?: { lat?: number; lng?: number; address?: string };
  // price.live = la valeur est rafraîchie en TEMPS RÉEL via l'API connectée
  // (le fichier .card porte la référence ; le lecteur résout le prix à l'affichage).
  price?: { amount?: number; currency?: string; variants?: string[]; live?: boolean };
  // specs = rayon UNIVERSEL clé→valeur (taille, marque, surface, année, couleur…),
  // valable pour TOUS les types. Un seul emplacement, jamais de champ dédié par type.
  specs?: Record<string, string>;
  // — Commerce (PARTAGÉ eat/annonce/boutique ; lus par le rail de paiement unique)
  deposit?: { amount?: number; currency?: string };   // caution / acompte (escrow)
  stock?: number;                                       // quantité dispo (annonce ou boutique)
  sold?: number;                                        // « N vendus » PUBLIC (social proof) — jamais le nominatif (privé = escrow). Pascal 2026-08-05.
  rating?: { score?: number; count?: number };
  source?: { name?: string; label?: string; icon?: string };

  // — Découverte (Recherche + IA)
  categories?: string[];
  keywords?: string[];
  // #hashtags (sans #, minuscules) et @mentions (pseudos taggés) extraits de la légende à la
  // création — structurés DANS la card pour que la recherche + le tag ne dépendent jamais du
  // texte affiché (tronqué). Pascal 2026-07-12. Voir [[feedback_talk2me_caption_une_ligne]].
  hashtags?: string[];
  mentions?: string[];

  // Article attaché SEUL (≠ produit d'un catalogue boutique). Pascal 2026-07-14 : « si on dit
  // attache article, c'est article » → tap = CET article, pas toute la boutique. Distingue le tap.
  standalone?: boolean;
  // Référence BOUTIQUE attachée à un post (attacher SA boutique) : la vignette montre UNE entrée
  // « boutique » → tap = toute la boutique. Distinct des articles imbriqués. Pascal 2026-07-14.
  shopRef?: { id: string; name?: string; cover?: string };

  // — Contrat d'interaction
  actions?: CardAction[];
  // Card CONTENEUR : des cards EMBARQUÉES (boutique = produits, playlist = sons, formation = modules…).
  items?: SuperCard[];
  // Card SLIDES : un module de formation = un deck de slides (titre + points + illustration).
  slides?: { heading: string; points: string[]; image?: string }[];
  // api = l'action/la valeur live de la card. ref = identifiant/recherche côté fournisseur
  // (ex. provider 'aliexpress' + ref 'écouteurs bluetooth' → prix live résolu à l'affichage).
  api?: { provider?: string; endpoint?: string; ref?: string };

  // — Gouvernance
  visibility?: 'public' | 'friends' | 'private';
  affiliation?: { ownerCut?: number }; // card promue par un user → sa part
  // Référent de la fiche (pointeur dénormalisé, rafraîchi à chaque changement) : qui SERT la fiche
  // maintenant (referent_id, mutable) et qui l'a apportée (apporteur_id, immuable). Le log complet
  // des changements vit dans referent_events ; ici la card porte l'état courant.
  referent?: { referent_id?: string | null; apporteur_id?: string | null };
}

/** Quel écran lit la card, et comment. Le lecteur ne décide QUE ça. */
export type ReadLevel = 'mini' | 'normal' | 'full' | 'inline';
export interface ReadProfile {
  reader: string;            // 'feed' | 'eat' | 'boutique' | ...
  level: ReadLevel;
  // Facettes que CE lecteur affiche (le reste est masqué). Noms : 'media' | 'title' |
  // 'text' | 'price' | 'rating' | 'place' | 'source' | 'actions'. Vide = tout montrer.
  reveal?: string[];
  actions?: CardActionKind[];     // actions exposées
}

/** ID unique (browser + node18+). */
export function newCardId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return 'card_' + c.randomUUID();
  return 'card_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Fabrique une card valide (entête de format posée). */
export function makeCard(input: Partial<SuperCard> & { title: string; types: CardType[] }): SuperCard {
  return {
    format: CARD_FORMAT,
    spec: CARD_SPEC,
    id: input.id || newCardId(),
    version: input.version ?? 1,
    state: input.state ?? 'published',
    ...input,
  };
}

/** Sérialise une card en contenu de fichier `.card` (JSON lisible). */
export function serializeCard(card: SuperCard): string {
  return JSON.stringify(card, null, 2);
}

export interface ParseResult { ok: boolean; card?: SuperCard; reason?: string }

/** Lit un fichier `.card`. Vérifie l'entête de format + le minimum vital. */
export function parseCard(text: string): ParseResult {
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { return { ok: false, reason: 'json_invalide' }; }
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'pas_un_objet' };
  const c = obj as Partial<SuperCard>;
  if (c.format !== CARD_FORMAT) return { ok: false, reason: 'format_inconnu (attendu t2m.card)' };
  if (typeof c.spec !== 'number') return { ok: false, reason: 'spec_manquante' };
  // Le titre est OPTIONNEL : une vidéo/photo/texte n'a pas forcément de titre.
  if (!c.id || !Array.isArray(c.types)) return { ok: false, reason: 'champs_obligatoires_manquants (id/types)' };
  return { ok: true, card: c as SuperCard };
}
