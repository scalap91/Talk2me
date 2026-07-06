/**
 * /api/cards/[id]/comments — commentaires d'une card/post (Pascal 2026-06-24).
 *   GET    ?kind=direct_card|post           → { ok, comments, count }
 *   POST   ?kind=…  body { body }           → { ok, id, count }
 *   DELETE ?comment=<id>                    → { ok, count }  (auteur only)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { addComment, listComments, deleteComment, type CommentCardKind } from '@/lib/comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseKind(req: NextRequest): CommentCardKind | null {
  const raw = (req.nextUrl.searchParams.get('kind') || '').trim();
  return raw === 'direct_card' || raw === 'post' ? raw : null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const kind = parseKind(req);
  if (!id || !kind) return NextResponse.json({ error: 'bad_request', hint: 'kind=direct_card|post' }, { status: 400 });
  const me = getCurrentUserFromRequest(req);
  const comments = listComments(kind, id, me?.id ?? null);
  return NextResponse.json({ ok: true, comments, count: comments.length });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const kind = parseKind(req);
  if (!id || !kind) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const text = typeof body.body === 'string' ? body.body : '';
  const res = addComment(me.id, kind, id, text);
  if (!res) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  return NextResponse.json({ ok: true, id: res.id, count: res.count, created_at: res.created_at });
}

export async function DELETE(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const commentId = (req.nextUrl.searchParams.get('comment') || '').trim();
  if (!commentId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const res = deleteComment(me.id, commentId);
  return NextResponse.json(res ? { ok: true, count: res.count } : { error: 'not_found' }, { status: res ? 200 : 404 });
}
