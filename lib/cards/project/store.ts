import 'server-only';
/**
 * lib/cards/project/store — persistance des cartes du cycle de vie de création (Pascal 2026-07-21).
 *
 * Réutilise le VRAI stockage `.card` durable (`writeCardFile` spec-aware, `data/cards/`) — pas de
 * store parallèle. Une carte spec:2 est VALIDÉE par le rempart canonique avant écriture. Le lecteur
 * unique (`renderCard`) reste seul maître du rendu.
 */
import { randomUUID } from 'crypto';
import { writeCardFile, readCardFileV2, listCardFiles, deleteCardFile, CardValidationError } from '../card-file';
import { validateCard } from '../v2/validate';
import type { SuperCardV2, ProjectBlock } from '../v2/types';

const now = (): number => Date.now();

export interface NewProjectInput {
  owner: string;                 // id OPAQUE
  domain: string;                // film | album | event | other
  title: string;
  idea?: string;
  intent?: string;
  source_card_id?: string;
  // Contraintes RÉELLES du créateur (le producteur-IA ne propose que du RÉALISABLE avec ça).
  constraints?: { locations?: string[]; people?: number; devices?: number; target_duration_ms?: number };
  film?: Record<string, unknown>;
}

/** Construit une carte `project` spec:2 neuve (id namespacé `project_…`). */
export function buildProjectCard(input: NewProjectInput): SuperCardV2 {
  const t = now();
  const project: ProjectBlock = { domain: input.domain, lifecycle: 'idea' };
  if (input.intent) project.intent = input.intent;
  if (input.source_card_id) project.source_card_id = input.source_card_id;
  if (input.constraints) project.constraints = input.constraints;
  if (input.film) project.film = input.film;
  // Domaine film : l'idée amorce le pipeline créatif (creativeDevelopment.idea), sans écraser un
  // sous-document film déjà fourni. Le cœur générique ignore ce sous-champ (Record libre du domaine).
  if (input.domain === 'film' && input.idea) {
    const film = (project.film ?? {}) as Record<string, unknown>;
    const cd = (film.creativeDevelopment ?? {}) as Record<string, unknown>;
    if (cd.idea === undefined) cd.idea = input.idea;
    film.creativeDevelopment = cd;
    project.film = film;
  }
  const card: SuperCardV2 = {
    format: 't2m.card', spec: 2,
    id: `project_${randomUUID()}`,
    kind: 'project', facets: [input.domain], owner: input.owner,
    status: 'draft', visibility: 'public',
    created_at: t, updated_at: t,
    title: input.title,
    actions: [
      { kind: 'follow', label: 'Suivre le projet', priority: 'primary' },
      { kind: 'contribute', label: 'Rejoindre', priority: 'secondary' },
    ],
    project,
  };
  if (input.idea) card.text = { body: input.idea };
  return card;
}

/** Charge une carte `project` par id (null si absente ou pas un project). */
export async function loadProject(id: string): Promise<SuperCardV2 | null> {
  const c = await readCardFileV2(id);
  return c && c.kind === 'project' ? c : null;
}

export type SaveResult = { ok: true; url: string } | { ok: false; errors: string[] };

/** Valide (rempart canonique) puis écrit la carte via writeCardFile. Met à jour updated_at. */
export async function saveCard(card: SuperCardV2): Promise<SaveResult> {
  card.updated_at = now();
  const v = validateCard(card);
  if (!v.ok) return { ok: false, errors: v.errors.map((e) => `${e.path}: ${e.message}`) };
  try {
    const url = await writeCardFile(card);
    return { ok: true, url };
  } catch (e) {
    if (e instanceof CardValidationError) return { ok: false, errors: e.issues };
    throw e;
  }
}

/** Ressources disponibles (offre vivante) du store spec:2 — pool d'offre du Discovery Engine. */
export async function listResourceCards(): Promise<SuperCardV2[]> {
  const ids = await listCardFiles();
  const out: SuperCardV2[] = [];
  for (const id of ids) {
    if (!id.startsWith('resource_')) continue;   // namespace spec:2 → lecture ciblée (pas de scan total)
    const c = await readCardFileV2(id);
    if (c && c.kind === 'resource' && c.status !== 'archived') out.push(c);
  }
  return out;
}

/** Résumé d'un projet pour la LISTE du composer (page 1 : retrouver + stylo + poubelle). */
export interface ProjectSummary {
  id: string;
  title: string;
  domain: string;      // film | album | event | other
  lifecycle: string;   // PROJECT_LIFECYCLE
  updated_at: string | number;
}

/**
 * Les projets d'un user, les plus récents d'abord. Lecture ciblée par namespace `project_`
 * (pas de scan total). Le FICHIER `.card` est la source : la liste en est le reflet.
 */
export async function listProjectsForOwner(ownerId: string): Promise<ProjectSummary[]> {
  const ids = await listCardFiles();
  const out: ProjectSummary[] = [];
  for (const id of ids) {
    if (!id.startsWith('project_')) continue;
    const c = await readCardFileV2(id);
    if (!c || c.kind !== 'project' || c.status === 'archived') continue;
    if (c.owner !== ownerId) continue;
    out.push({
      id: c.id,
      title: c.title ?? 'Sans titre',
      domain: c.project?.domain ?? 'other',
      lifecycle: c.project?.lifecycle ?? 'idea',
      updated_at: c.updated_at,
    });
  }
  out.sort((a, b) => (Number(new Date(b.updated_at)) || 0) - (Number(new Date(a.updated_at)) || 0));
  return out;
}

/** Supprime un projet (poubelle du composer). Vérifie l'ownership. Le .card est retiré = vérité. */
export async function deleteProject(ownerId: string, id: string): Promise<'ok' | 'not_found' | 'forbidden'> {
  const c = await readCardFileV2(id);
  if (!c || c.kind !== 'project') return 'not_found';
  if (c.owner !== ownerId) return 'forbidden';
  await deleteCardFile(id);
  return 'ok';
}
