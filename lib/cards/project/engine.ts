/**
 * lib/cards/project/engine — DISCOVERY ENGINE générique (Pascal 2026-07-21, archi V1 gelée).
 *
 * Moteur UNIVERSEL de création collaborative : Demande (`Need`) ↔ Offre (`Candidate`), résolu en
 * DESCENDANT une échelle de certitude : asset → resource → opportunity → mission (dernier recours).
 * Le cinéma n'est qu'un DOMAINE (domains/film.ts) — LE CŒUR NE CONNAÎT RIEN AU CINÉMA. Chaque
 * ajout ici doit rester générique (film = premier consommateur, pas le sujet).
 *
 * Raisonnement par CAPACITÉ (décision figée) : `need.kind` = tag de capacité requise ; une carte
 * répond si `need.kind ∈ capabilitiesOf(carte)`. `capabilitiesOf` est DÉRIVÉE des faits de la carte
 * (kind + facets + blocs + hint) — c'est LE point d'extension pour une future taxonomie (V2).
 *
 * Pur (browser-safe) : AUCUNE I/O. L'API fournit les pools d'offre et persiste les cartes produites.
 * Argent : jamais de {amount,currency} ici — la mission naît en `revenue_share` (aucun paiement
 * immédiat) ; la répartition passe par affiliation/escrow existants.
 */
import type { SuperCardV2, ProjectBlock, ProjectNeed, NeedCandidate } from '../v2/types';

/* ─────────────────────────── Capacités (dérivation générique) ───────────────────────────
 * Map kind/facette/bloc → capacités. GÉNÉRIQUE (kinds de plateforme, pas de cinéma).
 * Étendre ICI (ou via un hint `resource.capabilities`), jamais dans le schéma. */
const KIND_CAPABILITIES: Record<string, string[]> = {
  restaurant: ['location', 'catering', 'event_space', 'partner'],
  place: ['location', 'event_space'],
  room: ['location', 'event_space'],
  property: ['location', 'venue'],
  audio: ['soundtrack', 'sound'],
  album: ['soundtrack'],
  formation: ['training', 'expertise'],
  product: ['equipment', 'prop'],
  boutique: ['equipment', 'prop'],
  video: ['footage'],
  image: ['visual_asset'],
  profile: ['person'],
};
const FACET_CAPABILITIES: Record<string, string[]> = {
  place: ['location'], property: ['location', 'venue'], vehicle: ['vehicle', 'transport'],
  audio: ['soundtrack'], video: ['footage'], image: ['visual_asset'],
};

/** Capacités d'une carte = ce qu'elle SAIT FAIRE, dérivé de ses faits. Point d'extension V2. */
export function capabilitiesOf(card: Partial<SuperCardV2>): string[] {
  const caps = new Set<string>();
  const add = (c?: string | string[]) => {
    if (Array.isArray(c)) c.forEach((x) => x && caps.add(x));
    else if (c) caps.add(c);
  };
  add(KIND_CAPABILITIES[card.kind ?? '']);
  (card.facets ?? []).forEach((f) => add(FACET_CAPABILITIES[f]));
  // hint explicite (bloc resource) + son kind = tag de capacité
  add(card.resource?.capabilities);
  add(card.resource?.kind);
  // présence de blocs métier = capacités
  if (card.place) add('location');
  if (card.food) add('catering');
  if (card.music) add('soundtrack');
  if (card.vehicle) add(['vehicle', 'transport']);
  if (card.property) add(['location', 'venue']);
  return [...caps];
}

/* ─────────────────────────── Domaines pluggables (need detection) ─────────────────────── */

export interface DomainAdapter {
  domain: string;                                   // 'film' | 'album' | 'event' | …
  detectNeeds(project: ProjectBlock): ProjectNeed[]; // faits de domaine → besoins (tags de capacité)
}

const ADAPTERS = new Map<string, DomainAdapter>();
/** Un domaine s'enregistre (film.ts, album.ts…). Le cœur ne référence AUCUN domaine en dur. */
export function registerDomain(a: DomainAdapter): void { ADAPTERS.set(a.domain, a); }
export function getDomain(domain: string): DomainAdapter | undefined { return ADAPTERS.get(domain); }
/** Détecte les besoins d'un projet via l'adaptateur de son domaine. Générique. */
export function detectNeeds(project: ProjectBlock): ProjectNeed[] {
  const a = ADAPTERS.get(project.domain ?? '');
  return a ? a.detectNeeds(project) : [];
}

/* ─────────────────────────── Résolution d'un besoin (l'échelle) ─────────────────────────── */

/** Une opportunité = un LEAD détecté (carte existante OU signal externe volatil). Pas une carte autorée. */
export interface OpportunitySignal {
  ref?: string;              // id opaque d'une carte existante (place/partenaire…)
  external_ref?: string;     // signal volatil (météo, événement…) — jamais figé dans la carte
  capabilities: string[];    // ce que le lead sait faire
  score?: number;            // 0–100
  quantity?: number;
}

/** Pools d'offre fournis par l'API (le moteur ne fait aucune I/O). */
export interface SupplyPools {
  assets?: SuperCardV2[];        // actifs finis réutilisables (musique, 3D, LUT, formation…)
  resources?: SuperCardV2[];     // cartes `resource` (offre vivante)
  opportunities?: OpportunitySignal[];
}

export interface ResolveOptions {
  owner: string;                 // owner OPAQUE du projet (porteur de la mission résiduelle)
  projectCardId: string;
  now?: number;                  // horodatage injecté (moteur pur : pas de Date.now())
}

export interface ResolveResult {
  candidates: NeedCandidate[];
  updatedNeed: ProjectNeed;      // avec quantity.filled + status + candidates[]
  mission?: SuperCardV2;         // carte `mission` créée UNIQUEMENT pour le résidu
}

const norm = (s?: string): string => (s ?? '').trim().toLocaleLowerCase('fr-FR');
const clampScore = (x: number): number => Math.max(0, Math.min(100, Math.round(x)));
const hasCap = (need: ProjectNeed, caps: string[]): boolean => caps.map(norm).includes(norm(need.kind));

function matchScore(need: ProjectNeed, card: Partial<SuperCardV2>): number {
  let s = 50;
  const loc = norm(need.location);
  if (loc && (norm(card.place?.city) === loc || norm(card.resource?.location) === loc)) s += 25;
  // capacité EXPLICITEMENT nommée (hint) = plus sûr qu'une capacité seulement dérivée
  if ((card.resource?.capabilities ?? []).map(norm).includes(norm(need.kind))) s += 15;
  return clampScore(s);
}

/**
 * Résout un besoin en descendant l'échelle de certitude. asset+resource RÉDUISENT le résidu ;
 * opportunity est SURFACÉE (lead à convertir) mais ne réduit PAS le résidu (offre non sécurisée) ;
 * mission créée seulement pour ce qui reste. Retourne les candidats + le besoin mis à jour + la mission.
 */
export function resolveNeed(need: ProjectNeed, pools: SupplyPools, opts: ResolveOptions): ResolveResult {
  const required = need.quantity?.required ?? 1;
  const filled0 = need.quantity?.filled ?? 0;
  let filled = filled0;
  const candidates: NeedCandidate[] = [];

  // 1) ASSETS — fini, réutilisable, le plus sûr (non-rival ; 1 apport par asset compatible).
  for (const a of pools.assets ?? []) {
    if (filled >= required) break;
    if (!hasCap(need, capabilitiesOf(a))) continue;
    candidates.push({ provenance: 'asset', ref: a.id, status: 'linked', score: matchScore(need, a), quantity: 1 });
    filled += 1;
  }

  // 2) RESOURCES — offre vivante réservable ; classées par score ; comblent la quantité.
  const ranked = (pools.resources ?? [])
    .filter((r) => hasCap(need, capabilitiesOf(r)))
    .map((r) => ({ r, score: matchScore(need, r) }))
    .sort((x, y) => y.score - x.score);
  for (const { r, score } of ranked) {
    if (filled >= required) break;
    const avail = r.resource?.quantity_available ?? 1;
    const q = Math.min(required - filled, avail);
    if (q <= 0) continue;
    candidates.push({ provenance: 'resource', ref: r.id, status: 'suggested', score, quantity: q });
    filled += q;
  }

  // 3) OPPORTUNITIES — leads détectés, surfacés mais NON comptés dans le résidu (à convertir).
  for (const o of pools.opportunities ?? []) {
    if (!o.capabilities.map(norm).includes(norm(need.kind))) continue;
    if (!o.ref && !o.external_ref) continue; // une arête doit pointer quelque chose
    candidates.push({
      provenance: 'opportunity',
      ...(o.ref ? { ref: o.ref } : { external_ref: o.external_ref }),
      status: 'detected',
      score: clampScore(o.score ?? 50),
      ...(o.quantity !== undefined ? { quantity: o.quantity } : {}),
    });
  }

  // 4) MISSION — uniquement pour le résidu (dernier recours).
  const remaining = Math.max(0, required - filled);
  const updatedNeed: ProjectNeed = {
    ...need,
    quantity: { ...(need.quantity ?? {}), required, filled },
    status: remaining === 0 ? 'matched' : filled > filled0 ? 'partially_filled' : 'mission_open',
  };

  let mission: SuperCardV2 | undefined;
  if (remaining > 0) {
    mission = createMissionCard(need, remaining, opts);
    candidates.push({ provenance: 'mission', ref: mission.id, status: 'open', quantity: remaining });
  }
  updatedNeed.candidates = candidates;
  return { candidates, updatedNeed, mission };
}

/** Fabrique une carte `mission` spec:2 valide pour le résidu. revenue_share par défaut, AUCUN argent. */
export function createMissionCard(need: ProjectNeed, remaining: number, opts: ResolveOptions): SuperCardV2 {
  const now = opts.now ?? 0;
  const safeNeed = need.id.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const card: SuperCardV2 = {
    format: 't2m.card', spec: 2,
    id: `mission_${opts.projectCardId}_${safeNeed}`,
    kind: 'mission',
    owner: opts.owner,
    status: 'published',
    visibility: 'public',
    created_at: now,
    updated_at: now,
    title: need.title ?? `Besoin : ${need.kind}`,
    actions: [{ kind: 'apply', label: 'Participer', priority: 'primary' }],
    mission: {
      project_card_id: opts.projectCardId,
      need_id: need.id,
      kind: need.kind,
      quantity_required: remaining,
      quantity_filled: 0,
      ...(need.location ? { location: need.location } : {}),
      compensation: { mode: 'revenue_share' }, // défaut : aucun paiement immédiat
      applications: [],
      state: 'open',
    },
  };
  if (need.description) card.text = { body: need.description };
  return card;
}
