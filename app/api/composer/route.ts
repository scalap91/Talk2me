/**
 * Talk2Me — POST /api/composer (Pascal 2026-06-12).
 * Point d'entrée UNIVERSEL du Composer : une demande libre → 7 couches
 * (intent → scénario → format → assets → moteurs → assemblage → publication).
 * Body : { request: string, voiceover?: bool, publish?: bool }
 * Réponse : { ok, intent, format, assets, kind, media_url|text, cardId, title }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { compose } from '@/lib/composer/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { request?: string; prompt?: string; topic?: string; voiceover?: boolean; publish?: boolean } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const request = (body.request || body.prompt || body.topic || '').trim();
  if (!request) return NextResponse.json({ error: 'request_required' }, { status: 400 });
  try {
    const res = await compose(request, user.id, { voiceover: body.voiceover, publish: body.publish });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'compose_failed', detail: (e as Error).message }, { status: 500 });
  }
}
