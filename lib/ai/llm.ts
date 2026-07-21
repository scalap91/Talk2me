import 'server-only';
/**
 * lib/ai/llm — appel LLM réutilisable (DeepSeek via SDK OpenAI). Un seul point, pas de duplication.
 *
 * Best-effort : si la clé DEEPSEEK_API_KEY est absente ou l'appel échoue → renvoie null. L'appelant
 * DOIT gérer ce cas (repli manuel : l'utilisateur saisit le texte lui-même). Aucune erreur bloquante.
 * Comptabilise l'usage via recordLlmUsage (comme biz-ai).
 */
import OpenAI from 'openai';
import { recordLlmUsage } from '@/lib/schema/llm-usage';

export interface LlmOptions { temperature?: number; maxTokens?: number; tag?: string }

/** Complétion system+user. Renvoie le texte, ou null si LLM indisponible/échec (repli à l'appelant). */
export async function llmComplete(system: string, user: string, opts: LlmOptions = {}): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null; // clé absente → l'appelant bascule en saisie manuelle
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  try {
    const openai = new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 30000, maxRetries: 1 });
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 1500,
    });
    recordLlmUsage(model, completion.usage, opts.tag ?? 'llm');
    return (completion.choices[0]?.message?.content || '').trim() || null;
  } catch {
    return null; // silence : repli manuel
  }
}

/** true si un LLM est configuré (clé présente). Permet à l'UI d'afficher « génération IA » ou non. */
export function llmAvailable(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}
