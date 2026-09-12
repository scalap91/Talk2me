import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/finalize — TÉLÉCHARGER = considérer l'œuvre TERMINÉE (Pascal 2026-09-12).
 * On bascule le MÊME projet en `lifecycle='film'` (statut 🎬 Film). AUCUNE carte séparée n'est créée
 * (fini les doublons vides). Une modif ultérieure du scénario le remet en 'idea' (cf. /develop) ;
 * retélécharger le remet en 'film'. Owner-only, domaine film.
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

  project.lifecycle = 'film';
  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });

  return NextResponse.json({ id: card.id, lifecycle: 'film', view: renderCard(card, 'full') });
}
