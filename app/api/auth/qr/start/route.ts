/**
 * POST /api/auth/qr/start — Desktop NON connecté : génère un token d'appairage +
 * un QR (data URL PNG) à scanner avec le mobile DÉJÀ connecté. Public (sous
 * /api/auth/ whitelisté par le middleware). Doctrine [[reference_talk2me_git_baseline]].
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { createLinkToken } from '@/lib/web-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // IP réelle du PC (derrière nginx) + navigateur → rattachés à la future session web.
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || null;
  const ua = req.headers.get('user-agent') || null;
  const { token, expires_at } = createLinkToken(ip, ua);
  // Le mobile ouvrira cette URL en scannant le QR → elle DOIT pointer sur le domaine
  // PUBLIC (sinon le QR encode localhost/null car Next tourne derrière nginx, et le
  // scan tombe sur « site inaccessible »). De plus l'App Link APK est lié à
  // dev.talk2me.fr → on force ce host (jamais l'hôte interne 127.0.0.1/localhost).
  const fwd = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const host = fwd && !/localhost|127\.0\.0\.1/.test(fwd) ? fwd : 'dev.talk2me.fr';
  const origin = `https://${host}`;
  const linkUrl = `${origin}/link?t=${token}`;
  const qr = await QRCode.toDataURL(linkUrl, { margin: 1, width: 320, color: { dark: '#0b0b0f', light: '#ffffff' } });
  return NextResponse.json({ ok: true, token, qr, link_url: linkUrl, expires_at });
}
