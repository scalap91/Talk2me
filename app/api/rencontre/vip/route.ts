/**
 * Talk2Me — VIP (accès gratuit total offert par l'hôte d'un salon Rencontre, 1 clic).
 * GET ?viewer_id=X  → { hasSalon, isVip }  (pour afficher/masquer le bouton ⭐ côté hôte).
 * POST { viewer_id, on } → octroie/retire le VIP (l'appelant = l'hôte propriétaire du salon).
 * VIP = accès GRATUIT à tout le contenu payant du salon + entrée live (cf. lib/salon isVip,
 * consommé par /api/rencontre/[id] et l'octroi d'entrée live). Aucun owner_id exposé.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getRencontreProfile } from '@/lib/simple-shop';
import { isVip, grantVip, revokeVip } from '@/lib/salon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const viewerId = new URL(req.url).searchParams.get('viewer_id') || '';
  const hasSalon = !!getRencontreProfile(me.id);
  return NextResponse.json({ ok: true, hasSalon, isVip: hasSalon && !!viewerId ? isVip(me.id, viewerId) : false });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Seul un hôte qui POSSÈDE un salon peut offrir un VIP (sinon le grant serait inerte).
  if (!getRencontreProfile(me.id)) return NextResponse.json({ error: 'no_salon' }, { status: 403 });
  let body: { viewer_id?: string; on?: boolean } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const viewer = (body.viewer_id || '').trim();
  if (!viewer || viewer === me.id) return NextResponse.json({ error: 'bad_viewer' }, { status: 400 });
  if (body.on === false) revokeVip(me.id, viewer); else grantVip(me.id, viewer);
  return NextResponse.json({ ok: true, isVip: isVip(me.id, viewer) });
}
