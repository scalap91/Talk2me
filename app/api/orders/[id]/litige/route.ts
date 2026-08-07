import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getEscrow } from '@/lib/escrow';
import { openLitige } from '@/lib/litige';

interface Params { params: Promise<{ id: string }> }

/**
 * Talk2Me — SIGNALER UN PROBLÈME sur une commande (Pascal 2026-08-06, Étape 3a).
 * Modèle SHEIN : PAS de chat vendeur libre. Le seul chemin acheteur↔vendeur = un LITIGE,
 * qu'un CHEF DE SECTEUR instruira (le vendeur y répondra dans le litige). Le « mis en cause »
 * (subject) = la part 'seller' de l'escrow de la commande. Anti-triche : seul l'acheteur de
 * CETTE commande peut ouvrir le litige. Voir [[project_talk2me_litige_chef_de_zone]].
 */
export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let body: { reason?: string } = {};
  try { body = await req.json(); } catch { /* corps vide → reason_required */ }
  const reason = (body.reason || '').trim();
  if (!reason) return NextResponse.json({ error: 'reason_required' }, { status: 400 });

  const escrow = getEscrow(id);
  if (!escrow) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  if (escrow.buyer_id !== me.id) return NextResponse.json({ error: 'not_your_order' }, { status: 403 });

  const seller = escrow.breakdown.find((p) => p.role === 'seller')?.user_id;
  if (!seller) return NextResponse.json({ error: 'no_seller' }, { status: 400 });

  const r = openLitige(me.id, seller, reason, escrow.id);
  if (!r.ok) return NextResponse.json({ error: r.error || 'litige_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, litige_id: r.id });
}
