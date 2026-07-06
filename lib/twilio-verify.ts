/**
 * Talk2Me — Twilio Verify (Pascal 2026-06-24). Produit Twilio dédié OTP : il génère,
 * envoie et vérifie le code lui-même (SMS), gère expiration + tentatives. On ne stocke
 * donc PAS le code chez nous quand Verify est actif.
 *
 * ENV : TWILIO_ACCOUNT_SID (AC…), TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID (VA…).
 */
const BASE = 'https://verify.twilio.com/v2';

export function twilioVerifyConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);
}

function auth(): string {
  return 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
}

/** Démarre une vérification : Twilio envoie le code par SMS au numéro (E.164). */
export async function startVerification(toE164: string): Promise<{ ok: boolean; error?: string }> {
  const svc = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!svc) return { ok: false, error: 'not_configured' };
  try {
    const params = new URLSearchParams();
    params.set('To', toE164);
    params.set('Channel', 'sms');
    const res = await fetch(`${BASE}/Services/${svc}/Verifications`, {
      method: 'POST',
      headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const j = (await res.json().catch(() => null)) as { status?: string } | null;
    if (res.ok && (j?.status === 'pending' || j?.status === 'approved')) return { ok: true };
    return { ok: false, error: JSON.stringify(j || {}).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'verify_error' };
  }
}

/** Vérifie le code saisi. Retourne approved=true si correct. */
export async function checkVerification(toE164: string, code: string): Promise<{ approved: boolean; error?: string }> {
  const svc = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!svc) return { approved: false, error: 'not_configured' };
  try {
    const params = new URLSearchParams();
    params.set('To', toE164);
    params.set('Code', code);
    const res = await fetch(`${BASE}/Services/${svc}/VerificationCheck`, {
      method: 'POST',
      headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const j = (await res.json().catch(() => null)) as { status?: string } | null;
    return { approved: res.ok && j?.status === 'approved' };
  } catch (e) {
    return { approved: false, error: e instanceof Error ? e.message : 'verify_error' };
  }
}
