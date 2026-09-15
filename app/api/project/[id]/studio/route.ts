import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { buildStudioTimeline, applyStudioEdit, studioSoundtrackOf, type StudioItem } from '@/lib/cards/project/domains/film-montage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * STUDIO — table de montage (Couche 1, Pascal 2026-09-12). L'auto-montage devient éditable.
 *   GET  /api/project/:id/studio  → { items } : la timeline (édition sauvée réconciliée, sinon EDL auto).
 *   POST /api/project/:id/studio  { items } → sauve la timeline éditée (ordre / rognes / transitions).
 * Owner-only, domaine film, flag. Le RENDU de la timeline se fait via POST /montage { studio:true }.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (card.owner !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const project = card.project!;
  if (project.domain !== 'film') return NextResponse.json({ error: 'domain_not_supported' }, { status: 400 });
  return NextResponse.json({ id: card.id, items: buildStudioTimeline(project), soundtrack: studioSoundtrackOf(project) ?? null });
}

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
  const items = Array.isArray(body.items) ? (body.items as StudioItem[]) : [];
  // soundtrack : présent → enregistré ; null explicite → effacé ; absent (undefined) → inchangé.
  const soundtrack = 'soundtrack' in body ? body.soundtrack : undefined;
  project.film = applyStudioEdit(project, items, Date.now(), soundtrack);
  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });
  return NextResponse.json({ id: card.id, items: buildStudioTimeline(project), soundtrack: studioSoundtrackOf(project) ?? null });
}
