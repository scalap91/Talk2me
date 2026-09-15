import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import { llmComplete } from '@/lib/ai/llm';
import { buildAddPartPrompt, appendScreenplayPart } from '@/lib/cards/project/domains/film-producer';
import { buildBreakdownPartPrompt, appendBreakdown, extractJsonArray, scenesOf } from '@/lib/cards/project/domains/film-storyboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/add-chapter — AJOUTER UNE PARTIE au scénario (Pascal 2026-09-12).
 * Body { instruction }.
 *   1) l'IA écrit la SUITE = une nouvelle partie, cohérente avec le début → APPEND au scénario
 *      (ne réécrit rien de l'existant).
 *   2) l'IA découpe UNIQUEMENT cette nouvelle partie en scènes → APPEND aux scènes existantes
 *      (préserve les scènes déjà découpées et leurs prises).
 *   3) ajouter une partie = MODIF du scénario → l'œuvre repart en « idée » (retélécharger la remet en « film »).
 * Owner-only, domaine film, flag. Si le LLM tombe après l'écriture de la partie, la partie est
 * quand même sauvée et on renvoie needs_breakdown (l'UI pourra relancer le découpage).
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
  const instruction = typeof body.instruction === 'string' && body.instruction.trim() ? body.instruction.trim() : '';
  if (!instruction) return NextResponse.json({ error: 'instruction_required', hint: 'décris la nouvelle partie à ajouter' }, { status: 400 });

  // 1) Écrire la nouvelle partie du scénario (l'IA connaît le début → cohérence, pas de réécriture).
  const partPrompt = buildAddPartPrompt(project, instruction);
  const partText = await llmComplete(partPrompt.system, partPrompt.user, { temperature: 0.6, maxTokens: 1800, tag: 'film-add-part' });
  if (partText === null || !partText.trim()) return NextResponse.json({ error: 'llm_unavailable', manual_ok: false }, { status: 503 });

  project.film = appendScreenplayPart(project, partText);
  // Ajouter une partie = modif du scénario → repart en travail (« idée »). Retélécharger remettra « film ».
  project.lifecycle = 'idea';

  // 2) Découper CETTE nouvelle partie en scènes → APPEND (préserve scènes+prises existantes).
  const bdPrompt = buildBreakdownPartPrompt(project, partText.trim());
  const bdRaw = await llmComplete(bdPrompt.system, bdPrompt.user, { temperature: 0.5, maxTokens: 2000, tag: 'film-add-part-breakdown' });
  if (bdRaw === null) {
    // Découpage indisponible : on sauve quand même la partie écrite ; l'UI pourra relancer le découpage.
    const saved = await saveCard(card);
    if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
    return NextResponse.json({ id: card.id, part: partText, needs_breakdown: true, view: renderCard(card, 'full') });
  }
  const before = scenesOf(project).length;
  project.film = appendBreakdown(project, extractJsonArray(bdRaw));

  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
  const scenes = scenesOf(project);
  return NextResponse.json({
    id: card.id,
    part: partText,
    scenes_added: scenes.length - before,
    scenes,
    count: scenes.length,
    view: renderCard(card, 'full'),
  });
}
