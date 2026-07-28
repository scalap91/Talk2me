import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import { llmComplete } from '@/lib/ai/llm';
import {
  PRODUCER_STEPS, nextProducerStep, buildProducerPrompt, buildReviseStepPrompt, applyProducerOutput, type ProducerStep,
} from '@/lib/cards/project/domains/film-producer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/develop — le producteur-IA fait avancer le pipeline créatif (film).
 * Body : { step? }               → génère l'étape via LLM (contrainte « film réalisable au smartphone »).
 *        { step, instruction }   → RÉVISION : l'IA réécrit CETTE étape selon la consigne, en restant
 *                                  cohérente avec le reste du script.
 *        { step?, text }         → SAISIE MANUELLE (repli si pas de LLM, ou correction humaine).
 * Owner-only, domaine film uniquement. Le résultat est relu/validé par l'humain (gates film-creative).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (card.owner !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const project = card.project!;
  if (project.domain !== 'film') return NextResponse.json({ error: 'domain_not_supported', domain: project.domain }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Étape : celle demandée, sinon la prochaine à générer.
  const requested = typeof body.step === 'string' ? body.step : '';
  const step = ((PRODUCER_STEPS as readonly string[]).includes(requested) ? requested : nextProducerStep(project)) as ProducerStep | null;
  if (!step) return NextResponse.json({ error: 'nothing_to_generate', hint: 'scénario déjà écrit — passe à l\'approbation' }, { status: 409 });

  // Saisie MANUELLE (repli / correction) : on applique directement le texte fourni.
  const manual = typeof body.text === 'string' ? body.text : null;
  // RÉVISION : consigne du créateur → l'IA réécrit cette étape en restant cohérente avec le reste.
  const instruction = typeof body.instruction === 'string' && body.instruction.trim() ? body.instruction.trim() : null;

  let output = manual;
  if (output === null) {
    const { system, user: userPrompt } = instruction
      ? buildReviseStepPrompt(project, step, instruction)
      : buildProducerPrompt(project, step);
    output = await llmComplete(system, userPrompt, { temperature: instruction ? 0.5 : 0.6, maxTokens: 1800, tag: instruction ? 'film-revise' : 'film-producer' });
    if (output === null) {
      // LLM indisponible (clé absente / échec) → l'UI bascule en saisie manuelle.
      return NextResponse.json({ error: 'llm_unavailable', step, manual_ok: true }, { status: 503 });
    }
  }

  project.film = applyProducerOutput(project, step, output);
  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });

  return NextResponse.json({
    id: card.id,
    step,
    generated: output,
    next: nextProducerStep(project),
    source: manual !== null ? 'manual' : (instruction ? 'revise' : 'ai'),
    view: renderCard(card, 'full'),
  });
}
