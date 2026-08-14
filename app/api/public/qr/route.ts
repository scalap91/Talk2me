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
  const params = new URL(req.url).searchParams;
  const raw = params.get('url') || '';
  const url = raw.trim().slice(0, 512);
  if (!url) {
    return NextResponse.json({ ok: false, error: 'url_required' }, { status: 400 });
  }
  // ?dl=<nom.png> → force le TÉLÉCHARGEMENT (Content-Disposition: attachment). Fiable sur mobile,
  // là où <a download> / le blob programmatique ouvrent l'image inline (Samsung Browser). Pascal 2026-08-14.
  const dlRaw = params.get('dl');
  const dl = dlRaw ? dlRaw.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60) : '';
  try {
    const buf = await QRCode.toBuffer(url, { width: 320, margin: 1 });
    // Uint8Array (BodyInit valide) — évite l'incompat Buffer<ArrayBufferLike> de @types/node.
    const headers: Record<string, string> = {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    };
    if (dl) headers['Content-Disposition'] = `attachment; filename="${dl}.png"`;
    return new NextResponse(new Uint8Array(buf), { headers });
  } catch {
    return NextResponse.json({ ok: false, error: 'qr_failed' }, { status: 500 });
  }
}
