/**
 * E2EE Phase 0 — échange des clés PUBLIQUES.
 * POST { public_jwk } → publie MA clé publique. GET ?user=<id> → clé publique d'un pair.
 * On ne stocke/transporte QUE du public : le serveur ne peut pas déchiffrer.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setUserPublicKey, getUserPublicKey } from '@/lib/e2ee';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { public_jwk?: unknown } = {};
  try { body = await req.json(); } catch { /* */ }
  const jwk = body.public_jwk as { kty?: string; crv?: string } | undefined;
  // Validation minimale : un JWK de clé publique EC P-256 (pas de clé privée 'd').
  if (!jwk || typeof jwk !== 'object' || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || 'd' in (jwk as Record<string, unknown>)) {
    return NextResponse.json({ error: 'bad_jwk' }, { status: 400 });
  }
  setUserPublicKey(me.id, JSON.stringify(jwk));
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = req.nextUrl.searchParams.get('user') || '';
  if (!uid) return NextResponse.json({ error: 'user_required' }, { status: 400 });
  const jwk = getUserPublicKey(uid);
  if (!jwk) return NextResponse.json({ ok: true, public_jwk: null }); // pair pas encore de clé
  return NextResponse.json({ ok: true, public_jwk: JSON.parse(jwk) });
}
