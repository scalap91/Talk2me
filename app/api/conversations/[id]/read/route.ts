/**
 * POST /api/conversations/[id]/read
 * Marque la conversation comme lue par l'user courant (last_read_at = now).
 * Utilisé quand la page conv est ouverte et qu'un message SSE arrive
 * → on évite que l'unread_count grimpe inutilement dans la liste /messages.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getConversation, markConversationRead } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const conv = getConversation(id, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const at = Date.now();
  markConversationRead(id, me.id);
  // Diffuse l'accusé de LECTURE au peer → ses messages passent en ✓✓ (lu).
  publish(`conv:${id}`, { kind: 'read', data: { user_id: me.id, at } });
  return NextResponse.json({ ok: true });
}
