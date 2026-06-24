/**
 * POST /api/auth/phone/request { phone }
 * Génère un code OTP et l'envoie par SMS (Mada-first). Réponse identique que le numéro
 * existe ou non (pas d'énumération). En DEV uniquement, renvoie dev_code pour tester
 * sans fournisseur SMS branché. JAMAIS de code renvoyé en prod (sécurité).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { normalizePhone } from '@/lib/phone';
import { createPhoneOtp } from '@/lib/phone-auth';
import { sendSms } from '@/lib/sms';
import { twilioVerifyConfigured, startVerification } from '@/lib/twilio-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  if (!phone) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });

  // Twilio Verify (si configuré) : Twilio génère + envoie + gère le code lui-même.
  if (twilioVerifyConfigured()) {
    const r = await startVerification(phone);
    if (!r.ok) return NextResponse.json({ error: 'sms_failed' }, { status: 502 });
    return NextResponse.json({ ok: true, message: 'Un code vient de partir par SMS.' });
  }

  // Sinon : OTP maison (+ SMS via MAPI/Twilio si clés) avec fallback DEV.
  const code = createPhoneOtp(phone);
  await sendSms(phone, `Talk2Me : ton code de connexion est ${code}. Valable 10 minutes.`);
  const payload: { ok: true; message: string; dev_code?: string } = {
    ok: true,
    message: 'Si ce numéro est valide, un code de connexion vient de partir par SMS.',
  };
  // Fallback DEV strict : permet de tester sans SMS. En prod, jamais (sinon take-over).
  if (process.env.T2M_ENV === 'dev') payload.dev_code = code;
  return NextResponse.json(payload);
}
