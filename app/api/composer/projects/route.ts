/**
 * Talk2Me — Composer Projets (Pascal 2026-06-12).
 *   POST /api/composer/projects   → crée un projet éditable (plan, tout en draft, 0 génération)
 *                                    body : { request|prompt, voiceover?, presenter? }
 *   GET  /api/composer/projects   → liste les projets de l'user
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createProject, listProjects } from '@/lib/composer/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { request?: string; prompt?: string; topic?: string; voiceover?: boolean; presenter?: boolean } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const request = (body.request || body.prompt || body.topic || '').trim();
  if (!request) return NextResponse.json({ error: 'request_required' }, { status: 400 });
  try {
    const project = await createProject(user.id, request, { voiceover: body.voiceover, presenter: body.presenter });
    return NextResponse.json({ ok: true, project });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'create_failed', detail: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const projects = listProjects(user.id);
  return NextResponse.json({ ok: true, projects });
}
