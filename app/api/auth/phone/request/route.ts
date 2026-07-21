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
import { getUserByPhone } from '@/lib/db';
import { sendOtpCodeEmail } from '@/lib/mailer';

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

  // Canal de SECOURS : livrer aussi l'OTP par email si le compte a un email attaché
  // (récupération sans dépendre du SMS/numéro — ex. numéro étranger non joignable par
  // la passerelle Mada). Le code va dans la boîte du TITULAIRE, jamais renvoyé au client.
  // Best-effort : n'échoue jamais le flux.
  try {
    const u = getUserByPhone(phone);
    const r = u?.email
      ? await sendOtpCodeEmail(u.email, code)
      : { sent: false, reason: u ? 'compte_sans_email' : 'aucun_compte_pour_ce_numero' };
    // Diagnostic (aucun code, aucune donnée perso) : sait-on à qui envoyer, et Brevo a-t-il pris ?
    console.log(`[otp-email] compte=${!!u} email=${!!u?.email} envoye=${r.sent} raison=${r.reason || 'ok'}`);
  } catch (e) { console.error('[otp-email] erreur', e instanceof Error ? e.message : e); }

  return NextResponse.json({
    ok: true,
    message: 'Si ce numéro est valide, un code de connexion vient de partir par SMS.',
  });
}
