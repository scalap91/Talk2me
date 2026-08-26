/**
 * /api/drafts (GET list, POST upsert)
 * Talk2Me #334 (Pascal 2026-06-04) — Brouillons de cards.
 * Doctrine [[talk2me-card-editor-ia]] : auto-save + reprise édition.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDrafts, saveDraft, type CardDraftType, getUserById } from '@/lib/db';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import type { SuperCard } from '@/lib/cards/supercard';
import { isShopSectionEnabled, type ShopSection } from '@/lib/app-settings';
import { cardFromDirectCard } from '@/lib/cards/composer-io';
import { cardToFeedItem } from '@/lib/cards/feed-from-cards';
import { getDb } from '@/lib/db';

// « Section OFF → coupé PARTOUT » (Pascal 2026-08-13) : un brouillon d'une section désactivée
// disparaît de l'espace Card. Seuls ces types de brouillon portent une section ; les autres
// (image/video/texte/gabarit) sont neutres → jamais coupés.
const DRAFT_SECTION: Partial<Record<CardDraftType, ShopSection>> = {
  plat_maison: 'eat', resto: 'eat', boutique: 'boutique',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES: CardDraftType[] = ['image', 'video', 'texte', 'gabarit', 'plat_maison', 'resto', 'boutique'];

// APERÇU BROUILLON (Pascal 2026-08-22) : chaque brouillon rendu comme une VRAIE card via le
// MÊME convertisseur que la publication (cardFromDirectCard) → aperçu = le futur post, pas une
// ligne. Best-effort : si le brouillon est trop vide/inconnu, renvoie null (l'UI met un fallback).
function previewFromDraft(d: { id: string; type: string; title: string | null; draft_data: unknown }, meId: string): unknown {
  try {
    const dd = (d.draft_data ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const media = str(dd.source_url) || str(dd.mediaUrl) || str(dd.media_url) || str(dd.url) || str(dd.cover_url) || str(dd.image_url);
    const mediaType = str(dd.mediaType) || str(dd.media_type);
    const body = str(dd.description) || str(dd.body) || str(dd.caption) || str(d.title) || str(dd.title) || '';
    let type: string;
    if (d.type === 'video' || mediaType === 'video') type = 'video';
    else if (media) type = 'image';
    else type = 'texte';
    const son = dd.son && typeof dd.son === 'object' ? JSON.stringify(dd.son) : null;
    const product = dd.attached_product && typeof dd.attached_product === 'object' ? JSON.stringify(dd.attached_product) : null;
    // owner = moi (user_id) -> cardToFeedItem retrouve l'auteur et rend l'item EXACTEMENT comme le feed
    const sc = cardFromDirectCard({
      id: d.id, type, media_url: media, caption: null, text: body, user_id: meId,
      attached_audio_json: son, attached_product_json: product,
    });
    let author: unknown = null;
    try { author = getDb().prepare('SELECT id, display_name, username, avatar_url FROM users WHERE id = ?').get(meId) ?? null; } catch { /* */ }
    return cardToFeedItem(sc, author, meId);
  } catch { return null; }
}

// BROUILLON = .card `state='draft'` (Pascal 2026-08-26) : même card qui passera au feed (flip
// d'état, zéro doublon). On mappe la SuperCard vers la forme DraftDto attendue par l'onglet.
function draftCardToDto(sc: SuperCard, meId: string): Record<string, unknown> {
  const type = sc.types?.includes('video') ? 'video' : sc.types?.includes('image') ? 'image' : 'texte';
  const thumb = sc.images?.[0] || sc.video?.url || null;
  const body = sc.text?.body || '';
  let author: unknown = null;
  try { const u = getUserById(meId); if (u) author = { id: u.id, display_name: u.display_name ?? null, username: u.username, avatar_url: u.avatar_url ?? null }; } catch { /* */ }
  let preview: unknown = null;
  try { preview = cardToFeedItem(sc, author, meId); } catch { /* */ }
  return {
    id: sc.id, type, thumbnail_url: thumb,
    title: sc.title || body.slice(0, 40) || 'Brouillon',
    draft_data: { title: sc.title || '', description: body, mediaUrl: thumb, mediaKind: type },
    created_at: sc.createdAt ?? Date.now(), updated_at: sc.updatedAt ?? Date.now(),
    preview_item: preview,
  };
}

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
  const legacy = drafts.map((d) => ({ ...d, preview_item: previewFromDraft(d, me.id) }));
  // Brouillons NOUVELLE VOIE : les .card `state='draft'` de l'user (créés par /creer/texte).
  let cardDrafts: Record<string, unknown>[] = [];
  try {
    cardDrafts = cardRepository.query({ owner: me.id, state: 'draft', limit: 100 }).map((sc) => draftCardToDto(sc, me.id));
  } catch { /* best-effort */ }
  // Dédup par id (une card migrée garde son id) ; les .card d'abord (source de vérité), puis legacy.
  const seen = new Set(cardDrafts.map((d) => d.id as string));
  const merged = [...cardDrafts, ...legacy.filter((d) => !seen.has(d.id as string))]
    .sort((a, b) => Number((b as { updated_at?: number }).updated_at ?? 0) - Number((a as { updated_at?: number }).updated_at ?? 0));
  return NextResponse.json({ ok: true, drafts: merged });
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
