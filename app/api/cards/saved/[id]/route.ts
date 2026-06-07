/**
 * DELETE /api/cards/saved/[id]  — supprime une card bookmarkée
 * PATCH  /api/cards/saved/[id]  — modifie title/note/card_data
 *
 * Talk2Me #331 (Pascal 2026-06-04).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { deleteSavedCard, updateSavedCard, getSavedCardById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = getSavedCardById(me.id, id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, card });
}

export async function DELETE(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const ok = deleteSavedCard(me.id, id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  let body: {
    title?: unknown;
    note?: unknown;
    card_data?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const patch: { title?: string | null; note?: string | null; cardData?: unknown } = {};
  if (body.title !== undefined) {
    patch.title = typeof body.title === 'string' ? body.title.slice(0, 200) : null;
  }
  if (body.note !== undefined) {
    patch.note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  }
  if (body.card_data !== undefined) {
    patch.cardData = body.card_data;
  }
  const card = updateSavedCard(me.id, id, patch);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, card });
}
