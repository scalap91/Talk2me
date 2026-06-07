/**
 * POST /api/games/trigger
 *
 * Talk2Me #416 (Pascal 2026-06-05) — Bridge HTTP du helper triggerGameFromConv
 * de /lib/games/lea-trigger.ts. Permet à l'UI (bouton menu "+" → "Lancer un
 * jeu") de tester le flow complet sans attendre que /lib/ai/ branche le tool
 * Léa.
 *
 * Body :
 *   {
 *     conv_id: string,
 *     game_kind: 'chess' | 'dame',
 *     intent: 'new' | 'resume' | 'auto',
 *     conv_peer_id?: string | null   // null/absent = solo Léa
 *   }
 *
 * Réponse :
 *   { ok: true, game_id, existing, card_message_id, mode }
 *
 * Sécurité : auth requise, vérifie que l'user est participant de la conv via
 * triggerGameFromConv → getConversation.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { triggerGameFromConv } from '@/lib/games/lea-trigger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    conv_id?: unknown;
    game_kind?: unknown;
    intent?: unknown;
    conv_peer_id?: unknown;
    my_color?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const conv_id = typeof body.conv_id === 'string' ? body.conv_id : '';
  const game_kind =
    body.game_kind === 'chess' || body.game_kind === 'dame' ? body.game_kind : null;
  const intent =
    body.intent === 'new' || body.intent === 'resume' || body.intent === 'auto'
      ? body.intent
      : 'auto';
  const conv_peer_id =
    typeof body.conv_peer_id === 'string' && body.conv_peer_id ? body.conv_peer_id : null;
  const my_color =
    body.my_color === 'white' || body.my_color === 'black' || body.my_color === 'random'
      ? body.my_color
      : 'random';

  if (!conv_id) return NextResponse.json({ error: 'conv_id_required' }, { status: 400 });
  if (!game_kind) return NextResponse.json({ error: 'game_kind_required' }, { status: 400 });

  const result = await triggerGameFromConv({
    user_id: me.id,
    conv_id,
    conv_peer_id,
    game_kind,
    intent,
    my_color,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
