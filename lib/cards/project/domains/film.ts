/**
 * lib/cards/project/domains/film — ADAPTATEUR DE DOMAINE « film » (Pascal 2026-07-21).
 *
 * SEUL endroit qui connaît le cinéma. Traduit les faits d'un `project.film` (scènes/plans) en
 * BESOINS exprimés par TAGS DE CAPACITÉ génériques (`location`, `crowd`, `soundtrack`,
 * `authorization`, `vehicle`, `drone`…) que le moteur générique résout sans rien savoir du cinéma.
 * Ajouter un domaine (album, event…) = un fichier frère, jamais toucher le cœur.
 */
import type { ProjectBlock, ProjectNeed } from '../../v2/types';
import { registerDomain, type DomainAdapter } from '../engine';

interface FilmScene {
  id?: string;
  title?: string;
  summary?: string;
  location?: string;
  requiredAssets?: string[];
  productionHints?: {
    crowdSize?: number;
    vehicles?: number;
    requiresSoundtrack?: boolean;
    requiresDrone?: boolean;
    requiresAuthorization?: boolean;
  };
}

const norm = (s?: string): string => (s ?? '').trim().toLocaleLowerCase('fr-FR');
const includesAny = (v: string, terms: string[]): boolean => terms.some((t) => v.includes(t));
function slug(v: string): string {
  return norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Un besoin détecté (auto-créé par l'IA-producteur), exprimé en tag de capacité. */
function need(sceneId: string, suffix: string, kind: string, title: string, required: number, unit: string, extra?: Partial<ProjectNeed>): ProjectNeed {
  return {
    id: `need:${sceneId}:${suffix}`,
    kind,
    title,
    status: 'detected',
    source: { type: 'scene', id: sceneId },
    quantity: { required, filled: 0, unit },
    auto_created: true,
    detected_by: 't2m-producer-ai',
    ...extra,
  };
}

function detectFromScene(scene: FilmScene): ProjectNeed[] {
  const id = scene.id ?? slug(scene.title ?? 'scene');
  const text = norm([scene.title, scene.summary, scene.location].filter(Boolean).join(' '));
  const out: ProjectNeed[] = [];
  const hints = scene.productionHints ?? {};

  const crowd = hints.crowdSize ?? (includesAny(text, ['foule', 'manifestation', 'banquet', 'spectateurs']) ? 20 : 0);
  if (crowd > 0) out.push(need(id, 'crowd', 'crowd', `Besoin de ${crowd} figurants`, crowd, 'personnes', { location: scene.location, priority: 80 }));

  if (scene.location) out.push(need(id, 'location', 'location', `Trouver le lieu : ${scene.location}`, 1, 'lieu', { location: scene.location, priority: 90 }));

  if (hints.requiresSoundtrack) out.push(need(id, 'soundtrack', 'soundtrack', `Musique de « ${scene.title ?? id} »`, 1, 'piste', { priority: 50 }));
  if (hints.requiresDrone) out.push(need(id, 'drone', 'drone', `Drone + opérateur`, 1, 'équipe', { location: scene.location, priority: 60 }));
  if (hints.requiresAuthorization) out.push(need(id, 'authorization', 'authorization', `Autorisation de tournage`, 1, 'autorisation', { location: scene.location, priority: 100 }));
  if (hints.vehicles && hints.vehicles > 0) out.push(need(id, 'vehicle', 'vehicle', `${hints.vehicles} véhicule(s)`, hints.vehicles, 'véhicules', { location: scene.location, priority: 55 }));

  for (const asset of scene.requiredAssets ?? []) {
    out.push(need(id, `asset:${slug(asset)}`, inferCapability(asset), `Trouver : ${asset}`, 1, 'unité', { requirements: { label: asset }, priority: 50 }));
  }
  return out;
}

/** Devine le tag de capacité d'un asset requis décrit en texte libre. */
function inferCapability(label: string): string {
  const v = norm(label);
  if (includesAny(v, ['voiture', 'camion', 'moto', 'ambulance', 'véhicule'])) return 'vehicle';
  if (includesAny(v, ['costume', 'robe', 'uniforme'])) return 'costume';
  if (includesAny(v, ['caméra', 'camera'])) return 'camera';
  if (includesAny(v, ['micro', 'son'])) return 'sound';
  if (includesAny(v, ['lumière', 'projecteur'])) return 'light';
  if (includesAny(v, ['musique', 'bande-son', 'bande son'])) return 'soundtrack';
  return 'equipment';
}

export const filmDomain: DomainAdapter = {
  domain: 'film',
  detectNeeds(project: ProjectBlock): ProjectNeed[] {
    const film = project.film as { scenes?: FilmScene[] } | undefined;
    const scenes = Array.isArray(film?.scenes) ? film!.scenes! : [];
    const all = scenes.flatMap(detectFromScene);
    // dé-duplication par id (deux scènes peuvent exprimer le même besoin)
    return [...new Map(all.map((n) => [n.id, n])).values()];
  },
};

registerDomain(filmDomain);
