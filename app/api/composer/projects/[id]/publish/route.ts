/**
 * Talk2Me — Composer Publication (Pascal 2026-06-12).
 *   POST /api/composer/projects/[id]/publish
 *   Publie le projet rendu dans le feed (card). → bouton « Publier ».
 *   Renvoie { cardId }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getProject, publishProject } from '@/lib/composer/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const project = getProject(id, user.id);
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // text_post n'a pas besoin de rendu média ; les autres formats doivent être rendus.
  if (project.format !== 'text_post' && !project.draft_url) {
    return NextResponse.json({ error: 'not_rendered', detail: 'Lance un aperçu avant de publier.' }, { status: 409 });
  }
  const res = publishProject(id, user.id);
  if (!res) return NextResponse.json({ error: 'publish_failed' }, { status: 500 });
  return NextResponse.json({ ok: true, cardId: res.cardId });
}
