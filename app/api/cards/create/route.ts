// /home/ubuntu/talktome/app/api/cards/create/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createDirectCard, type DirectCardType } from '@/lib/db';
import { getCurrentUserFromRequest } from '@/lib/auth';

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
    const { type, media_url, caption, text, bg_variant, attached_audio } = body as {
      type?: unknown;
      media_url?: unknown;
      caption?: unknown;
      text?: unknown;
      bg_variant?: unknown;
      // Talk2Me #422 — UnifiedCard musique attachée (objet, on sérialise ici).
      attached_audio?: unknown;
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

    // Talk2Me #422 — sérialise UnifiedCard musique (max 8KB)
    let attachedAudioJson: string | null = null;
    if (
      cardType === 'video' &&
      attached_audio &&
      typeof attached_audio === 'object'
    ) {
      try {
        const s = JSON.stringify(attached_audio);
        if (s.length <= 8192) attachedAudioJson = s;
      } catch {
        // ignore
      }
    }

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
    });

    return NextResponse.json({ card });
  } catch (err) {
    console.error('[cards/create] POST error:', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
