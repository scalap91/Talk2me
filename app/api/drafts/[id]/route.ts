/**
 * /api/drafts/[id] (GET single, DELETE)
 * Talk2Me #334 (Pascal 2026-06-04).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDraft, deleteDraft } from '@/lib/db';
import { cardRepository } from '@/lib/cards/engine/card.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  // Brouillon nouvelle voie = .card `state='draft'` (owner=moi). Sinon legacy card_drafts.
  const sc = cardRepository.findById(id);
  if (sc && sc.owner === me.id && sc.state === 'draft') {
    const type = sc.types?.includes('video') ? 'video' : sc.types?.includes('image') ? 'image' : 'texte';
    const thumb = sc.images?.[0] || sc.video?.url || null;
    const body = sc.text?.body || '';
    return NextResponse.json({ ok: true, draft: { id: sc.id, type, thumbnail_url: thumb, title: sc.title || body.slice(0, 40) || 'Brouillon', draft_data: { title: sc.title || '', description: body, mediaUrl: thumb, mediaKind: type } } });
  }
  const draft = getDraft(me.id, id);
  if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, draft });
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  // Brouillon nouvelle voie = .card : soft-delete (archive) la card. Sinon legacy card_drafts.
  const sc = cardRepository.findById(id);
  if (sc && sc.owner === me.id && sc.state === 'draft') {
    const ok = cardRepository.softDelete(id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const ok = deleteDraft(me.id, id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
