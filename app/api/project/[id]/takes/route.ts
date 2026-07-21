import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import { canStoryboard } from '@/lib/cards/project/domains/film-creative';
import { scenesOf, applyTake } from '@/lib/cards/project/domains/film-storyboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/takes — dépose une PRISE (VS4) sur un plan.
 * Body { scene_id, shot_id, media_url, orientation?[], orientationScore? }.
 * La prise entre `pending` (analyse/sélection = VS5). Contributeur (owner ou membre) ; gate storyboard.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const project = card.project!;
  if (project.domain !== 'film') return NextResponse.json({ error: 'domain_not_supported' }, { status: 400 });
  if (!canStoryboard(project)) return NextResponse.json({ error: 'gate_closed', need: 'storyboard validé' }, { status: 409 });

  // Contributeur : owner OU membre déclaré (ref opaque). Sinon interdit (anti-parasitage).
  const isOwner = card.owner === user.id;
  const isContributor = (project.contributors ?? []).some((c) => c.ref === user.id);
  if (!isOwner && !isContributor) return NextResponse.json({ error: 'forbidden', hint: 'rejoins le projet d\'abord' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sceneId = String(body.scene_id ?? '');
  const shotId = String(body.shot_id ?? '');
  const mediaUrl = typeof body.media_url === 'string' ? body.media_url : '';
  if (!sceneId || !shotId || !mediaUrl) return NextResponse.json({ error: 'missing_fields', need: 'scene_id, shot_id, media_url' }, { status: 400 });

  const scene = scenesOf(project).find((s) => s.id === sceneId);
  if (!scene || !(scene.shots ?? []).some((sh) => sh.id === shotId)) return NextResponse.json({ error: 'shot_not_found' }, { status: 404 });

  // Télémétrie orientation (bornée) — série de {yaw,pitch,roll}.
  const rawOri = Array.isArray(body.orientation) ? body.orientation : [];
  const orientation = rawOri.slice(0, 600).map((p) => {
    const o = p as Record<string, unknown>;
    return { yaw: Number(o?.yaw) || 0, pitch: Number(o?.pitch) || 0, roll: Number(o?.roll) || 0 };
  });
  const orientationScore = typeof body.orientationScore === 'number' ? Math.max(0, Math.min(1, body.orientationScore)) : undefined;

  const { film, takeId } = applyTake(project, sceneId, shotId, {
    media_url: mediaUrl, byRef: user.id, now: Date.now(),
    ...(orientation.length ? { orientation } : {}),
    ...(orientationScore !== undefined ? { orientationScore } : {}),
  });
  project.film = film;
  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
  return NextResponse.json({ id: card.id, take_id: takeId, scene_id: sceneId, shot_id: shotId, view: renderCard(card, 'full') });
}
