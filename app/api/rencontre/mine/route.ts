/**
 * Talk2Me — Mon profil Rencontre (Pascal 2026-07-15).
 * GET → { id } de MON salon, ou { id:null } si je n'en ai pas.
 * Sert au bouton « Rencontre » du composer : 1 seul profil par compte → s'il existe, le bouton
 * devient un ACCÈS RAPIDE à mon salon (/rencontre/[id]) au lieu de reproposer la création.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getRencontreProfile } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const shop = getRencontreProfile(me.id);
  // public_key = identité de la salle live ANNONCE (anonyme), jamais le user.id.
  return NextResponse.json({ ok: true, id: shop ? shop.id : null, roomKey: shop ? shop.public_key : null });
}
