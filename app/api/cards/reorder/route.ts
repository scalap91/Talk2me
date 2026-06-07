/**
 * POST /api/cards/reorder (batch)
 *
 * Talk2Me #383 (Pascal 2026-06-05) — Réordonne PLUSIEURS cards en 1 appel
 * atomique. Body : `{ items: [{ id, kind, position }, ...] }`.
 *
 * Doctrine : après un drag & drop dans /drafts, on recalcule les positions
 * 0..N-1 des cards visibles et on POST le batch (1 transaction SQLite,
 * pas de N round-trips). Owner-only par item.
 *
 * Retour : { ok: true, updated: N }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  reorderCardsBatch,
  VALID_CARD_KINDS_FOR_CRUD,
  type CardKindForCrud,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BatchItem {
  id: string;
  kind: CardKindForCrud;
  position: number;
}

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const raw = (body as { items?: unknown })?.items;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: 'invalid_items', hint: '{ items: [{ id, kind, position }] }' },
      { status: 400 }
    );
  }

  const items: BatchItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const o = it as { id?: unknown; kind?: unknown; position?: unknown };
    if (typeof o.id !== 'string' || o.id.length === 0) continue;
    if (
      typeof o.kind !== 'string' ||
      !VALID_CARD_KINDS_FOR_CRUD.includes(o.kind as CardKindForCrud)
    ) {
      continue;
    }
    if (typeof o.position !== 'number' || !Number.isFinite(o.position)) continue;
    items.push({
      id: o.id,
      kind: o.kind as CardKindForCrud,
      position: o.position,
    });
  }

  if (items.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const updated = reorderCardsBatch(me.id, items);
  return NextResponse.json({ ok: true, updated });
}
