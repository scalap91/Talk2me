import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createDirectCard, setCardDotcard, type DirectCardType } from '@/lib/db';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cardFromDirectCard } from '@/lib/cards/composer-io';
import { serializeCard } from '@/lib/cards/supercard';
import { syncDirectCardToMoteur } from '@/lib/cards/moteur-sync';

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
    const { type, media_url, caption, text, bg_variant, attached_audio, attached_product, boutique_id, category, ad_listed, ad_city } =
      body as {
        type?: unknown;
        media_url?: unknown;
        caption?: unknown;
        text?: unknown;
        bg_variant?: unknown;
        attached_audio?: unknown;
        attached_product?: unknown;
        boutique_id?: unknown;
        category?: unknown;
        ad_listed?: unknown;
        ad_city?: unknown;
      };

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

    const card = createDirectCard(user.id, {
      type: cardType,
      media_url:
        cardType === 'video' || cardType === 'image' ? (media_url as string) : null,
      caption:
        cardType === 'video' || cardType === 'image'
          ? typeof caption === 'string'
            ? caption.trim() || null
            : null
          : null,
      text: cardType === 'texte' ? (text as string).trim() : null,
      bg_variant:
        cardType === 'texte'
          ? typeof bg_variant === 'string'
            ? bg_variant
            : 'neutral'
          : null,
      attached_audio_json: attachedAudioJson,
      attached_product_json: attachedProductJson,
      boutique_id: validatedBoutiqueId,
      category: validatedCategory,
      ad_listed_at: listAsAd ? Date.now() : null,
      ad_city: validatedAdCity,
    });

    // Card OS : la sortie du composer EST un .card (rayons remplis) — STOCKÉ comme source
    // de vérité (le feed le lira via parseCard). Additif : `card` reste pour l'existant.
    const supercard = cardFromDirectCard(card);
    const dotcard = serializeCard(supercard);
    setCardDotcard(card.id, dotcard);

    // Card OS Strangler — dual-write vers le moteur (index + .card public partageable).
    await syncDirectCardToMoteur(card);

    return NextResponse.json({ card, supercard, dotcard });
  } catch (err) {
    console.error('[cards/create] POST error:', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
