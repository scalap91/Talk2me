/**
 * lib/cards/project/domains/film-producer — PRODUCTEUR-IA du domaine film (VS1), partie PURE.
 *
 * Fait avancer le pipeline créatif : idée → logline → synopsis → traitement → scénario.
 * BOUSSOLE [[feedback_talk2me_democratiser_creation]] : l'IA ne cherche PAS le film idéal, mais
 * le MEILLEUR FILM RÉALISABLE avec les moyens réels du créateur (un smartphone + project.constraints).
 * Démocratiser la création, jamais un Hollywood miniature.
 *
 * PUR : construit les PROMPTS (déterministes) + applique la sortie (immutable). L'appel LLM lui-même
 * (I/O) vit dans la route API ; ici, rien d'impur. Chaque étape générée est ENSUITE relue/éditée/
 * validée par l'humain (le scénario doit être `approved` avant le découpage — gates film-creative).
 */
import type { ProjectBlock } from '../../v2/types';
import type { CreativeDevelopment } from './film-creative';

/** Étapes GÉNÉRABLES par le producteur, dans l'ordre (l'idée est saisie par l'humain, pas générée). */
export const PRODUCER_STEPS = ['logline', 'synopsis', 'treatment', 'screenplay'] as const;
export type ProducerStep = (typeof PRODUCER_STEPS)[number];

const STEP_LABEL: Record<ProducerStep, string> = {
  logline: 'la logline (1 phrase)',
  synopsis: 'le synopsis (1 paragraphe)',
  treatment: 'le traitement (scène par scène, quelques lignes chacune)',
  screenplay: 'le scénario dialogué court (SCÈNE · lieu · action · dialogues)',
};

function creative(project: ProjectBlock): CreativeDevelopment {
  return ((project.film as { creativeDevelopment?: CreativeDevelopment } | undefined)?.creativeDevelopment) ?? {};
}

/** Prochaine étape à générer (celle dont le champ est vide), ou null si le scénario existe déjà. */
export function nextProducerStep(project: ProjectBlock): ProducerStep | null {
  const cd = creative(project);
  const has = (v?: string) => !!(v && v.trim());
  if (!has(cd.logline)) return 'logline';
  if (!has(cd.synopsis)) return 'synopsis';
  if (!has(cd.treatment)) return 'treatment';
  if (!has(cd.screenplay)) return 'screenplay';
  return null;
}

/** Résume les contraintes réelles en une phrase injectée au prompt (la boussole « moyens réels »). */
export function constraintsSentence(project: ProjectBlock): string {
  const c = project.constraints ?? {};
  const bits: string[] = [];
  if (Array.isArray(c.locations) && c.locations.length) bits.push(`lieux disponibles : ${c.locations.join(', ')}`);
  if (typeof c.people === 'number') bits.push(`${c.people} personne(s) mobilisable(s)`);
  if (typeof c.devices === 'number') bits.push(`${c.devices} smartphone(s) pour filmer`);
  if (typeof c.target_duration_ms === 'number') bits.push(`durée cible ~${Math.round(c.target_duration_ms / 60000)} min`);
  return bits.length ? bits.join(' ; ') : 'aucune contrainte précisée (suppose UN seul smartphone et le strict minimum)';
}

export interface ProducerPrompt { system: string; user: string }

/**
 * Construit le prompt d'une étape (PUR, déterministe). La BOUSSOLE est dans le system : réalisable
 * au smartphone, pas Hollywood. Le user injecte l'idée + les étapes déjà écrites + les contraintes.
 */
export function buildProducerPrompt(project: ProjectBlock, step: ProducerStep): ProducerPrompt {
  const cd = creative(project);
  const constraints = constraintsSentence(project);
  const system = [
    'Tu es le producteur Talk2Me.',
    "Ta mission n'est PAS d'imaginer le meilleur film possible, mais le MEILLEUR FILM RÉALISABLE avec les moyens RÉELS du créateur.",
    'Le créateur tourne avec un SMARTPHONE (Android/iPhone), sans équipe pro ni matériel spécialisé.',
    'Écris pour ce qui est réellement tournable au téléphone : peu de lieux, peu de figurants réels, plans faisables à la main ou sur trépied, pas d\'effets spéciaux coûteux, pas de matériel de cinéma.',
    'Objectif : démocratiser la création, pas un Hollywood miniature. Reste concret, sobre, faisable dès aujourd\'hui.',
    'Réponds UNIQUEMENT avec le texte demandé, en français, sans préambule ni commentaire.',
  ].join(' ');

  const context = [
    cd.idea ? `Idée : ${cd.idea}` : '',
    cd.logline && step !== 'logline' ? `Logline : ${cd.logline}` : '',
    cd.synopsis && (step === 'treatment' || step === 'screenplay') ? `Synopsis : ${cd.synopsis}` : '',
    cd.treatment && step === 'screenplay' ? `Traitement : ${cd.treatment}` : '',
    `Moyens réels du créateur : ${constraints}.`,
  ].filter(Boolean).join('\n');

  const user = `${context}\n\nÉcris ${STEP_LABEL[step]} d'un film RÉALISABLE avec CES moyens (un smartphone). Rien de plus que ce qui est demandé.`;
  return { system, user };
}

/**
 * Applique la sortie LLM d'une étape dans creativeDevelopment (IMMUTABLE : renvoie un nouveau
 * sous-document `film`). Borne la longueur. N'écrase que l'étape visée.
 */
export function applyProducerOutput(project: ProjectBlock, step: ProducerStep, text: string): Record<string, unknown> {
  const clean = (text ?? '').trim().slice(0, 20000);
  const film = { ...((project.film as Record<string, unknown>) ?? {}) };
  const cd = { ...(((film.creativeDevelopment as CreativeDevelopment) ?? {})) } as Record<string, unknown>;
  cd[step] = clean;
  film.creativeDevelopment = cd;
  return film;
}
