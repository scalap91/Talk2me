import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { softDeleteMessage } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/messages/[id] — Talk2Me #22 (Pascal 2026-06-09).
 * Soft-delete d'un message du chat. Sécurisé : l'user doit avoir accès à la
 * conversation ; en conv partagée (P2P/groupe), seulement ses propres messages.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  if (!id) return NextResponse.json({ ok: false, error: 'bad_id' }, { status: 400 });
  const ok = softDeleteMessage(id, me.id);
  if (!ok) return NextResponse.json({ ok: false, error: 'not_allowed_or_not_found' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
