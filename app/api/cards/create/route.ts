import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createDirectCard, upsertDirectCard, setCardDotcard, deleteDraft, type DirectCardType } from '@/lib/db';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import { cardFromDirectCard as scFromDirect } from '@/lib/cards/composer-io';
import { randomUUID } from 'crypto';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cardFromDirectCard } from '@/lib/cards/composer-io';
import { serializeCard } from '@/lib/cards/supercard';
import { syncDirectCardToMoteur } from '@/lib/cards/moteur-sync';
import { autoEnrichIfSound } from '@/lib/cards/engine/auto-enrich';
import { autoLyricsIfSound } from '@/lib/cards/engine/lyrics';
import { getArticleDotcardsByIds, getSimpleShop } from '@/lib/simple-shop';
import { parseCard } from '@/lib/cards/supercard';
import { writeCardFile } from '@/lib/cards/card-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES: DirectCardType[] = ['video', 'image', 'texte'];
const VALID_BG = ['neutral', 'purple', 'blue', 'warm'];

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const { type, media_url, caption, text, bg_variant, attached_audio, attached_product, boutique_id, attached_boutique_id, attached_product_ids, category, ad_listed, ad_city, videos } =
      body as {
        type?: unknown;
        media_url?: unknown;
        caption?: unknown;
        text?: unknown;
        bg_variant?: unknown;
        attached_audio?: unknown;
        attached_product?: unknown;
        boutique_id?: unknown;
        attached_boutique_id?: unknown;
        attached_product_ids?: unknown; // articles (produits) sélectionnés, toutes boutiques → items .card
        category?: unknown;
        ad_listed?: unknown;
        ad_city?: unknown;
        videos?: unknown; // multi-clips éditeur : toutes les URLs vidéo à faire figurer dans le .card
      };
    // Vidéos attachées (multi-clips) : URLs /uploads/ valides, dédupées, max 12.
    const attachedVideos = Array.isArray(videos)
      ? [...new Set(videos.filter((u): u is string => typeof u === 'string' && u.startsWith('/uploads/')))].slice(0, 12)
      : [];

    if (typeof type !== 'string' || !VALID_TYPES.includes(type as DirectCardType)) {
      return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
    }
    const cardType = type as DirectCardType;

    // Validation par type
    if (cardType === 'video' || cardType === 'image') {
      if (typeof media_url !== 'string' || !media_url.startsWith('/uploads/')) {
        return NextResponse.json({ error: 'invalid_media_url' }, { status: 400 });
      }
      if (caption !== undefined && caption !== null && typeof caption !== 'string') {
        return NextResponse.json({ error: 'invalid_caption' }, { status: 400 });
      }
      if (typeof caption === 'string' && caption.length > 200) {
        return NextResponse.json({ error: 'caption_too_long' }, { status: 400 });
      }
    }

    if (cardType === 'texte') {
      if (typeof text !== 'string' || text.trim().length === 0) {
        return NextResponse.json({ error: 'invalid_text' }, { status: 400 });
      }
      if (text.length > 200) {
        return NextResponse.json({ error: 'text_too_long' }, { status: 400 });
      }
      if (bg_variant !== undefined && bg_variant !== null) {
        if (typeof bg_variant !== 'string' || !VALID_BG.includes(bg_variant)) {
          return NextResponse.json({ error: 'invalid_bg_variant' }, { status: 400 });
        }
      }
    }

    // Talk2Me #422 — sérialise UnifiedCard musique (max 8KB). Pour TOUS les types
    // (y compris texte) : on peut faire un post "musique seule" ou "texte + musique".
    let attachedAudioJson: string | null = null;
    if (attached_audio && typeof attached_audio === 'object') {
      try {
        const s = JSON.stringify(attached_audio);
        if (s.length <= 8192) attachedAudioJson = s;
      } catch {
        // ignore
      }
    }

    // Talk2Me #425 — sérialise le ProductCardData attaché (max 8KB). Valable
    // pour tous les types ; la card ira aussi dans le Shop.
    let attachedProductJson: string | null = null;
    if (attached_product && typeof attached_product === 'object') {
      try {
        const s = JSON.stringify(attached_product);
        if (s.length <= 8192) attachedProductJson = s;
      } catch {
        // ignore
      }
    }

    // Validation boutique_id et category
    const validatedBoutiqueId = typeof boutique_id === 'string' && boutique_id.trim().length > 0 ? boutique_id.trim() : null;
    const validatedCategory = typeof category === 'string' ? category.trim().slice(0, 60) || null : null;
    // Petite annonce (Pascal 2026-06-11) : publication explicite au fil public.
    const listAsAd = ad_listed === true || ad_listed === 'true' || ad_listed === 1;
    const validatedAdCity = listAsAd && typeof ad_city === 'string' ? ad_city.trim().slice(0, 80) || null : null;

    // ÉTAT (Pascal 2026-08-26) : un brouillon = un .card `state='draft'` ; publier = flip vers
    // `published` sur le MÊME id (zéro doublon). `id` fourni = réédition/publication d'un existant.
    const reqState = (body as { state?: unknown }).state === 'draft' ? 'draft' : 'published';
    const rawId = (body as { id?: unknown }).id;
    const reqId = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : null;

    const directInput = {
      id: reqId ?? undefined,
      type: cardType,
      media_url: cardType === 'video' || cardType === 'image' ? (media_url as string) : null,
      caption: cardType === 'video' || cardType === 'image' ? (typeof caption === 'string' ? caption.trim() || null : null) : null,
      text: cardType === 'texte' ? (text as string).trim() : null,
      bg_variant: cardType === 'texte' ? (typeof bg_variant === 'string' ? bg_variant : 'neutral') : null,
      attached_audio_json: attachedAudioJson,
      attached_product_json: attachedProductJson,
      boutique_id: validatedBoutiqueId,
      category: validatedCategory,
      ad_listed_at: listAsAd ? Date.now() : null,
      ad_city: validatedAdCity,
    };

    const validatedAttachedBoutiqueId =
      typeof attached_boutique_id === 'string' && attached_boutique_id.trim().length > 0 ? attached_boutique_id.trim() : null;
    const validatedProductIds = Array.isArray(attached_product_ids)
      ? attached_product_ids.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 30)
      : [];

    // Applique les EXTRAS (boutique en slide, articles imbriqués, multi-clips vidéo) sur un supercard.
    const applyExtras = (sc: ReturnType<typeof scFromDirect>) => {
      if (attachedVideos.length) sc.videos = attachedVideos;
      if (validatedAttachedBoutiqueId) {
        try {
          const shop = getSimpleShop(validatedAttachedBoutiqueId) as { id: string; name?: string; cover_url?: string | null } | null;
          if (shop) sc.shopRef = { id: shop.id, name: shop.name || 'Ma boutique', cover: shop.cover_url || undefined };
        } catch { /* best-effort */ }
      }
      if (validatedProductIds.length) {
        try {
          const rows = getArticleDotcardsByIds(validatedProductIds);
          const items = rows
            .map((r) => { try { const pc = r.dotcard ? parseCard(r.dotcard) : null; return pc?.ok && pc.card ? { ...pc.card, standalone: true } : null; } catch { return null; } })
            .filter((c): c is NonNullable<typeof c> => !!c);
          if (items.length) sc.items = [...(sc.items ?? []), ...items];
        } catch { /* best-effort */ }
      }
      return sc;
    };

    // ===== BROUILLON : moteur-only (index cards + fichier .card, state='draft'). PAS de
    // direct_cards → le brouillon reste hors recherche / matrice unifiée tant qu'il n'est pas publié.
    if (reqState === 'draft') {
      const id = reqId ?? randomUUID();
      const dcl = {
        id, type: cardType, media_url: directInput.media_url, caption: directInput.caption,
        text: directInput.text, user_id: user.id,
        attached_audio_json: attachedAudioJson, attached_product_json: attachedProductJson,
      };
      const sc = applyExtras(scFromDirect(dcl, 'draft'));
      // Brouillon : on garde les 4 zones brutes du composer pour restaurer l etat exact a la reedition.
      const dc = (body as { draft_composer?: unknown }).draft_composer;
      if (dc && typeof dc === 'object') {
        const g = (k: string) => { const v = (dc as Record<string, unknown>)[k]; return typeof v === 'string' ? v : undefined; };
        sc.draftComposer = { title: g('title'), description: g('description'), hashtags: g('hashtags'), atags: g('atags') };
      }
      try { cardRepository.save(sc); } catch (e) { console.error('[cards/create] draft index:', e); }
      try { await writeCardFile(sc); } catch { /* best-effort */ }
      return NextResponse.json({ card: { id }, state: 'draft', supercard: sc });
    }

    // ===== PUBLIÉ : upsert direct_cards (id stable) → flip/maj du .card en published.
    const card = upsertDirectCard(user.id, directInput);
    if (!card) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    // Conversion douce : si on publie un ANCIEN brouillon (card_drafts, même id), on retire la
    // ligne legacy → plus de doublon brouillon/feed (Pascal 2026-08-26). Best-effort.
    try { deleteDraft(user.id, card.id); } catch { /* */ }

    // #73 — AUTO-ENRICHISSEMENT page-entité (seulement à la publication).
    autoEnrichIfSound(attached_audio, typeof caption === 'string' ? caption : undefined);
    autoLyricsIfSound(attached_audio, typeof caption === 'string' ? caption : undefined);

    const supercard = applyExtras(cardFromDirectCard(card));
    const dotcard = serializeCard(supercard);
    setCardDotcard(card.id, dotcard);

    // Card OS Strangler — dual-write moteur (index + .card public) en state='published'.
    await syncDirectCardToMoteur(card, 'published');
    // Ré-écrit le .card avec NOTRE supercard s'il porte des extras (items boutique/articles OU videos).
    if (((validatedAttachedBoutiqueId || validatedProductIds.length) && supercard.items?.length) || supercard.videos?.length) {
      try { await writeCardFile(supercard); } catch { /* best-effort */ }
    }

    return NextResponse.json({ card, state: 'published', supercard, dotcard });
  } catch (err) {
    console.error('[cards/create] POST error:', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
