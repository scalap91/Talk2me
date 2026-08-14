/**
 * /api/drafts (GET list, POST upsert)
 * Talk2Me #334 (Pascal 2026-06-04) — Brouillons de cards.
 * Doctrine [[talk2me-card-editor-ia]] : auto-save + reprise édition.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDrafts, saveDraft, type CardDraftType } from '@/lib/db';
import { isShopSectionEnabled, type ShopSection } from '@/lib/app-settings';

// « Section OFF → coupé PARTOUT » (Pascal 2026-08-13) : un brouillon d'une section désactivée
// disparaît de l'espace Card. Seuls ces types de brouillon portent une section ; les autres
// (image/video/texte/gabarit) sont neutres → jamais coupés.
const DRAFT_SECTION: Partial<Record<CardDraftType, ShopSection>> = {
  plat_maison: 'eat', resto: 'eat', boutique: 'boutique',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES: CardDraftType[] = ['image', 'video', 'texte', 'gabarit', 'plat_maison', 'resto', 'boutique'];

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const limit = Number(sp.get('limit') || '50');
  const offset = Number(sp.get('offset') || '0');

  const drafts = getDrafts(
    me.id,
    Number.isFinite(limit) ? limit : 50,
    Number.isFinite(offset) ? offset : 0
  ).filter((d) => {
    const sec = DRAFT_SECTION[d.type as CardDraftType];
    return !sec || isShopSectionEnabled(sec);
  });
  return NextResponse.json({ ok: true, drafts });
}

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    id?: unknown;
    type?: unknown;
    draft_data?: unknown;
    thumbnail_url?: unknown;
    title?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const type =
    typeof body.type === 'string' && VALID_TYPES.includes(body.type as CardDraftType)
      ? (body.type as CardDraftType)
      : null;
  if (!type) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }
  if (body.draft_data === undefined || body.draft_data === null) {
    return NextResponse.json({ error: 'draft_data_required' }, { status: 400 });
  }

  const id =
    typeof body.id === 'string' && body.id.trim() !== '' ? body.id.trim() : null;
  const thumbnailUrl =
    typeof body.thumbnail_url === 'string' && body.thumbnail_url.trim() !== ''
      ? body.thumbnail_url.trim().slice(0, 1000)
      : null;
  const title =
    typeof body.title === 'string' ? body.title.slice(0, 200) : null;

  try {
    const draft = saveDraft({
      id,
      userId: me.id,
      type,
      draftData: body.draft_data,
      thumbnailUrl,
      title,
    });
    return NextResponse.json({ ok: true, draft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save_failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
