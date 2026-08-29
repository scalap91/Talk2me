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
import { getCardOwner, getUserById } from '@/lib/db';
import { createNotif } from '@/lib/notifs';
import { sendPushToUser } from '@/lib/push';
import { detectInsult } from '@/lib/moderation/insult-guard';
import { enforceGraveInsult } from '@/lib/moderation/insult-enforce';

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
  // MODÉRATION INJURES (Pascal 2026-08-29, Branchement 1) : propos GRAVE → refusé à l'envoi
  // + l'app tranche (signalement casier + avertissement auto). Léger → passe (masqué à l'affichage).
  const ins = detectInsult(text);
  if (ins.severity === 'grave') {
    enforceGraveInsult(me.id, ins.terms.join(', '));
    return NextResponse.json({ error: 'insult', message: 'Message bloqué : propos injurieux. Reformule sans insulte.' }, { status: 422 });
  }
  const res = addComment(me.id, kind, id, text);
  if (!res) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  // NOTIF « on a commenté ton post » (Pascal 2026-08-29) — miroir de la notif de like. Chaque
  // commentaire notifie (PAS de dédup : un 2e commentaire = un 2e signal), jamais soi-même.
  // In-app (avatar + profil de l'auteur, tap → la card) + push best-effort. Ne bloque JAMAIS le commentaire.
  try {
    const owner = getCardOwner(kind, id);
    const ownerId = owner?.user_id;
    if (ownerId && ownerId !== me.id) {
      const author = getUserById(me.id) as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
      const name = (author?.display_name || author?.username || 'Quelqu’un').toString().trim();
      const snippet = text.trim().replace(/\s+/g, ' ').slice(0, 90);
      const link = `/mes-cards/${id}`;
      createNotif(ownerId, 'comment', `${name} a commenté ton post`, snippet || '💬', link, me.id, author?.avatar_url ?? null);
      void sendPushToUser(ownerId, { title: `💬 ${name} a commenté ton post`, body: snippet, url: link, tag: `comment-${id}`, store: false });
    }
  } catch { /* best-effort */ }
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
