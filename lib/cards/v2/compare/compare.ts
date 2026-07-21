/**
 * lib/cards/v2/compare — LE COMPARATEUR (P2, filet de sécurité de la migration).
 *
 * Refonte SuperCard (étape 6, Phase B). Pas un affichage côte à côte : un DIFF OBJECTIF, avec
 * VERDICT MACHINE. Pour une même carte source (spec:1), il produit :
 *   • la PROJECTION LEGACY = reproduction fidèle des règles d'affichage actuelles
 *     (backend `cardToFeedItem` + natif `_mapDev` : badge, libellé d'action, cover, prix) ;
 *   • le NOUVEAU ViewModel = `renderCard(convertV1toV2(carte), contexte)`.
 * Puis il DIFFE dimension par dimension (titre, cover, badge, action, prix, nb médias).
 * Un écart = drapeau ⇒ la bascille d'une surface ne se fait pas tant qu'un écart n'est pas
 * expliqué (correction voulue) ou corrigé (régression). Pur (browser-safe).
 */
import { convertV1toV2 } from '../convert';
import { renderCard, type ReadContext, type Overlay } from '../reader/reader';
import { defaultReaderServices } from '../reader/services';

type V1 = Record<string, any>;

export interface DimDiff { dim: string; legacy: string | number | null; next: string | number | null; match: boolean; note?: string }
export interface CompareReport { id: string; context: ReadContext; verdict: 'identique' | 'ecart'; diffs: DimDiff[] }

// ── Projection LEGACY (reproduction des règles d'affichage actuelles) ──
function legacyBadge(v1: V1): string | null {
  const types: string[] = Array.isArray(v1?.types) ? v1.types : [];
  if (v1?.audio?.embed || v1?.audio?.tracks?.length) return 'SON';
  if (types.includes('album')) return 'ALBUM';
  if (types.includes('film')) return 'FILM';
  if (types.includes('pub') || v1?.channel === 'ad') return 'PUB';
  if (v1?.channel === 'eat') return 'PLAT MAISON';        // ⚠ legacy conflait resto & plat maison
  if (v1?.channel === 'boutique') return 'BOUTIQUE';
  if (types.length) return String(types[0]).toUpperCase();
  return null;
}
function legacyCover(v1: V1): string | null { return v1?.video?.url || v1?.images?.[0] || null; }
function legacyActionLabel(v1: V1): string | null { return v1?.actions?.[0]?.label ?? null; }
function legacyPrice(v1: V1): string | null {
  const p = v1?.price;
  if (!p || typeof p.amount !== 'number') return null;
  const sym = (p.currency === 'MGA' || p.currency === 'Ar' || !p.currency) ? 'Ar' : String(p.currency);
  return `${Math.round(p.amount).toLocaleString('fr-FR').replace(/ /g, ' ')} ${sym}`;
}
function legacyMediaCount(v1: V1): number {
  let n = Array.isArray(v1?.images) ? v1.images.length : 0;
  if (v1?.video?.url) n++;
  if (Array.isArray(v1?.videos)) n += v1.videos.filter((u: any) => u && u !== v1?.video?.url).length;
  if (v1?.audio?.url) n++;
  if (v1?.audio?.embed) n++;
  if (Array.isArray(v1?.audio?.tracks)) n += v1.audio.tracks.length;
  return n;
}

function legacyActionsAll(v1: V1): string | null {
  const a = Array.isArray(v1?.actions) ? v1.actions.map((x: any) => x?.label).filter(Boolean) : [];
  return a.length ? a.join(' | ') : null;
}

/** Note explicative des écarts ATTENDUS (corrections voulues, pas régressions). */
function knownCorrection(dim: string, v1: V1): string | undefined {
  if (dim === 'badge' && v1?.channel === 'eat')
    return 'correction voulue : le badge vient désormais du kind/categories (fin de la confusion resto/plat maison)';
  if (dim === 'badge' && v1?.channel === 'boutique' && !(Array.isArray(v1?.items) && v1.items.length))
    return 'correction voulue : un produit seul porte le badge PRODUIT (il n\'est pas une boutique — il y est vendu)';
  return undefined;
}

/**
 * Compare une carte legacy (spec:1) : projection legacy vs nouveau ViewModel, pour un contexte.
 * COUVERTURE : titre, cover, badge, action primaire, TOUTES les actions, prix, nb_medias, enfants.
 * NON couvert (à garder en tête) : offer (concept neuf, pas dans le legacy), blocs typés, discovery,
 * place, stock, tone du badge. La validité DOCTRINE (devise étrangère, champ maison…) relève du
 * VALIDATEUR, pas du comparateur.
 */
export function compareCard(v1: V1, context: ReadContext = 'feed', overlay: Overlay = {}): CompareReport {
  const converted = convertV1toV2(v1);
  const view = renderCard(converted, context, overlay, defaultReaderServices);
  const nextAction = (view.actions.find((a) => a.priority === 'primary') || view.actions[0])?.label ?? null;
  const nextActionsAll = (converted.actions || []).map((a) => a.label).join(' | ') || null;

  const dims: Array<{ dim: string; legacy: string | number | null; next: string | number | null }> = [
    { dim: 'titre', legacy: v1?.title ?? null, next: view.title ?? null },
    { dim: 'cover', legacy: legacyCover(v1), next: view.media[0]?.url ?? null },
    { dim: 'badge', legacy: legacyBadge(v1), next: view.badge?.label ?? null },
    { dim: 'action', legacy: legacyActionLabel(v1), next: nextAction },
    { dim: 'actions_all', legacy: legacyActionsAll(v1), next: nextActionsAll },
    { dim: 'prix', legacy: legacyPrice(v1), next: view.priceDisplay ?? null },
    // M3 : grandeurs HOMOGÈNES — total des médias de part et d'autre (pas la sélection contextuelle).
    { dim: 'nb_medias', legacy: legacyMediaCount(v1), next: (converted.media || []).length },
    { dim: 'nb_enfants', legacy: Array.isArray(v1?.items) ? v1.items.length : 0, next: (converted.items || []).length },
  ];

  const diffs: DimDiff[] = dims.map(({ dim, legacy, next }) => {
    const match = normalize(legacy) === normalize(next);
    const d: DimDiff = { dim, legacy, next, match };
    if (!match) { const note = knownCorrection(dim, v1); if (note) d.note = note; }
    return d;
  });

  return { id: String(v1?.id ?? ''), context, verdict: diffs.every((d) => d.match) ? 'identique' : 'ecart', diffs };
}

// Compare en ignorant les VARIANTES d'espaces (insécable fin U+202F/U+00A0 de toLocaleString) —
// une différence d'espacement n'est PAS une différence de contenu.
function normalize(v: string | number | null): string { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }

/** Rendu texte d'un rapport (pour logs/CI). */
export function formatReport(r: CompareReport): string {
  const head = `[${r.verdict === 'identique' ? '✓ IDENTIQUE' : '✗ ÉCART'}] card ${r.id} (contexte ${r.context})`;
  const lines = r.diffs.map((d) => {
    const flag = d.match ? '  ✓' : '  ✗';
    const base = `${flag} ${d.dim.padEnd(9)} legacy=${JSON.stringify(d.legacy)}  next=${JSON.stringify(d.next)}`;
    return d.note ? `${base}\n       ↳ ${d.note}` : base;
  });
  return [head, ...lines].join('\n');
}

/** Batch : compare une liste de cartes, renvoie le rapport + le compte d'écarts (verdict CI). */
export function compareBatch(cards: V1[], context: ReadContext = 'feed'): { reports: CompareReport[]; ecarts: number } {
  const reports = cards.map((c) => compareCard(c, context));
  return { reports, ecarts: reports.filter((r) => r.verdict === 'ecart').length };
}
