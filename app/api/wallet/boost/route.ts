/**
 * Talk2Me #427 — POST /api/wallet/boost : booste un post de l'user (débit Wallet).
 * Body : { card_kind: 'post'|'direct_card', card_id: string, pack: '24h'|'3j'|'7j' }
 * Packs définis SERVEUR (anti-triche). Post gratuit, boost payant.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { boostCard } from '@/lib/db';
import { isRestricted } from '@/lib/sanctions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;
export const BOOST_PACKS: Record<string, { cents: number; ms: number; label: string }> = {
  '24h': { cents: 200, ms: DAY, label: '24 h' },
  '3j': { cents: 500, ms: 3 * DAY, label: '3 jours' },
  '7j': { cents: 1000, ms: 7 * DAY, label: '7 jours' },
};

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { card_kind?: unknown; card_id?: unknown; pack?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const cardKind = body.card_kind === 'post' ? 'post' : body.card_kind === 'direct_card' ? 'direct_card' : null;
  const cardId = typeof body.card_id === 'string' ? body.card_id : '';
  const packKey = typeof body.pack === 'string' ? body.pack : '';
  const pack = BOOST_PACKS[packKey];
  if (!cardKind || !cardId || !pack) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  // GOUVERNANCE — enforcement L2 (Pascal 2026-07-28) : compte sous RESTRICTION → plus de boost (boutique/card incluse).
  if (isRestricted(me.id)) return NextResponse.json({ error: 'restricted', message: 'Ton compte est sous restriction — le boost est bloqué. Vois ton casier.' }, { status: 403 });

  const res = boostCard(me.id, cardKind, cardId, pack.cents, pack.ms, Date.now());
  if (!res.ok) {
    const status = res.error === 'insufficient_funds' ? 402 : res.error === 'not_owner' ? 403 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    balance_cents: res.balance_cents,
    boosted_until: res.boosted_until,
  });
}
