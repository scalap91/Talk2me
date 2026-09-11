import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import { applyMulticamEdit, type MulticamSegment } from '@/lib/cards/project/domains/film-montage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/multicam — enregistre le MONTAGE MULTICAM MANUEL d'un plan (Pascal 2026-09-11).
 * L'éditeur (2 vidéos calées + cross-fader à la DJ) produit une suite de bascules
 * `segments: [{ takeId, fromSec, toSec }]` = « de fromSec à toSec, montre cette prise » ; coupe franche.
 * On la pose sur `shot.multicamEdit` (validée, triée). Le montage (/montage) assemble ensuite ces fenêtres.
 * Owner-only (édition du film). Body { scene_id, shot_id, segments }.
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

  let body: { scene_id?: string; shot_id?: string; segments?: MulticamSegment[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const sceneId = typeof body.scene_id === 'string' ? body.scene_id : '';
  const shotId = typeof body.shot_id === 'string' ? body.shot_id : '';
  const segments = Array.isArray(body.segments) ? body.segments : [];
  if (!sceneId || !shotId) return NextResponse.json({ error: 'missing_fields', need: 'scene_id, shot_id' }, { status: 400 });

  // applyMulticamEdit valide (prises existantes, fenêtres non vides) + trie. Immutable.
  project.film = applyMulticamEdit(project, sceneId, shotId, segments, Date.now());
  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });

  return NextResponse.json({ id: card.id, scene_id: sceneId, shot_id: shotId, view: renderCard(card, 'full') });
}
