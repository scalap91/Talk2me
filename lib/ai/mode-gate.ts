/**
 * Talk2Me #340 — Mode gate (Lot 1bis Couche B, Pascal 2026-06-04).
 *
 * Talk2Me #341 — Lot 2 N8/N9 : ajout `card_editor_text`, helpers label/skills_fr,
 *                 helper `getRequestMode(req)` partagé serveur.
 *
 * Doctrine [[talk2me-card-editor-ia]] :
 *   "Lorsqu'on est en mode 'Éditeur de Card', les autres compétences sont
 *    GELÉES. L'IA ne fait QUE ce qui concerne l'édition de la card."
 *
 * Cette couche filtre la liste de tools envoyée à DeepSeek selon le mode actif
 * (header x-talktome-mode ou paramètre body). DeepSeek ne reçoit même pas le
 * schéma des tools gelés → impossible de les appeler.
 */

import type OpenAI from 'openai';
import type { NextRequest } from 'next/server';
import consciousness from './consciousness/consciousness.json';

export type Mode =
  | 'chat'
  | 'card_editor_video'
  | 'card_editor_image'
  | 'card_editor_text'
  | 'watch_together';

export const ALL_MODES: Mode[] = [
  'chat',
  'card_editor_video',
  'card_editor_image',
  'card_editor_text',
  'watch_together',
];

interface ModeDef {
  label?: string;
  description?: string;
  allowed_tools: string[];
  frozen_tools: string[];
  skills_active_fr?: string[];
  skills_frozen_fr?: string[];
}

function getModeDef(mode: string): ModeDef {
  const modes = consciousness.modes as Record<string, ModeDef>;
  return modes[mode] || modes['chat'];
}

export function getAllowedTools(mode: string = 'chat'): string[] {
  return getModeDef(mode).allowed_tools;
}

export function getFrozenTools(mode: string = 'chat'): string[] {
  return getModeDef(mode).frozen_tools;
}

export function getModeLabel(mode: string = 'chat'): string {
  return getModeDef(mode).label || mode;
}

export function getModeDescription(mode: string = 'chat'): string {
  return getModeDef(mode).description || '';
}

export function getSkillsActiveFr(mode: string = 'chat'): string[] {
  return getModeDef(mode).skills_active_fr || [];
}

export function getSkillsFrozenFr(mode: string = 'chat'): string[] {
  return getModeDef(mode).skills_frozen_fr || [];
}

/**
 * Filtre la liste de tools (format OpenAI function calling) selon le mode.
 * Les tools non listés dans allowed_tools sont retirés.
 */
export function filterToolsForMode(
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  mode: string = 'chat',
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const allowed = new Set(getAllowedTools(mode));
  return tools.filter((t) => {
    if (t.type !== 'function') return false;
    // Narrow vers ChatCompletionFunctionTool (le seul qui a .function)
    const fnTool = t as unknown as { function?: { name?: string } };
    const name = fnTool.function?.name;
    if (!name) return false;
    return allowed.has(name);
  });
}

/**
 * Normalise une string mode reçue du frontend. Retourne 'chat' si invalide.
 */
export function normalizeMode(raw: unknown): Mode {
  if (typeof raw !== 'string') return 'chat';
  const v = raw.trim().toLowerCase();
  return (ALL_MODES as string[]).includes(v) ? (v as Mode) : 'chat';
}

/**
 * Helper serveur : lit le mode depuis une NextRequest dans cet ordre :
 *   1. Header `x-talktome-mode`
 *   2. Body JSON déjà parsé (champ `mode`)
 *   3. Default 'chat'
 *
 * Usage :
 *   const body = await req.json();
 *   const mode = getRequestMode(req, body.mode);
 *
 * (Le body est passé en 2e paramètre car NextRequest body ne peut être lu
 * qu'une seule fois — le caller le fait, puis passe la valeur.)
 */
export function getRequestMode(req: NextRequest, bodyMode?: unknown): Mode {
  const header = req.headers.get('x-talktome-mode');
  if (header) return normalizeMode(header);
  if (typeof bodyMode === 'string') return normalizeMode(bodyMode);
  return 'chat';
}
