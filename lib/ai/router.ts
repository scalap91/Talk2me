/**
 * Talk2Me #340 — Router intent → tool (Lot 1bis Couche B, Pascal 2026-06-04).
 *
 * Détecte l'intent dans le message user à partir des synonymes déclarés dans
 * consciousness.json, puis valide qu'un toolCall proposé par DeepSeek est
 * cohérent avec cet intent (bon tool + required_args satisfaits).
 *
 * Doctrine :
 *  - [[talktome-raisonnement-ia]] : 1 intent = 1 outil. Pas de mauvais routage.
 *  - [[talk2me-ai-consciousness-core]] : consciousness.json = source de vérité.
 *
 * Bug PROD réparé : "hôtel Évry" → DeepSeek appelait search_place avec
 * amenity=restaurant (fallback "restaurant" car aucun amenity "hotel" en
 * whitelist côté handlers). On force la cohérence intent ↔ args ; si pas
 * possible (amenity hotel non câblé), le validator bloque et fallback chain
 * prend le relais.
 */

import consciousness from './consciousness/consciousness.json';

export type ToolCallProposal = { name: string; args: Record<string, unknown> };
export type IntentMatch = { intent: string; confidence: number };

/** Normalise pour matcher accents et casse. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function detectIntent(
  userMessage: string,
  conversationContext?: string[],
): IntentMatch | null {
  if (!userMessage) return null;
  const haystack = normalize(
    userMessage + ' ' + (conversationContext?.join(' ') || ''),
  );

  // Score : on prend le 1er match avec le synonyme le plus long (préférence
  // au synonyme spécifique sur le générique, ex "billet avion" > "vol").
  let best: { intent: string; synonymLen: number } | null = null;
  for (const [intent, def] of Object.entries(
    consciousness.intents as Record<
      string,
      { synonyms?: string[] }
    >,
  )) {
    const synonyms = def.synonyms || [];
    for (const s of synonyms) {
      const ns = normalize(s);
      // Match en sous-chaîne avec frontière mot/début/fin pour éviter
      // "trains" qui matche "train" si on veut être strict, mais ici on
      // reste tolérant car users écrivent comme ils veulent.
      if (haystack.includes(ns)) {
        if (!best || ns.length > best.synonymLen) {
          best = { intent, synonymLen: ns.length };
        }
      }
    }
  }
  if (!best) return null;
  // confidence : len normalisée [0.5..0.95] — pas un score appris, juste un
  // signal pour les couches au-dessus. On reste honnête.
  const conf = Math.min(0.95, 0.5 + best.synonymLen / 30);
  return { intent: best.intent, confidence: conf };
}

/**
 * Tool Router (Pascal 2026-06-06) — outil primary_route d'un intent.
 * Sert à FORCER tool_choice avant le LLM (décider l'outil en amont) au lieu de
 * laisser DeepSeek choisir seul. Générique, piloté par consciousness.json.
 */
export function getPrimaryTool(intent: string | null): string | null {
  if (!intent) return null;
  const intents = consciousness.intents as Record<
    string,
    { primary_route?: { tool?: string } }
  >;
  return intents[intent]?.primary_route?.tool ?? null;
}

export interface ValidateResult {
  ok: boolean;
  reason?: string;
  corrective?: string;
}

export function validateToolCall(
  proposal: ToolCallProposal,
  intent: string | null,
  mode: string = 'chat',
): ValidateResult {
  const modes = consciousness.modes as Record<
    string,
    { allowed_tools: string[]; frozen_tools: string[] }
  >;
  const modeDef = modes[mode] || modes['chat'];

  // 1. Mode gate : tool frozen dans ce mode → bloqué
  if (modeDef.frozen_tools.includes(proposal.name)) {
    return {
      ok: false,
      reason: `Tool ${proposal.name} is frozen in mode ${mode}`,
      corrective: `Use tools: ${modeDef.allowed_tools.join(', ') || '(none)'}`,
    };
  }

  // 2. Si intent détecté → cohérence intent ↔ tool ↔ required_args
  if (intent) {
    const intents = consciousness.intents as Record<
      string,
      {
        primary_route?: {
          tool?: string;
          required_args?: Record<string, unknown>;
          kind?: string;
        };
        fallback_chain?: Array<{ tool?: string; kind?: string }>;
      }
    >;
    const intentDef = intents[intent];
    if (intentDef) {
      const expectedTool = intentDef.primary_route?.tool;
      const requiredArgs = intentDef.primary_route?.required_args || {};

      if (expectedTool && proposal.name !== expectedTool) {
        // Vérifier si c'est un fallback légitime
        const fallbacks = intentDef.fallback_chain || [];
        const isFallback = fallbacks.some(
          (f) => f.tool && f.tool === proposal.name,
        );
        if (!isFallback) {
          return {
            ok: false,
            reason: `Intent "${intent}" expects tool "${expectedTool}" not "${proposal.name}"`,
            corrective: `Appelle ${expectedTool} avec ${JSON.stringify(
              requiredArgs,
            )}`,
          };
        }
      }

      // Vérifier required_args du primary_route si c'est ce tool qui est
      // proposé (on ne contraint pas les args d'un fallback).
      if (proposal.name === expectedTool) {
        for (const [k, v] of Object.entries(requiredArgs)) {
          if (proposal.args[k] !== v) {
            return {
              ok: false,
              reason: `Tool ${proposal.name} for intent ${intent} requires ${k}=${JSON.stringify(
                v,
              )}, got ${JSON.stringify(proposal.args[k])}`,
              corrective: `Set ${k} to "${v}"`,
            };
          }
        }
      }
    }
  }

  return { ok: true };
}
