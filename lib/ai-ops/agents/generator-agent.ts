/**
 * Talk2Me #406 — Generator Agent (Pascal 2026-06-05).
 *
 * Génère un message user réaliste à envoyer à Léa pour la tester.
 * Modèle DeepSeek créatif (temperature 1.1) pour maximum variété.
 *
 * Verbatim Pascal : "un module fuzz avec une IA branchée au cul qui génère
 * des users".
 *
 * Doctrine [[talk2me-pii-air-gap]] : aucun talk2me_id/email/PII réel généré.
 * Le prompt force l'agent à rester dans l'univers Talk2Me sans inventer
 * d'identifiants.
 */

import OpenAI from 'openai';
import { ensureAgent } from '../registry';
import { openMission, closeMission } from '../missions';

const SYSTEM_PROMPT = `Tu es un agent IA qui simule un user réaliste de Talk2Me.

Talk2Me = app sociale + assistant IA (Léa) qui peut chercher hôtels/restos/musique/vidéos/recettes/lieux/météo/produits/wikipedia, et discuter normalement.

À CHAQUE appel tu inventes UN seul message utilisateur, comme une personne réelle l'enverrait à Léa.
Sois imprévisible : varie la personnalité (pressé/novice/expert/râleur/curieux), le ton, le sujet, la longueur.
Tu peux :
 - faire des fautes d'orthographe et de grammaire
 - écrire en abrégé (style SMS)
 - tester les limites (PII, vulgarité modérée, demande hors-sujet)
 - poser des questions méta ("tu peux faire quoi ?")
 - demander des choses précises (resto japonais Lyon 7, météo Bangkok demain, recette risotto)
 - demander des choses vagues ("j'ai faim", "je m'ennuie")
 - tester en français, parfois en anglais
 - être direct, ou bavarder

JAMAIS :
 - inventer un email ou un talk2me_id de personne réelle
 - inclure des URLs externes complètes
 - utiliser des guillemets autour de ton message
 - écrire plus de 200 caractères en moyenne

RÉPONDS UNIQUEMENT par le message user, rien d'autre. Pas de guillemets, pas de commentaire, pas de "voici un exemple : ".`;

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

export interface GeneratorOutput {
  message: string;
  missionId: string;
  tokens: number;
}

/** Appelle DeepSeek pour générer un message user. */
export async function generateUserPrompt(opts?: {
  hint?: string;
}): Promise<GeneratorOutput> {
  const agent = ensureAgent({
    role: 'generator',
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
  });
  const mission = openMission({
    agentId: agent.id,
    role: 'generator',
    objectives: { task: 'simulate_user_prompt', hint: opts?.hint || null },
  });

  try {
    const userInstruction = opts?.hint
      ? `Génère un message user (orientation : ${opts.hint})`
      : 'Génère un message user maintenant.';

    const completion = await client().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userInstruction },
      ],
      temperature: 1.1,
      max_tokens: 120,
    });

    const raw = (completion.choices[0]?.message?.content || '').trim();
    // Strip wrap quotes au cas où
    let message = raw.replace(/^["“'`]+|["”'`]+$/g, '').trim();
    if (!message) message = 'salut';
    // Cap dur 280 chars (au-delà = louche)
    if (message.length > 280) message = message.slice(0, 280);

    const tokens = completion.usage?.total_tokens || 0;
    closeMission(mission.id, { output: { message }, tokens });

    return { message, missionId: mission.id, tokens };
  } catch (e) {
    closeMission(mission.id, {
      status: 'failed',
      output: { error: (e as Error).message },
    });
    throw e;
  }
}
