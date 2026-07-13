/**
 * POST /api/public/app-sms { phone } — envoie le lien de l'app par SMS (opt-in
 * visiteur, module « REJOINDRE », Pascal 2026-07-08). Réutilise l'infra SMS
 * existante (sendSms → Orange/MAPI/Twilio, lib/sms.ts). Si aucun provider n'est
 * configuré → { ok:false, reason:'sms_indisponible' } proprement (PAS de 500).
 *
 * PUBLIC (whitelisté via /api/public/). Rate-limit mémoire 1/60s par IP ET par
 * phone (anti-abus). Le phone saisi n'est ni stocké ni loggué (opt-in ponctuel).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sendSms } from '@/lib/sms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_LINK = process.env.NEXT_PUBLIC_APP_LINK || 'https://talk2me.fr';

// Rate-limit en mémoire (process) : 1 envoi / 60s par clé (IP ou phone).
const WINDOW_MS = 60_000;
const lastHit = new Map<string, number>();

function limited(key: string): boolean {
  const now = Date.now();
  const prev = lastHit.get(key);
  if (prev && now - prev < WINDOW_MS) return true;
  lastHit.set(key, now);
  // Purge opportuniste pour éviter la fuite mémoire.
  if (lastHit.size > 5000) {
    for (const [k, t] of lastHit) if (now - t > WINDOW_MS) lastHit.delete(k);
  }
  return false;
}

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(req: NextRequest) {
  let body: { phone?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad_request' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  // Validation E.164 basique : + suivi de 8 à 15 chiffres.
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return NextResponse.json({ ok: false, reason: 'phone_invalide' }, { status: 400 });
  }

  const ip = clientIp(req);
  if (limited('ip:' + ip) || limited('ph:' + phone)) {
    return NextResponse.json({ ok: false, reason: 'trop_de_demandes' }, { status: 429 });
  }

  const message = `Talk2Me — récupère l'app ici : ${APP_LINK}`;
  const res = await sendSms(phone, message);

  if (res.sent) {
    return NextResponse.json({ ok: true });
  }
  // Aucun provider utilisable → réponse propre (pas d'erreur 500).
  return NextResponse.json({ ok: false, reason: 'sms_indisponible' });
}
