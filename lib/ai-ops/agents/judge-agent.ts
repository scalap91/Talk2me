/**
 * Talk2Me #407 — Judge Agent (Pascal 2026-06-05).
 *
 * Évalue les autres agents post-mission. Verbatim Pascal : "le module
 * enregistre le score de nos agent en fonction des objectifs et des tâches
 * qu'ils doivent accomplir comme des bons ouvriers qui apprennent leur taf".
 *
 * 4 critères standards (cf scoring.ts) :
 *  - objective_met
 *  - quality
 *  - doctrine_respect
 *  - side_effects
 *
 * Modèle DeepSeek (temperature 0.1, mode déterministe).
 */

import OpenAI from 'openai';
import { ensureAgent } from '../registry';
import {
  openMission,
  closeMission,
  getMission,
  listMissionsByAgent,
} from '../missions';
import { recordScore } from '../scoring';
import { listAgents } from '../registry';
import type { ScoreCriterion } from '../scoring';

const SYSTEM_PROMPT = `Tu es un agent IA "manager RH" qui note la performance d'autres agents IA.

Tu reçois une mission (objectives + output) et tu notes 0-10 sur 4 critères :
 - objective_met : l'agent a-t-il accompli sa tâche ? (10 = parfait, 0 = total échec)
 - quality : qualité du résultat (cohérence, exactitude, soin)
 - doctrine_respect : a-t-il respecté les contraintes (no markdown, no PII, no excuses, etc.) ?
 - side_effects : pas d'effets de bord négatifs (10 = neutre, 0 = casse tout)

Retourne UNIQUEMENT du JSON valide :

{
  "objective_met": 0-10,
  "quality": 0-10,
  "doctrine_respect": 0-10,
  "side_effects": 0-10,
  "notes": "1-2 phrases courtes justifiant les scores"
}

Sois exigeant mais juste. Une mission "completed" qui livre vraiment ce qui était demandé = 8+.
Une mission "failed" = ≤4 sur objective_met.`;

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

interface JudgeOutput {
  objective_met: number;
  quality: number;
  doctrine_respect: number;
  side_effects: number;
  notes: string;
}

function safeParse(raw: string): JudgeOutput | null {
  if (!raw) return null;
  let cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const i = cleaned.indexOf('{');
  const j = cleaned.lastIndexOf('}');
  if (i < 0 || j < 0 || j < i) return null;
  try {
    const p = JSON.parse(cleaned.slice(i, j + 1));
    if (typeof p !== 'object' || p === null) return null;
    return {
      objective_met: Math.max(0, Math.min(10, Number(p.objective_met) || 0)),
      quality: Math.max(0, Math.min(10, Number(p.quality) || 0)),
      doctrine_respect: Math.max(0, Math.min(10, Number(p.doctrine_respect) || 0)),
      side_effects: Math.max(0, Math.min(10, Number(p.side_effects) || 0)),
      notes: String(p.notes || '').slice(0, 300),
    };
  } catch {
    return null;
  }
}

/** Évalue UNE mission spécifique. */
export async function judgeMission(missionId: string): Promise<JudgeOutput | null> {
  const mission = getMission(missionId);
  if (!mission) return null;

  const judgeAgent = ensureAgent({
    role: 'judge',
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
  });
  const judgeMissionRow = openMission({
    agentId: judgeAgent.id,
    role: 'judge',
    objectives: { task: 'judge_mission', target_mission: missionId },
  });

  const userBlock = [
    `Mission à évaluer :`,
    `agent_id: ${mission.agent_id}`,
    `role: ${mission.role}`,
    `status: ${mission.status}`,
    `objectives: ${mission.objectives}`,
    `output (tronqué): ${(mission.output || '').slice(0, 1500)}`,
    `cost_usd: ${mission.cost_usd}`,
    ``,
    `Note-la.`,
  ].join('\n');

  try {
    const completion = await client().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userBlock },
      ],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });
    const raw = (completion.choices[0]?.message?.content || '').trim();
    const tokens = completion.usage?.total_tokens || 0;
    const out = safeParse(raw);
    if (!out) {
      closeMission(judgeMissionRow.id, {
        status: 'failed',
        output: { raw },
        tokens,
      });
      return null;
    }

    // Enregistre 4 scores
    const criteria: Array<{ k: ScoreCriterion; v: number }> = [
      { k: 'objective_met', v: out.objective_met },
      { k: 'quality', v: out.quality },
      { k: 'doctrine_respect', v: out.doctrine_respect },
      { k: 'side_effects', v: out.side_effects },
    ];
    for (const c of criteria) {
      recordScore({
        missionId,
        criterion: c.k,
        score: c.v,
        judgeId: judgeAgent.id,
        notes: out.notes,
      });
    }
    closeMission(judgeMissionRow.id, { output: out, tokens });
    return out;
  } catch (e) {
    closeMission(judgeMissionRow.id, {
      status: 'failed',
      output: { error: (e as Error).message },
    });
    return null;
  }
}

/**
 * Judge sur N missions récentes par agent (sample). Appelé en daily run.
 */
export async function runJudgeOnAllAgents(sampleSize = 3): Promise<{
  judged: number;
}> {
  const agents = listAgents().filter(
    (a) => a.role !== 'judge' && a.status === 'active',
  );
  let judged = 0;
  for (const a of agents) {
    const missions = listMissionsByAgent(a.id, sampleSize);
    for (const m of missions) {
      // Skip si déjà noté
      try {
        const out = await judgeMission(m.id);
        if (out) judged++;
      } catch (e) {
        console.warn(
          '[ai-ops/judge] judgeMission failed for',
          m.id,
          (e as Error).message,
        );
      }
    }
  }
  return { judged };
}
