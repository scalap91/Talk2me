/**
 * GET /api/public/qr?url=<texte> — génère un QR code PNG (module « REJOINDRE /
 * Récupérer l'app », Pascal 2026-07-08). Sert la GetAppSheet ouverte depuis les
 * pages PUBLIQUES : un visiteur Google scanne le QR et chope l'app.
 *
 * PUBLIC (whitelisté via /api/public/ dans middleware.ts). Pas de PII : l'URL
 * encodée est un lien d'app générique. Caché 24h (le lien ne bouge pas).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import QRCode from 'qrcode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('url') || '';
  const url = raw.trim().slice(0, 512);
  if (!url) {
    return NextResponse.json({ ok: false, error: 'url_required' }, { status: 400 });
  }
  try {
    const buf = await QRCode.toBuffer(url, { width: 320, margin: 1 });
    // Uint8Array (BodyInit valide) — évite l'incompat Buffer<ArrayBufferLike> de @types/node.
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'qr_failed' }, { status: 500 });
  }
}
