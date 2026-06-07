import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getOrCreateUserConversation,
  getConversationMessages,
  resetUserConversation,
} from '@/lib/db';
import { getCurrentUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ conversation: null, messages: [] }, { status: 401 });
    }
    const conversation = getOrCreateUserConversation(user.id);
    const dbMessages = getConversationMessages(conversation.id);

    const messages = dbMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.text,
      links: msg.links,
      youtube: msg.youtube,
      places: msg.places ?? undefined,
      requires_geoloc: msg.requires_geoloc === true,
      recipe: msg.recipe ?? undefined,
      products: msg.products ?? undefined,
      wikipedia: msg.wikipedia ?? undefined,
      weather: msg.weather ?? undefined,
      web_search: msg.web_search ?? undefined,
      tiktok: msg.tiktok ?? undefined,
      intent_query: msg.intent_query ?? undefined,
      intent_label_fr: msg.intent_label_fr ?? undefined,
      user_lat: typeof msg.user_lat === 'number' ? msg.user_lat : undefined,
      user_lng: typeof msg.user_lng === 'number' ? msg.user_lng : undefined,
      timestamp: msg.created_at,
      // Talk2Me média chat (Pascal 2026-06-04)
      media: msg.media ?? undefined,
    }));

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        created_at: conversation.created_at,
      },
      messages,
    });
  } catch (error) {
    console.error('[conversation/GET]', error);
    return NextResponse.json(
      { conversation: null, messages: [] },
      { status: 200 }
    );
  }
}

/**
 * DELETE : reset la conversation 1-to-1 de l'user courant.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = getCurrentUserFromRequest(request);
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    const removed = resetUserConversation(user.id);
    return NextResponse.json({ ok: true, removed }, { status: 200 });
  } catch (e) {
    console.error('[conversation/DELETE]', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
