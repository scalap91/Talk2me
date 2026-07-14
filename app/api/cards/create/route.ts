import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createDirectCard, setCardDotcard, type DirectCardType } from '@/lib/db';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cardFromDirectCard } from '@/lib/cards/composer-io';
import { serializeCard } from '@/lib/cards/supercard';
import { syncDirectCardToMoteur } from '@/lib/cards/moteur-sync';
import { autoEnrichIfSound } from '@/lib/cards/engine/auto-enrich';
import { autoLyricsIfSound } from '@/lib/cards/engine/lyrics';
import { getBoutiqueProducts } from '@/lib/db-commerce';
import { getArticleDotcardsByIds } from '@/lib/simple-shop';
import { fromFeedImageCard } from '@/lib/cards/adapt';
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

    // #73 — AUTO-ENRICHISSEMENT page-entité (Pascal 2026-07-11, validé par le juge) : un son posté
    // nu → sa fiche vivante s'écrit toute seule, ancrée (YouTube + Wikipédia), en arrière-plan.
    autoEnrichIfSound(attached_audio, typeof caption === 'string' ? caption : undefined);
    // PAROLES KARAOKÉ (Pascal 2026-07-11) : best-effort lrclib par entité yt:<id>, en arrière-plan
    // → la slide gauche apparaît toute seule « quand y'a », sinon rien.
    autoLyricsIfSound(attached_audio, typeof caption === 'string' ? caption : undefined);

    // Card OS : la sortie du composer EST un .card (rayons remplis) — STOCKÉ comme source
    // de vérité (le feed le lira via parseCard). Additif : `card` reste pour l'existant.
    const supercard = cardFromDirectCard(card);
    // Multi-clips : toutes les URLs vidéo attachées figurent dans le .card (Pascal 2026-07-12).
    if (attachedVideos.length) supercard.videos = attachedVideos;
    // BOUTIQUE ATTACHÉE EN SLIDE (Pascal 2026-07-11) : `attached_boutique_id` ≠ `boutique_id`.
    // boutique_id ferait de la card un PRODUIT (exclu du feed) ; ici on veut juste que les items
    // de la boutique voyagent DANS le .card → SLIDE boutique dans le swiper, la card RESTE un post.
    const validatedAttachedBoutiqueId =
      typeof attached_boutique_id === 'string' && attached_boutique_id.trim().length > 0 ? attached_boutique_id.trim() : null;
    if (validatedAttachedBoutiqueId) {
      try {
        const products = getBoutiqueProducts(validatedAttachedBoutiqueId).slice(0, 6);
        const items = products.map((pr) =>
          fromFeedImageCard({ id: pr.id, media_url: pr.media_url, caption: pr.caption, text: null, attached_product_json: pr.attached_product_json ?? null }),
        );
        if (items.length) supercard.items = items;
      } catch {
        // best-effort : pas de boutique dans le .card si l'accès échoue
      }
    }
    // ARTICLES sélectionnés (produits de TOUTES les boutiques) → items .card (Pascal 2026-07-14).
    // Même mécanisme que la boutique : les produits voyagent DANS le .card → slides dans le swiper.
    const validatedProductIds = Array.isArray(attached_product_ids)
      ? attached_product_ids.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 30)
      : [];
    if (validatedProductIds.length) {
      try {
        // Chaque article/annonce EST une `.card` (dotcard) → on l'imbrique telle quelle (source de vérité).
        const rows = getArticleDotcardsByIds(validatedProductIds);
        const items = rows
          .map((r) => { try { const p = r.dotcard ? parseCard(r.dotcard) : null; return p?.ok ? p.card : null; } catch { return null; } })
          .filter((c): c is NonNullable<typeof c> => !!c);
        if (items.length) supercard.items = [...(supercard.items ?? []), ...items];
      } catch {
        // best-effort : pas d'articles dans le .card si l'accès échoue
      }
    }
    const dotcard = serializeCard(supercard);
    setCardDotcard(card.id, dotcard);

    // Card OS Strangler — dual-write vers le moteur (index + .card public partageable).
    await syncDirectCardToMoteur(card);
    // Le feed lit le FICHIER .card (readCardFileRaw), pas la colonne DB. syncDirectCardToMoteur
    // le réécrit depuis `card` (sans les items boutique). On le RÉ-ÉCRIT avec notre supercard
    // qui PORTE les items → la slide boutique apparaît au feed. Pascal 2026-07-11.
    // On RÉ-ÉCRIT le fichier .card avec NOTRE supercard dès qu'il porte des extras que
    // syncDirectCardToMoteur (qui part de `card` brut) ne connaît pas : items boutique OU videos[].
    if (((validatedAttachedBoutiqueId || validatedProductIds.length) && supercard.items?.length) || supercard.videos?.length) {
      try { await writeCardFile(supercard); } catch { /* best-effort */ }
    }

    return NextResponse.json({ card, supercard, dotcard });
  } catch (err) {
    console.error('[cards/create] POST error:', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
