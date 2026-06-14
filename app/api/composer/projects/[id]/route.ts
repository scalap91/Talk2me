/**
 * Talk2Me — Composer Projet (Pascal 2026-06-12).
 *   GET    /api/composer/projects/[id]   → lit le projet (plan + statuts par bloc)
 *   PATCH  /api/composer/projects/[id]   → édite un bloc/scène OU des champs globaux
 *            body scène  : { sceneId, script?, caption?, visual_prompt?, image_override? }
 *            body global : { text?, ton?, cta?, hashtags?, title?, voiceover?, presenter? }
 *          → invalidation SÉLECTIVE des blocs dépendants (cache de rendu partiel).
 *   DELETE /api/composer/projects/[id]   → supprime le projet
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getProject, updateScene, updateGlobal, deleteProject } from '@/lib/composer/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const project = getProject(id, user.id);
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, project });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const project = body.sceneId
    ? updateScene(id, user.id, String(body.sceneId), {
        script: body.script, caption: body.caption,
        visual_prompt: body.visual_prompt, image_override: body.image_override,
      })
    : updateGlobal(id, user.id, {
        text: body.text, ton: body.ton, cta: body.cta, hashtags: body.hashtags,
        title: body.title, voiceover: body.voiceover, presenter: body.presenter,
      });

  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, project });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const ok = deleteProject(id, user.id);
  return NextResponse.json({ ok });
}
