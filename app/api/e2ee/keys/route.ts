/**
 * E2EE — échange des clés PUBLIQUES. MULTI-APPAREIL (Pascal 2026-09-01).
 * POST { public_jwk, device_id? } → publie la clé publique de MON appareil (+ miroir legacy 1/user).
 * GET ?user=<id> → { public_jwk (legacy, 1re clé), keys: [{device_id, public_jwk}, …] } (tous les appareils).
 * On ne stocke/transporte QUE du public : le serveur ne peut pas déchiffrer.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setUserPublicKey, getUserPublicKey, setUserDeviceKey, getUserDeviceKeys } from '@/lib/e2ee';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { public_jwk?: unknown; device_id?: unknown } = {};
  try { body = await req.json(); } catch { /* */ }
  const jwk = body.public_jwk as { kty?: string; crv?: string } | undefined;
  // Validation minimale : un JWK de clé publique EC P-256 (pas de clé privée 'd').
  if (!jwk || typeof jwk !== 'object' || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || 'd' in (jwk as Record<string, unknown>)) {
    return NextResponse.json({ error: 'bad_jwk' }, { status: 400 });
  }
  const jwkStr = JSON.stringify(jwk);
  const deviceId = typeof body.device_id === 'string' && body.device_id.trim() ? body.device_id.trim().slice(0, 64) : null;
  if (deviceId) setUserDeviceKey(me.id, deviceId, jwkStr);   // multi-appareil (nouveau)
  setUserPublicKey(me.id, jwkStr);                           // miroir legacy (vieux clients)
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = req.nextUrl.searchParams.get('user') || '';
  if (!uid) return NextResponse.json({ error: 'user_required' }, { status: 400 });
  const safeParse = (s: string | null): unknown => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } };
  const devices = getUserDeviceKeys(uid)
    .map((d) => ({ device_id: d.device_id, public_jwk: safeParse(d.public_jwk) }))
    .filter((d) => d.public_jwk); // ignore les clés illisibles (jamais de 500)
  const legacyJwk = devices[0]?.public_jwk ?? safeParse(getUserPublicKey(uid));
  return NextResponse.json({ ok: true, public_jwk: legacyJwk, keys: devices });
}
