/**
 * POST /api/cards/[id]/reorder
 *
 * Talk2Me #383 (Pascal 2026-06-05) — Réordonne une card publiée (drag &
 * drop dans /drafts). Body : `{ position: number }`.
 *
 * Doctrine Pascal 2026-06-05 : « posibilte de changer lordre de la liste
 * avec un simple capuyait gisset ». Owner-only, le kind est détecté côté
 * serveur (pas besoin de l'envoyer depuis le client).
 *
 * Retour : { ok: true, kind: 'direct_card' | 'post' }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { reorderCard, detectCardKindForOwner } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const position = (body as { position?: unknown })?.position;
  if (typeof position !== 'number' || !Number.isFinite(position)) {
    return NextResponse.json(
      { error: 'invalid_position', hint: '{ position: number }' },
      { status: 400 }
    );
  }

  // Détection automatique du kind via ownership (évite que le client envoie
  // un kind erroné). Si la card n'appartient pas au user → 404.
  const kind = detectCardKindForOwner(me.id, id);
  if (!kind) {
    return NextResponse.json(
      { error: 'not_found_or_not_owner' },
      { status: 404 }
    );
  }

  const ok = reorderCard(me.id, kind, id, position);
  if (!ok) {
    return NextResponse.json(
      { error: 'reorder_failed' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, kind, position: Math.floor(position) });
}
