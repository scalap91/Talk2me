/**
 * Talk2Me #406 — Fix Agent (Pascal 2026-06-05).
 *
 * Reçoit une liste de bugs récurrents (groupés par type) et propose des
 * patches concrets. Tous les patches vont en queue, aucun n'est appliqué
 * automatiquement (cf [[feedback-modular-no-scattered-patches]]).
 *
 * Verbatim Pascal : "un autre qui te propose les solutions de coding".
 *
 * Modèle DeepSeek codeur (temperature 0.3).
 */

import OpenAI from 'openai';
import { recordLlmUsage } from '@/lib/schema/llm-usage';
import { ensureAgent } from '../registry';
import { openMission, closeMission } from '../missions';
import { enqueuePatch } from '../patch-queue';
import type { PatchType } from '../patch-queue';

const SYSTEM_PROMPT = `Tu es un agent IA développeur senior qui propose des patches code pour fixer les bugs de Léa (IA Talk2Me).

Tu DOIS être chirurgical : un patch = une modification minimale ciblée sur UN fichier.
JAMAIS de refactor large. JAMAIS de "réécriture complète". JAMAIS plus de 30 lignes diff par patch.

Tu connais les fichiers cibles probables :
 - lib/ai/consciousness/consciousness.json (intents/synonyms/tools)
 - lib/security/pii.ts (regex PII centralisé)
 - lib/ai/validators.ts (scrubbers post-LLM)
 - app/api/chat/route.ts (system prompt Léa)
 - lib/ai/router.ts (validation intent → tool)
 - lib/ai/mode-gate.ts (filtrage tools par mode)
 - lib/tools/handlers.ts (handlers tools)

Pour CHAQUE pattern de bug, propose 1 SEUL patch :
 - patch_type: "prompt" (modif system prompt) | "regex" (nouveau scrubber) | "code" (modif fonction) | "config" (modif consciousness.json)
 - target_file: chemin relatif du fichier à modifier
 - diff: format diff unifié OU bloc texte "AVANT" / "APRÈS" avec contexte précis (10 lignes max)
 - explanation: pourquoi ce patch (1-3 phrases)
 - expected_improvement: gain attendu (ex: "élimine 100% des leaks markdown ** dans bulles texte")

Retourne UNIQUEMENT du JSON valide, sans markdown wrapping :

{
  "patches": [
    {
      "source_bug_pattern": "...",
      "patch_type": "prompt"|"regex"|"code"|"config",
      "target_file": "...",
      "diff": "...",
      "explanation": "...",
      "expected_improvement": "..."
    }
  ]
}

Si tu n'as aucune confiance dans un patch, NE LE PROPOSE PAS — retourne une liste vide.
Préfère QUALITÉ à QUANTITÉ : max 5 patches par batch.`;

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');
  _client = new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeout: 60000,
    maxRetries: 1,
  });
  return _client;
}

export interface ProposedPatch {
  source_bug_pattern: string;
  patch_type: PatchType;
  target_file: string;
  diff: string;
  explanation: string;
  expected_improvement: string;
}

export interface FixAgentInput {
  bugsByType: Array<{
    bug_type: string;
    count: number;
    critical_count: number;
    sample_evidence: string;
  }>;
}

export interface FixAgentResult {
  patches: ProposedPatch[];
  enqueued: number;
  missionId: string;
  tokens: number;
}

function safeParse(raw: string): ProposedPatch[] {
  if (!raw) return [];
  let cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const i = cleaned.indexOf('{');
  const j = cleaned.lastIndexOf('}');
  if (i < 0 || j < 0 || j < i) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(i, j + 1));
    if (!parsed || !Array.isArray(parsed.patches)) return [];
    const VALID_TYPES: PatchType[] = ['prompt', 'regex', 'code', 'config'];
    const out: ProposedPatch[] = [];
    for (const p of parsed.patches.slice(0, 5)) {
      if (!p || typeof p !== 'object') continue;
      const type: PatchType = VALID_TYPES.includes(p.patch_type as PatchType)
        ? p.patch_type
        : 'prompt';
      const target = String(p.target_file || '').slice(0, 200);
      const diff = String(p.diff || '').slice(0, 3000);
      const explanation = String(p.explanation || '').slice(0, 1000);
      if (!target || !diff || !explanation) continue;
      out.push({
        source_bug_pattern: String(p.source_bug_pattern || '').slice(0, 200),
        patch_type: type,
        target_file: target,
        diff,
        explanation,
        expected_improvement: String(p.expected_improvement || '').slice(0, 500),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fixProposePatches(
  input: FixAgentInput,
): Promise<FixAgentResult> {
  const agent = ensureAgent({
    role: 'fix',
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
  });
  const mission = openMission({
    agentId: agent.id,
    role: 'fix',
    objectives: {
      task: 'propose_patches',
      bug_types_count: input.bugsByType.length,
    },
  });

  if (input.bugsByType.length === 0) {
    closeMission(mission.id, {
      output: { patches: [], reason: 'no_bugs' },
    });
    return { patches: [], enqueued: 0, missionId: mission.id, tokens: 0 };
  }

  const userBlock = [
    'Bugs récurrents détectés sur Léa :',
    '',
    ...input.bugsByType.map(
      (b) =>
        `- type=${b.bug_type} count=${b.count} critical=${b.critical_count}\n  sample: "${(b.sample_evidence || '').slice(0, 150)}"`,
    ),
    '',
    'Propose des patches.',
  ].join('\n');

  try {
    const completion = await client().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userBlock },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const raw = (completion.choices[0]?.message?.content || '').trim();
    const tokens = completion.usage?.total_tokens || 0;
    recordLlmUsage(MODEL, completion.usage, 'ai-ops-fix');
    const patches = safeParse(raw);

    let enqueued = 0;
    for (const p of patches) {
      enqueuePatch({
        proposedByAgent: agent.id,
        sourceBugPattern: p.source_bug_pattern,
        targetFile: p.target_file,
        patchType: p.patch_type,
        diff: p.diff,
        explanation: p.explanation,
        expectedImprovement: p.expected_improvement,
      });
      enqueued++;
    }

    closeMission(mission.id, {
      output: { count: patches.length, enqueued },
      tokens,
    });
    return { patches, enqueued, missionId: mission.id, tokens };
  } catch (e) {
    closeMission(mission.id, {
      status: 'failed',
      output: { error: (e as Error).message },
    });
    throw e;
  }
}
