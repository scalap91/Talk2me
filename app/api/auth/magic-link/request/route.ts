import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMagicLink, getUserByEmail } from '@/lib/db';
import { sendMagicLink } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function baseUrlFromRequest(req: NextRequest): string {
  // 1. Override explicite (env)
  const override = process.env.TALK2ME_PUBLIC_URL;
  if (override) return override.replace(/\/+$/, '');
  // 2. Headers proxy (nginx → forwarded host/proto)
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  return `${proto}://${host}`;
}

/**
 * POST /api/auth/magic-link/request
 * Body: { email }
 *
 * Crée un magic link en DB et tente de l'envoyer par email (Brevo).
 * Pour ne pas révéler l'existence d'un user, la réponse est identique
 * que l'email soit connu ou non. Le user existant aura simplement
 * user_id pré-rempli sur le magic_link.
 *
 * Si pas de SMTP configuré (mode dev) → réponse contient fallback_link.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const existing = getUserByEmail(email);
  const { token } = createMagicLink(email, existing?.id ?? null);
  const magicUrl = `${baseUrlFromRequest(request)}/auth/verify/${token}`;

  const result = await sendMagicLink(email, magicUrl);

  const payload: {
    ok: true;
    message: string;
    fallback_link?: string;
    reason?: string;
  } = {
    ok: true,
    message: 'Si cet email est valide, un lien de connexion vient de partir. Vérifie ta boîte mail (et les spams). Le lien est valable 15 minutes.',
  };
  if (!result.sent && result.fallback_link) {
    payload.fallback_link = result.fallback_link;
    payload.reason = result.reason;
  }
  return NextResponse.json(payload);
}
