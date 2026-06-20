/**
 * Talk2Me — Composer Rendu BROUILLON (Pascal 2026-06-12).
 *   POST /api/composer/projects/[id]/render
 *   Régénère UNIQUEMENT les blocs invalidés (draft/modified/error) puis assemble.
 *   → bouton « Aperçu ». Renvoie le projet à jour (draft_url + statuts par bloc).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { renderProject, markSceneForRegen } from '@/lib/composer/project-store';
import type { BlockKind } from '@/lib/composer/dependency-graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  // Optionnel : « Régénérer cette scène » → force l'invalidation ciblée avant le rendu.
  let body: { sceneId?: string; blocks?: BlockKind[]; background?: boolean } = {};
  try { body = await req.json(); } catch { /* corps vide = rendu partiel normal */ }
  const marked = body.sceneId ? markSceneForRegen(id, user.id, String(body.sceneId), body.blocks) : null;

  // MODE BACKGROUND (Pascal 2026-06-19) : « Donner vie » lance le rendu I2V (~2-3 min) en
  // TÂCHE DE FOND et répond immédiatement → pas de requête tenue 2 min (qui lâche sur mobile),
  // l'UI poll le projet (GET) et affiche une barre de progression. PAS de req.signal (sinon
  // la fin de réponse avorterait le rendu).
  if (body.background) {
    renderProject(id, user.id, {}).catch((e) => console.error('[composer bg render]', (e as Error).message));
    return NextResponse.json({ ok: true, queued: true, project: marked });
  }

  try {
    const project = await renderProject(id, user.id, { signal: req.signal });
    if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, project });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'render_failed', detail: (e as Error).message }, { status: 500 });
  }
}
