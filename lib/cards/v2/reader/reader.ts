/**
 * lib/cards/v2/reader/reader — LE LECTEUR UNIQUE (squelette, étape 6 Phase A).
 *
 * Un SEUL lecteur, paramétré par le CONTEXTE (L1). Il ne peint pas de pixels : il INTERPRÈTE
 * une SuperCard (spec:2) + un contexte + un overlay en un `CardView` (ViewModel déclaratif)
 * que l'UI (web ou natif) peint ensuite. Pas de `switch(type)` : le comportement vient
 * d'une STRATÉGIE DE CONTEXTE + de la DONNÉE de la carte (kind/facets/blocs), jamais d'un
 * `if module`. Toute logique métier est déléguée aux SERVICES partagés (services.ts, L2).
 *
 * Les 4 étages du pipeline (étape 4) : résolution du contexte → sélection → présentation
 * (dérivée une fois + déclarée) → composition. Pur (browser-safe).
 */
import type { SuperCardV2, MediaElement, ItemElement, CardActionV2 } from '../types';
import { deriveBadge, deriveProgress, deriveLayout, defaultReaderServices, type ReaderServices, type DerivedBadge, type DerivedProgress, type CardLayout } from './services';
import { maskContactInfo } from '@/lib/cards/contact-guard';

/** Contextes NOMMÉS (liste OUVERTE — L8 : un nouveau contexte = une stratégie, jamais une modif carte). */
export type ReadContext =
  | 'feed' | 'chat' | 'full' | 'preview' | 'purchase' | 'checkout'
  | 'live' | 'escrow' | 'library' | 'search' | 'seo' | (string & {});

/** Données VOLATILES injectées au rendu (jamais dans la carte — L3). */
export interface Overlay {
  distance_m?: number;
  online?: boolean;
  live?: boolean;
  favorite?: boolean;
  remaining?: number;                 // « reste N » temps réel
  payableTotalDisplay?: string;       // total à payer (déjà calculé SERVEUR) — affichage seul
  permissions?: Record<string, boolean>;
}

export interface ActionView { kind: CardActionV2['kind']; label: string; priority: 'primary' | 'secondary'; enabled: boolean }
export interface ChildView {
  role: ItemElement['role'];
  carrier: ItemElement['carrier'];
  view?: CardView;                    // enfant carte inline rendu (récursif)
  ref?: string;                       // enfant carte référencé (à résoudre par l'appelant)
  // aperçu = cache d'affichage : le prix y est une CHAÎNE (jamais un montant numérique payable — C4/L5).
  preview?: { title?: string; cover?: string; priceDisplay?: string };
  primitive_type?: ItemElement['primitive_type'];
  content?: Record<string, unknown>;
}

/** Le ViewModel : ce que l'UI doit peindre pour CE contexte. Déclaratif, sans pixels. */
export interface CardView {
  context: ReadContext;
  id: string;
  kind: string;
  badge?: DerivedBadge;               // dérivé UNE fois (jamais par module)
  layout?: CardLayout;                // archétype de rendu dérivé du .card (brique du feed niveau 2)
  progress?: DerivedProgress;         // œuvre-en-projet : progression dérivée (undefined sinon)
  title?: string;
  body?: string;
  media: MediaElement[];              // sélectionnés/ordonnés pour le contexte
  priceDisplay?: string;             // formaté pour l'affichage (jamais un montant à débiter)
  actions: ActionView[];             // déclarées, filtrées par contexte, activées par permissions
  children?: ChildView[];            // composition rendue par role × contexte
  overlayBadges?: string[];          // distance/online/reste N (volatile)
}

/** Ce qu'un contexte SÉLECTIONNE. Piloté par le contexte, PAS par le type de la carte. */
interface ContextStrategy {
  media: 'cover' | 'all';            // vignette vs galerie complète
  body: 'none' | 'excerpt' | 'full';
  actions: 'primary' | 'all';
  children: boolean;
}

/** Registre des stratégies par contexte (L1 : stratégies d'UN lecteur, pas des lecteurs séparés). */
const STRATEGIES: Record<string, ContextStrategy> = {
  feed:     { media: 'cover', body: 'excerpt', actions: 'primary', children: false },
  chat:     { media: 'cover', body: 'excerpt', actions: 'primary', children: false },
  search:   { media: 'cover', body: 'none',    actions: 'primary', children: false },
  seo:      { media: 'all',   body: 'full',    actions: 'primary', children: false },
  full:     { media: 'all',   body: 'full',    actions: 'all',     children: true  },
  preview:  { media: 'all',   body: 'full',    actions: 'all',     children: true  }, // = rendu réel de la cible (L7)
  purchase: { media: 'all',   body: 'excerpt', actions: 'all',     children: true  },
  checkout: { media: 'cover', body: 'none',    actions: 'primary', children: true  },
  live:     { media: 'cover', body: 'none',    actions: 'primary', children: false },
  escrow:   { media: 'cover', body: 'none',    actions: 'primary', children: false },
  library:  { media: 'cover', body: 'excerpt', actions: 'primary', children: false },
};
const DEFAULT_STRATEGY: ContextStrategy = STRATEGIES.full;

const EXCERPT_LEN = 140;

/** LE point d'entrée du lecteur unique. */
export function renderCard(
  card: SuperCardV2,
  context: ReadContext,
  overlay: Overlay = {},
  services: ReaderServices = defaultReaderServices,
): CardView {
  // 1) Résolution du contexte
  const strat = STRATEGIES[context] || DEFAULT_STRATEGY;

  // 2) Sélection + 3) Présentation (dérivée une fois + déclarée) + 4) Composition
  const media = selectMedia(card.media || [], strat.media);
  const view: CardView = {
    context, id: card.id, kind: card.kind,
    badge: deriveBadge(card),                         // dérivé UNE fois, jamais par module
    media,
    actions: selectActions(card.actions || [], strat.actions, card, services),
  };

  view.layout = deriveLayout(card);                // archétype de rendu : dérivé UNE fois (feed niveau 2)

  const progress = deriveProgress(card);           // œuvre-en-projet : dérivée une fois, undefined sinon
  if (progress) view.progress = progress;

  // Anti-désintermédiation [[feedback_anti_desintermediation]] : on MASQUE tout numéro de téléphone
  // glissé dans le titre/corps (fuite hors app = perte commission+escrow). Masquage à l'AFFICHAGE,
  // le .card garde l'original (preuve/modération). Jamais de reformatage [[feedback_no_phone_transform]].
  if (card.title) view.title = maskContactInfo(card.title);
  const body = card.text?.body;
  if (body && strat.body !== 'none') view.body = maskContactInfo(strat.body === 'excerpt' ? excerpt(body) : body);

  if (card.price) {
    // Affichage : prix d'offre formaté. Le TOTAL à payer vient de l'overlay (calculé SERVEUR).
    view.priceDisplay = context === 'checkout' && overlay.payableTotalDisplay
      ? overlay.payableTotalDisplay
      : services.money.formatDisplay(card.price);
  }

  if (strat.children && card.items?.length) {
    const ordered = card.items.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); // respecter `order`
    view.children = ordered.map((it) => renderChild(it, context, services));
  }

  const ob = overlayBadges(overlay);
  if (ob.length) view.overlayBadges = ob;

  return view;
}

// ── Étages internes ──
function selectMedia(media: MediaElement[], mode: 'cover' | 'all'): MediaElement[] {
  if (mode === 'all') return media;
  const cover = media.find((m) => m.role === 'cover') || media[0];
  return cover ? [cover] : [];
}

function selectActions(actions: CardActionV2[], mode: 'primary' | 'all', card: SuperCardV2, services: ReaderServices): ActionView[] {
  const chosen = mode === 'primary'
    ? actions.filter((a) => a.priority === 'primary').slice(0, 1)
    : actions;
  const list = chosen.length ? chosen : actions.slice(0, 1); // toujours au moins l'action principale
  return list.map((a) => ({
    kind: a.kind,
    label: a.label,                                  // LU tel quel — jamais recalculé (P5)
    priority: a.priority || 'secondary',
    enabled: services.permissions.can(a, card),      // A4 : gating hors carte, décidé au contexte
  }));
}

function renderChild(it: ItemElement, context: ReadContext, services: ReaderServices): ChildView {
  const base: ChildView = { role: it.role, carrier: it.carrier };
  if (it.carrier === 'card') {
    // L'enfant ne reçoit PAS l'overlay du parent (distance/total/… sont propres à la carte racine — C3/F7).
    if (it.mode === 'inline' && it.card) base.view = renderCard(it.card, context, {}, services);
    else if (it.mode === 'ref') {
      base.ref = it.ref;
      // aperçu dénormalisé : le prix devient une CHAÎNE d'affichage (jamais un montant payable — C4/L5).
      if (it.preview) base.preview = { title: it.preview.title, cover: it.preview.cover, ...(it.preview.price ? { priceDisplay: services.money.formatDisplay(it.preview.price) } : {}) };
    }
  } else if (it.carrier === 'primitive') {
    base.primitive_type = it.primitive_type;
    base.content = it.content;
  }
  return base;
}

function excerpt(s: string): string {
  const chars = Array.from(s); // par POINT DE CODE : ne casse pas une paire de substitution (emoji)
  if (chars.length <= EXCERPT_LEN) return s;
  let cut = chars.slice(0, EXCERPT_LEN - 1).join('');
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > (EXCERPT_LEN - 1) * 0.6) cut = cut.slice(0, lastSpace); // couper sur une frontière de mot
  return cut.trimEnd() + '…';
}

/** Fusion carte + overlay (L3) : les données volatiles deviennent des badges d'affichage. */
function overlayBadges(o: Overlay): string[] {
  const out: string[] = [];
  if (o.online) out.push('en ligne');
  if (o.live) out.push('LIVE');
  if (typeof o.distance_m === 'number') out.push(o.distance_m < 1000 ? `${Math.round(o.distance_m)} m` : `${(o.distance_m / 1000).toFixed(1)} km`);
  if (typeof o.remaining === 'number') out.push(o.remaining > 0 ? `reste ${o.remaining}` : 'épuisé');
  if (o.favorite) out.push('❤');
  return out;
}

/** Liste des contextes connus (la liste reste OUVERTE — L8). */
export const KNOWN_CONTEXTS = Object.keys(STRATEGIES);
