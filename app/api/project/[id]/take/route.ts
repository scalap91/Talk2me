import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

interface Shot { id?: string; takes?: unknown[]; selected_take_id?: string }
interface Scene { id?: string; shots?: Shot[] }

/**
 * POST /api/project/:id/take — attache une PRISE à un plan.
 * La prise ne porte que RÉFÉRENCES + SCORES RÉSUMÉS (média = url ; télémétrie hors carte via
 * `telemetry_ref`). Owner ou contributeur actif.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const project = card.project!;
  const isOwner = card.owner === user.id;
  const isContributor = (project.contributors ?? []).some((c) => c.ref === user.id && c.status === 'active');
  if (!isOwner && !isContributor) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sceneId = String(body.scene_id ?? '');
  const shotId = String(body.shot_id ?? '');
  const media = String(body.media ?? '');
  if (!sceneId || !shotId || !media.startsWith('/uploads/')) return NextResponse.json({ error: 'invalid_take', need: ['scene_id', 'shot_id', 'media(/uploads/…)'] }, { status: 400 });

  const film = (project.film ?? {}) as { scenes?: Scene[] };
  const scene = (film.scenes ?? []).find((s) => s.id === sceneId);
  const shot = scene?.shots?.find((sh) => sh.id === shotId);
  if (!shot) return NextResponse.json({ error: 'shot_not_found' }, { status: 404 });

  const take: Record<string, unknown> = {
    id: `take_${Date.now()}`,
    media,
    device_ref: typeof body.device_ref === 'string' ? body.device_ref : user.id, // ref opaque
  };
  if (typeof body.quality_score === 'number') take.quality_score = body.quality_score;
  if (typeof body.orientation_score === 'number') take.orientation_score = body.orientation_score;
  if (typeof body.telemetry_ref === 'string') take.telemetry_ref = body.telemetry_ref; // série temporelle HORS carte
  shot.takes = [...(Array.isArray(shot.takes) ? shot.takes : []), take];
  project.film = film as Record<string, unknown>;

  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
  return NextResponse.json({ id: card.id, take_id: take.id, view: renderCard(card, 'full') });
}
