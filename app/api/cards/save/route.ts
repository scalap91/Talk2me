/**
 * POST /api/cards/save
 * Talk2Me #331 (Pascal 2026-06-04) — Doctrine
 * [[talktome-conversation-avant-recherche]] : enregistrer une card IA dans la
 * bibliothèque personnelle de l'user (réutilisable, forwardable).
 *
 * Body : { card_kind, card_data, source_message_id?, source_conv_id?, note?, title? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { saveCard, type SavedCardKind } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_KINDS: SavedCardKind[] = [
  'youtube',
  'place',
  'recipe',
  'wikipedia',
  'weather',
  'product',
  'web_search',
  'video_card',
  'image_card',
  'texte_card',
];

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    card_kind?: unknown;
    card_data?: unknown;
    source_message_id?: unknown;
    source_conv_id?: unknown;
    note?: unknown;
    title?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const cardKind =
    typeof body.card_kind === 'string' && VALID_KINDS.includes(body.card_kind as SavedCardKind)
      ? (body.card_kind as SavedCardKind)
      : null;
  if (!cardKind) {
    return NextResponse.json({ error: 'invalid_card_kind' }, { status: 400 });
  }
  if (body.card_data === undefined || body.card_data === null) {
    return NextResponse.json({ error: 'card_data_required' }, { status: 400 });
  }

  const sourceMessageId =
    typeof body.source_message_id === 'string' && body.source_message_id.trim()
      ? body.source_message_id.trim()
      : null;
  const sourceConvId =
    typeof body.source_conv_id === 'string' && body.source_conv_id.trim()
      ? body.source_conv_id.trim()
      : null;
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  const title = typeof body.title === 'string' ? body.title.slice(0, 200) : null;

  try {
    const card = saveCard({
      userId: me.id,
      cardKind,
      cardData: body.card_data,
      sourceMessageId,
      sourceConvId,
      title,
      note,
    });
    return NextResponse.json({ ok: true, card });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save_failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
