/**
 * lib/cards/v2/reader/services — SERVICES MÉTIER PARTAGÉS du lecteur unique.
 *
 * Refonte SuperCard (étape 6, Phase A). Le lecteur (reader.ts) NE contient PAS de logique
 * métier : il APPELLE ces services. C'est le garde-fou anti « god-object » (L2) — la logique
 * (formatage prix, dispo, permissions, présentation dérivée) vit ICI, une seule fois, et sert
 * TOUS les contextes.
 *
 * Frontière ARGENT (L5/G4) : `formatDisplay` = affichage seulement ; `payableTotal` est une
 * AUTORITÉ SERVEUR — l'implémentation cliente REFUSE de le calculer (jamais de montant à
 * débiter côté client). Pur (browser-safe) sauf indication contraire.
 */
import type { SuperCardV2, Money, CardActionV2 } from '../types';

// ── Présentation DÉRIVÉE (fonction pure de la donnée — étape 4, tue le bug badge Eat≠hub) ──
export interface DerivedBadge { label: string; tone?: string }

/** Le badge est UNE fonction pure de la carte, calculée à UN seul endroit (jamais par module). */
export function deriveBadge(card: SuperCardV2): DerivedBadge | undefined {
  // défensif : une carte non validée pourrait avoir des categories non-string → ne pas crasher.
  const cats = (Array.isArray(card.categories) ? card.categories : []).filter((c): c is string => typeof c === 'string').map((c) => c.toLowerCase());
  if (card.kind === 'restaurant' || card.food || cats.includes('plat')) {
    // « plat maison » vs resto : distinction par la présence du bloc food + catégorie.
    if (cats.includes('plat') || card.food) return { label: 'PLAT MAISON', tone: 'food' };
    return { label: 'RESTAURANT', tone: 'food' };
  }
  if (card.kind === 'boutique') return { label: 'BOUTIQUE', tone: 'shop' };
  // Un produit SEUL porte sa propre famille « PRODUIT » (il n'est pas une boutique — il y est vendu). Pascal (b).
  if (card.kind === 'product') return { label: 'PRODUIT', tone: 'product' };
  if (card.kind === 'pub') return { label: 'PUB', tone: 'ad' };
  if (card.kind === 'album') return { label: 'ALBUM', tone: 'media' };
  if (card.kind === 'film') return { label: 'FILM', tone: 'media' };
  if (card.kind === 'listing') return { label: 'ANNONCE', tone: 'listing' };
  if (card.kind === 'story') return { label: 'STORY', tone: 'ephemeral' };
  if (card.kind === 'video' || card.kind === 'film') return { label: 'VIDÉO', tone: 'media' };
  if (card.kind === 'audio' || card.facets?.includes('audio')) return { label: 'SON', tone: 'media' };
  // Cycle de vie de création (Pascal 2026-07-21) — badge dérivé du kind, comme les autres.
  if (card.kind === 'project') return { label: 'EN PROJET', tone: 'project' };
  if (card.kind === 'mission') return { label: 'MISSION', tone: 'mission' };
  if (card.kind === 'resource') return { label: 'RESSOURCE', tone: 'resource' };
  // Les autres kinds (image, article, post, profile…) n'ont pas de badge : le contenu se suffit.
  return undefined;
}

// ── Progression DÉRIVÉE (fonction pure — sert project / mission / resource, undefined sinon) ──
export interface DerivedProgress {
  label: string;                                    // ex. « Préparation · storyboard validé · besoins 40% »
  lifecycle?: string;                               // project.lifecycle
  needs?: { total: number; open: number; filledRatio: number };
}

const LIFECYCLE_LABEL: Record<string, string> = {
  idea: 'Idée', writing: 'Écriture', preproduction: 'Préparation',
  shooting: 'Tournage', postproduction: 'Post-production', ready: 'Prêt',
};

/** Progression d'une œuvre-en-projet, dérivée des faits du bloc (jamais stockée). */
export function deriveProgress(card: SuperCardV2): DerivedProgress | undefined {
  if (card.project) {
    const p = card.project;
    const needs = Array.isArray(p.needs) ? p.needs : [];
    let req = 0, fil = 0, open = 0;
    for (const n of needs) {
      const r = n.quantity?.required ?? 1;
      const f = Math.min(n.quantity?.filled ?? 0, r);
      req += r; fil += f;
      if (n.status === 'mission_open' || f < r) open++;
    }
    const ratio = req > 0 ? fil / req : needs.length ? 0 : 1;
    const approved = (Array.isArray(p.approvals) ? p.approvals : []).filter((a) => a.state === 'approved' || a.state === 'locked').map((a) => a.stage);
    const parts = [
      LIFECYCLE_LABEL[p.lifecycle ?? ''],
      approved.length ? `${approved[approved.length - 1]} validé` : undefined,
      needs.length ? `besoins ${Math.round(ratio * 100)}%` : undefined,
    ].filter((x): x is string => !!x);
    return { label: parts.join(' · ') || 'En projet', lifecycle: p.lifecycle, needs: { total: needs.length, open, filledRatio: ratio } };
  }
  if (card.mission) {
    const req = card.mission.quantity_required ?? 0;
    const fil = card.mission.quantity_filled ?? 0;
    const ratio = req > 0 ? Math.min(fil, req) / req : 0;
    return { label: req ? `${fil}/${req} pourvus` : card.mission.state ?? 'ouverte', needs: { total: 1, open: fil < req ? 1 : 0, filledRatio: ratio } };
  }
  if (card.resource) {
    const q = card.resource.quantity_available;
    return { label: typeof q === 'number' ? `${q} ${card.resource.unit ?? 'dispo'}` : 'disponible' };
  }
  return undefined;
}

// ── Service ARGENT ──
export interface MoneyService {
  /** Formate un montant pour l'AFFICHAGE (jamais stocké). MGA → « 45 000 Ar ». */
  formatDisplay(price: Money): string;
  /**
   * Montant réellement à débiter (livraison, frais, remise, escrow…). AUTORITÉ SERVEUR.
   * L'implémentation cliente DOIT refuser (G4 : jamais un montant à payer côté client).
   */
  payableTotal(order: unknown): Promise<Money>;
}

/** Implémentation cliente/affichage : formate, mais REFUSE de calculer un total à payer. */
export const displayMoney: MoneyService = {
  formatDisplay(price: Money): string {
    const symbol = price.currency === 'MGA' ? 'Ar' : price.currency;
    const grouped = Math.round(price.amount).toLocaleString('fr-FR').replace(/ /g, ' ');
    return `${grouped} ${symbol}`;
  },
  async payableTotal(): Promise<Money> {
    throw new Error('payableTotal = AUTORITÉ SERVEUR (G4/L5) : un montant à débiter ne se calcule jamais côté client.');
  },
};

// ── Service DISPONIBILITÉ ──
export interface AvailabilityService {
  /** true / false connus, ou 'server' quand la vérité est temps réel (planning, stock live). */
  status(card: SuperCardV2): true | false | 'server';
}
export const defaultAvailability: AvailabilityService = {
  status(card: SuperCardV2): true | false | 'server' {
    if (card.availability) return 'server';                 // planning référencé → vérif serveur
    if (typeof card.stock === 'number') return card.stock > 0 ? true : false;
    return true;
  },
};

// ── Service PERMISSIONS (dépend de l'utilisateur courant → contexte, jamais dans la carte) ──
export interface PermissionService {
  /** L'utilisateur courant peut-il exécuter cette action sur cette carte ? (A4 : gating hors carte) */
  can(action: CardActionV2, card: SuperCardV2): boolean;
}
export const permissiveDefault: PermissionService = {
  can(): boolean { return true; },
};

/** Le sac de services passé au lecteur. Un contexte serveur injectera des impls serveur. */
export interface ReaderServices {
  money: MoneyService;
  availability: AvailabilityService;
  permissions: PermissionService;
}

/** Services par défaut, côté affichage/client (argent-débit interdit). */
export const defaultReaderServices: ReaderServices = {
  money: displayMoney,
  availability: defaultAvailability,
  permissions: permissiveDefault,
};
