/**
 * POST /api/auth/phone/request { phone }
 * Génère un code OTP et l'envoie par SMS (Mada-first). Réponse identique que le numéro
 * existe ou non (pas d'énumération). Le code n'est JAMAIS renvoyé au client (ni dev ni
 * prod) : l'appareil ne peut le connaître qu'en LISANT le SMS reçu. Sécurité.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { normalizePhone } from '@/lib/phone';
import { createPhoneOtp, REVIEWER_DEMO_PHONE } from '@/lib/phone-auth';
import { sendSms } from '@/lib/sms';
import { twilioVerifyConfigured, startVerification } from '@/lib/twilio-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  if (!phone) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });

  // Compte de DÉMO reviewers : pas de SMS (ils ne le reçoivent pas). On répond OK, le code
  // fixe est validé côté verify. Scopé à CE numéro uniquement.
  if (phone === REVIEWER_DEMO_PHONE) return NextResponse.json({ ok: true, message: 'Un code vient de partir par SMS.' });

  // Twilio Verify (si configuré) : Twilio génère + envoie + gère le code lui-même.
  if (twilioVerifyConfigured()) {
    const r = await startVerification(phone);
    if (!r.ok) return NextResponse.json({ error: 'sms_failed' }, { status: 502 });
    return NextResponse.json({ ok: true, message: 'Un code vient de partir par SMS.' });
  }

  // OTP maison + envoi SMS. Le code n'est JAMAIS renvoyé au client : SMS uniquement.
  // Format SMS Retriever (Android natif APK) : commence par `<#>`, finit par le hash
  // de signature de l'APK (SMS_APP_HASH) → l'appli lit le SMS et remplit le code seule,
  // SANS popup ni permission (vrai auto-read WhatsApp). Hash absent → SMS classique.
  const code = createPhoneOtp(phone);
  const appHash = (process.env.SMS_APP_HASH || '').trim();
  const sms = appHash
    ? `<#> Talk2Me: votre code est ${code}\n\n${appHash}`
    : `Talk2Me: votre code est ${code} (valable 5 min)`;
  await sendSms(phone, sms);
  return NextResponse.json({
    ok: true,
    message: 'Si ce numéro est valide, un code de connexion vient de partir par SMS.',
  });
}
