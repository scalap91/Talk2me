/**
 * POST /api/conversations/[id]/typing
 * Signale (transitoire, sans écriture DB) que l'user courant est en train d'écrire.
 * Diffusé en SSE au peer → « X écrit… ». Throttlé côté client. Pascal 2026-06-26.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getConversation } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const conv = getConversation(id, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  publish(`conv:${id}`, { kind: 'typing', data: { user_id: me.id } });
  return NextResponse.json({ ok: true });
}
