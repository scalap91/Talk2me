/**
 * POST /api/flyer/scan — enregistre un scan du prospectus (Pascal 2026-07-01).
 * Public (avant inscription). Position : géoloc précise si le client l'envoie, sinon
 * ville approximative via l'IP (ip-api, sans clé). Jamais de position inventée.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { recordFlyerScan } from '@/lib/flyer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

export async function POST(req: NextRequest) {
  let body: { lat?: number; lng?: number; accuracy?: number; code?: string } = {};
  try { body = await req.json(); } catch { /* */ }

  // 1) Géoloc précise fournie par le navigateur (accord user).
  if (typeof body.lat === 'number' && typeof body.lng === 'number') {
    recordFlyerScan({ code: body.code, lat: body.lat, lng: body.lng, accuracy: body.accuracy ?? null, source: 'geoloc' });
    return NextResponse.json({ ok: true, source: 'geoloc' });
  }

  // 2) Repli : ville approximative via l'IP (aucune permission requise).
  const ip = clientIp(req);
  if (ip && !/^(127\.|10\.|192\.168\.|::1)/.test(ip)) {
    try {
      const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country,lat,lon`, { signal: AbortSignal.timeout(4000) }).then((x) => x.json());
      if (r?.status === 'success') {
        recordFlyerScan({ code: body.code, lat: r.lat ?? null, lng: r.lon ?? null, city: r.city ?? null, region: r.regionName ?? null, country: r.country ?? null, source: 'ip' });
        return NextResponse.json({ ok: true, source: 'ip' });
      }
    } catch { /* réseau IP-geo indispo → on compte quand même */ }
  }

  // 3) Rien de fiable : on compte le scan sans position (pas d'invention).
  recordFlyerScan({ code: body.code, source: 'ip' });
  return NextResponse.json({ ok: true, source: 'none' });
}
