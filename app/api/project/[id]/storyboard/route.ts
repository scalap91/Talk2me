import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import { llmComplete } from '@/lib/ai/llm';
import { canBreakdown, canStoryboard } from '@/lib/cards/project/domains/film-creative';
import {
  buildBreakdownPrompt, applyBreakdown, extractJsonArray,
  buildShotsPrompt, parseShots, applyShots, scenesOf,
  buildSketchPrompt, extractSvg, applyShotSketch,
} from '@/lib/cards/project/domains/film-storyboard';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/storyboard — construit le storyboard (film LONG → par paliers).
 *   Body {}            → DÉCOUPAGE : scénario approuvé → scenes[] (1 appel, entêtes compacts).
 *   Body { scene_id }  → PLANS de CETTE scène (1 appel par scène, borné/résilient).
 * Gates figés : découpage exige `screenplay` validé ; plans exigent `screenplay`+`breakdown` validés.
 * Owner-only, domaine film, flag. Repli 503 llm_unavailable si pas de LLM.
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
  if (project.domain !== 'film') return NextResponse.json({ error: 'domain_not_supported' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sceneId = typeof body.scene_id === 'string' ? body.scene_id : '';
  const shotId = typeof body.shot_id === 'string' ? body.shot_id : '';

  // ── ESQUISSE (dessin SVG via DeepSeek) d'UN plan — pas besoin du worker RunPod (FLUX) ──
  if (body.sketch === true && sceneId && shotId) {
    if (card.owner !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const scene = scenesOf(project).find((s) => s.id === sceneId);
    const shot = scene?.shots?.find((sh) => sh.id === shotId);
    if (!scene || !shot) return NextResponse.json({ error: 'shot_not_found' }, { status: 404 });
    const { system, user: prompt } = buildSketchPrompt(scene, shot);
    const raw = await llmComplete(system, prompt, { temperature: 0.4, maxTokens: 2000, tag: 'film-sketch' });
    if (raw === null) return NextResponse.json({ error: 'llm_unavailable', manual_ok: false }, { status: 503 });
    const svg = extractSvg(raw);
    if (!svg) return NextResponse.json({ error: 'no_svg' }, { status: 502 });
    // Écrit le SVG dans public/uploads → URL référencée (jamais inline dans le .card).
    const dir = path.join(process.cwd(), 'public/uploads');
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const fname = `sb_${randomUUID()}.svg`;
    await writeFile(path.join(dir, fname), svg, 'utf8');
    const url = `/uploads/${fname}`;
    project.film = applyShotSketch(project, sceneId, shotId, url);
    const saved = await saveCard(card);
    if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
    return NextResponse.json({ id: card.id, scene_id: sceneId, shot_id: shotId, storyboardImage: url });
  }

  // ── PLANS d'une scène ── (la branche esquisse ci-dessus a déjà return si sketch:true)
  if (sceneId) {
    if (!canStoryboard(project)) return NextResponse.json({ error: 'gate_closed', need: 'scénario + découpage validés' }, { status: 409 });
    const scene = scenesOf(project).find((s) => s.id === sceneId);
    if (!scene) return NextResponse.json({ error: 'scene_not_found' }, { status: 404 });
    const { system, user: prompt } = buildShotsPrompt(project, scene);
    const raw = await llmComplete(system, prompt, { temperature: 0.5, maxTokens: 1800, tag: 'film-shots' });
    if (raw === null) return NextResponse.json({ error: 'llm_unavailable', manual_ok: true }, { status: 503 });
    const shots = parseShots(extractJsonArray(raw), sceneId);
    project.film = applyShots(project, sceneId, shots);
    const saved = await saveCard(card);
    if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
    return NextResponse.json({ id: card.id, scene_id: sceneId, shots, view: renderCard(card, 'full') });
  }

  // ── DÉCOUPAGE en scènes ──
  if (!canBreakdown(project)) return NextResponse.json({ error: 'gate_closed', need: 'scénario validé' }, { status: 409 });
  const { system, user: prompt } = buildBreakdownPrompt(project);
  const raw = await llmComplete(system, prompt, { temperature: 0.5, maxTokens: 2000, tag: 'film-breakdown' });
  if (raw === null) return NextResponse.json({ error: 'llm_unavailable', manual_ok: true }, { status: 503 });
  project.film = applyBreakdown(project, extractJsonArray(raw));
  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
  const scenes = scenesOf(project);
  return NextResponse.json({ id: card.id, scenes, count: scenes.length, view: renderCard(card, 'full') });
}
