/**
 * Talk2Me #340 — Fallback executor (Lot 1bis Couche B, Pascal 2026-06-04).
 *
 * Quand le primary_route d'un intent échoue (tool 0 result OU validator
 * post-result REJECT), on essaie la fallback_chain déclarée dans
 * consciousness.json (tool alternatif → external_redirect → clarification).
 *
 * Doctrine [[talktome-no-excuses]] : pas "je n'ai pas trouvé". On agit OU
 * on propose une redirection externe propre OU on pose 1 question.
 */

import consciousness from './consciousness/consciousness.json';
import { HANDLERS, type AnyToolResult } from '@/lib/tools/handlers';

export type FallbackResult =
  | {
      kind: 'tool_result';
      tool: string;
      args: Record<string, unknown>;
      result: AnyToolResult;
      expected_card?: string;
    }
  | {
      kind: 'external_redirect';
      url: string;
      label: string;
    }
  | {
      kind: 'clarification';
      question: string;
    }
  | null;

export interface FallbackContext {
  userQuery: string;
  location?: string;
  origin?: string;
  destination?: string;
  query?: string;
  dish?: string;
  baseUrl: string;
}

interface FallbackStep {
  tool?: string;
  kind?: 'external_redirect' | 'clarification';
  args_template?: Record<string, unknown>;
  url_template?: string;
  label?: string;
  ask?: string;
  expected_card?: string;
}

function interpolateString(template: string, ctx: FallbackContext): string {
  // Doctrine Pascal 2026-06-04 P0 fix #349 : si `location` (ou `origin`/`destination`/
  // `dish`/`query`) est vide on retombe sur `userQuery` pour éviter une URL
  // tronquée (booking?ss= → homepage Booking au lieu d'une vraie recherche).
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const raw = (ctx as unknown as Record<string, unknown>)[k];
    if (typeof raw === 'string' && raw.trim().length > 0) return raw;
    const fallback = (ctx as unknown as Record<string, unknown>).userQuery;
    if (typeof fallback === 'string' && fallback.trim().length > 0) return fallback;
    return '';
  });
}

function interpolateArgs(
  template: Record<string, unknown>,
  ctx: FallbackContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(template)) {
    if (typeof v === 'string') {
      out[k] = interpolateString(v, ctx);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function isNonEmptyResult(result: AnyToolResult): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as unknown as Record<string, unknown>;
  if (r.ok === false) return false;
  // Tool-by-tool checks
  if ('video' in r) return r.video !== null && r.video !== undefined;
  if ('places' in r)
    return Array.isArray(r.places) && (r.places as unknown[]).length > 0;
  if ('recipe' in r) return r.recipe !== null && r.recipe !== undefined;
  if ('page' in r) return r.page !== null && r.page !== undefined;
  if ('weather' in r) return r.weather !== null && r.weather !== undefined;
  if ('products' in r)
    return Array.isArray(r.products) && (r.products as unknown[]).length > 0;
  if ('results' in r)
    return Array.isArray(r.results) && (r.results as unknown[]).length > 0;
  return true;
}

export async function executeFallbackChain(
  intent: string,
  ctx: FallbackContext,
): Promise<FallbackResult> {
  const intents = consciousness.intents as Record<
    string,
    { fallback_chain?: FallbackStep[] }
  >;
  const intentDef = intents[intent];
  if (!intentDef?.fallback_chain) return null;

  for (const step of intentDef.fallback_chain) {
    try {
      if (step.tool) {
        const handler = HANDLERS[step.tool];
        if (!handler) continue;
        const args = step.args_template
          ? interpolateArgs(step.args_template, ctx)
          : {};
        const result = await handler(args, { baseUrl: ctx.baseUrl });
        if (isNonEmptyResult(result)) {
          return {
            kind: 'tool_result',
            tool: step.tool,
            args,
            result,
            expected_card: step.expected_card,
          };
        }
      } else if (step.kind === 'external_redirect' && step.url_template) {
        const url = interpolateString(step.url_template, ctx);
        return {
          kind: 'external_redirect',
          url,
          label: step.label || 'Voir',
        };
      } else if (step.kind === 'clarification' && step.ask) {
        const question = interpolateString(step.ask, ctx);
        return { kind: 'clarification', question };
      }
    } catch (e) {
      // On tente l'étape suivante
      console.error('[fallback-executor] step error', step, e);
      continue;
    }
  }
  return null;
}
