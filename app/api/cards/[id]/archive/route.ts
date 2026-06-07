/**
 * /api/cards/[id]/archive
 *   POST   — archive (set archived_at = now)
 *   DELETE — désarchive (clear archived_at)
 *
 * Talk2Me Lot A (Pascal 2026-06-04). Vérifie ownership.
 * Query : ?kind=direct_card|post
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  archiveCard,
  unarchiveCard,
  VALID_CARD_KINDS_FOR_CRUD,
  type CardKindForCrud,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

function parseKind(req: NextRequest): CardKindForCrud | null {
  const raw = (req.nextUrl.searchParams.get('kind') || '').trim();
  if (VALID_CARD_KINDS_FOR_CRUD.includes(raw as CardKindForCrud)) {
    return raw as CardKindForCrud;
  }
  return null;
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const kind = parseKind(request);
  if (!kind) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  const ok = archiveCard(me.id, kind, id);
  if (!ok) {
    return NextResponse.json(
      { error: 'not_found_or_not_owner_or_already_archived' },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, archived: true });
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const kind = parseKind(request);
  if (!kind) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  const ok = unarchiveCard(me.id, kind, id);
  if (!ok) {
    return NextResponse.json(
      { error: 'not_found_or_not_owner' },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, archived: false });
}
