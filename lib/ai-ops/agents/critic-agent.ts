/**
 * Talk2Me #406 — Critic Agent (Pascal 2026-06-05).
 *
 * Analyse une (user_message, lea_response, tool_calls, attached_cards) et
 * note Léa. Détecte les bugs structurés.
 *
 * Verbatim Pascal : "un autre qui analyse".
 *
 * Modèle DeepSeek analytique (temperature 0.2, JSON mode).
 */

import OpenAI from 'openai';
import { recordLlmUsage } from '@/lib/schema/llm-usage';
import { ensureAgent } from '../registry';
import { openMission, closeMission } from '../missions';

const SYSTEM_PROMPT = `Tu es un agent IA QA qui analyse les réponses de Léa (IA Talk2Me).

Talk2Me = app sociale + assistant IA. Léa doit :
 - éviter le markdown brut (** _ # \` etc.) dans le texte conversationnel (UI bulles texte plat)
 - ne JAMAIS leaker de PII (talk2me_id 6 chiffres / email / IP / token)
 - appeler le bon tool pour l'intent (hôtel → place avec amenity=hotel ; resto → restaurant ; vidéo → youtube ; recette → recipe ; météo → weather ; etc.)
 - retourner des cards cohérentes avec l'intent (pas de pommes de terre quand on demande une robe)
 - ne JAMAIS afficher de JSON brut
 - rester conversationnel sans excuses du type "je n'ai pas trouvé, essaie Booking"
 - ne JAMAIS dire "je cherche pour toi" / "laisse-moi chercher" (interdit)
 - ne pas inventer (grounding obligatoire)

On te donne : (user_message, lea_response_text, tool_calls_summary, attached_cards_kinds).

Tu retournes UNIQUEMENT du JSON valide, sans markdown, sans \`\`\` :

{
  "coherence_score": 0-10,
  "conversational_quality": 0-10,
  "bugs": [
    {
      "type": "markdown_leak"|"pii_leak"|"wrong_tool"|"wrong_card"|"json_visible"|"ton_inadapte"|"excuse_interdite"|"annonce_recherche"|"invention"|"autre",
      "severity": "low"|"medium"|"high"|"critical",
      "evidence": "extrait de la réponse Léa qui prouve le bug (max 200 chars)",
      "suggested_fix_category": "prompt"|"regex"|"code"|"config"
    }
  ],
  "pass": true|false
}

severity = "critical" si PII leak ou wrong_card flagrant. "high" si markdown brut visible.
"medium" pour wrong_tool/excuse_interdite. "low" pour ton_inadapté mineur.
pass = true UNIQUEMENT si bugs vide OU bugs uniquement de severity "low".`;

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');
  _client = new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeout: 30000,
    maxRetries: 1,
  });
  return _client;
}

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CritiqueBug {
  type: string;
  severity: BugSeverity;
  evidence: string;
  suggested_fix_category?: string;
}

export interface Critique {
  coherence_score: number;
  conversational_quality: number;
  bugs: CritiqueBug[];
  pass: boolean;
}

export interface CriticInput {
  userMessage: string;
  leaResponseText: string;
  toolCallsSummary: string[];
  attachedCardsKinds: string[];
}

export interface CritiqueResult {
  critique: Critique;
  missionId: string;
  tokens: number;
}

function safeParseJson(raw: string): Critique | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  // Strip ```json ... ``` wrapping si présent
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  // Trouve le premier { et le dernier } pour tolérer du texte autour
  const i = cleaned.indexOf('{');
  const j = cleaned.lastIndexOf('}');
  if (i < 0 || j < 0 || j < i) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(i, j + 1));
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      coherence_score: Number(parsed.coherence_score) || 0,
      conversational_quality: Number(parsed.conversational_quality) || 0,
      bugs: Array.isArray(parsed.bugs)
        ? parsed.bugs
            .filter((b: unknown) => b && typeof b === 'object')
            .map((b: Record<string, unknown>) => ({
              type: String(b.type || 'autre'),
              severity: (['low', 'medium', 'high', 'critical'] as const).includes(
                b.severity as BugSeverity,
              )
                ? (b.severity as BugSeverity)
                : 'medium',
              evidence: String(b.evidence || '').slice(0, 200),
              suggested_fix_category: b.suggested_fix_category
                ? String(b.suggested_fix_category)
                : undefined,
            }))
        : [],
      pass: Boolean(parsed.pass),
    };
  } catch {
    return null;
  }
}

export async function criticAnalyze(input: CriticInput): Promise<CritiqueResult> {
  const agent = ensureAgent({
    role: 'critic',
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
  });
  const mission = openMission({
    agentId: agent.id,
    role: 'critic',
    objectives: {
      task: 'critique_lea_response',
      user_message: input.userMessage.slice(0, 200),
    },
  });

  const userBlock = [
    `user_message: ${input.userMessage}`,
    `lea_response_text: ${input.leaResponseText || '(vide)'}`,
    `tool_calls: [${input.toolCallsSummary.join(', ') || 'none'}]`,
    `attached_cards: [${input.attachedCardsKinds.join(', ') || 'none'}]`,
  ].join('\n');

  try {
    const completion = await client().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userBlock },
      ],
      temperature: 0.2,
      max_tokens: 600,
      // DeepSeek-chat supporte response_format json_object
      response_format: { type: 'json_object' },
    });

    const raw = (completion.choices[0]?.message?.content || '').trim();
    const tokens = completion.usage?.total_tokens || 0;
    recordLlmUsage(MODEL, completion.usage, 'ai-ops-critic');
    let critique = safeParseJson(raw);
    if (!critique) {
      // Fallback : pas de JSON valide → considéré comme failed mission
      critique = {
        coherence_score: 0,
        conversational_quality: 0,
        bugs: [
          {
            type: 'critic_parse_error',
            severity: 'low',
            evidence: raw.slice(0, 200),
          },
        ],
        pass: false,
      };
      closeMission(mission.id, {
        status: 'failed',
        output: { raw, critique },
        tokens,
      });
    } else {
      closeMission(mission.id, { output: critique, tokens });
    }
    return { critique, missionId: mission.id, tokens };
  } catch (e) {
    closeMission(mission.id, {
      status: 'failed',
      output: { error: (e as Error).message },
    });
    throw e;
  }
}
