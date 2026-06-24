/**
 * Talk2Me — envoi SMS (Pascal 2026-06-24). Provider principal : Africa's Talking
 * (bonne délivrabilité Madagascar/03X, tarifs locaux, sender ID « Talk2Me »).
 * Fallback Twilio si configuré. Sans clés → {sent:false} → l'appelant affiche le code
 * en fallback DEV. Portable : un seul fichier à toucher pour changer de fournisseur.
 *
 * ENV Africa's Talking :
 *   AT_API_KEY   = clé API (dashboard africastalking.com)
 *   AT_USERNAME  = nom d'app ('sandbox' pour tester, sinon ton username live)
 *   AT_SENDER    = (optionnel) sender ID / short code validé (ex: "Talk2Me")
 */
export interface SmsResult { sent: boolean; provider?: string; error?: string }

async function sendViaAfricasTalking(toE164: string, body: string): Promise<SmsResult | null> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) return null; // non configuré → on laisse le fallback suivant
  const base = username === 'sandbox'
    ? 'https://api.sandbox.africastalking.com'
    : 'https://api.africastalking.com';
  try {
    const params = new URLSearchParams();
    params.set('username', username);
    params.set('to', toE164);
    params.set('message', body);
    if (process.env.AT_SENDER) params.set('from', process.env.AT_SENDER);
    const res = await fetch(`${base}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params.toString(),
    });
    const json = (await res.json().catch(() => null)) as
      | { SMSMessageData?: { Recipients?: Array<{ statusCode?: number; status?: string }> } }
      | null;
    const recipients = json?.SMSMessageData?.Recipients;
    // statusCode 101 = Success (file d'envoi acceptée).
    const ok = Array.isArray(recipients) && recipients.some((r) => r.statusCode === 101 || /success/i.test(r.status || ''));
    if (res.ok && ok) return { sent: true, provider: 'africastalking' };
    return { sent: false, provider: 'africastalking', error: JSON.stringify(json || {}).slice(0, 200) };
  } catch (e) {
    return { sent: false, provider: 'africastalking', error: e instanceof Error ? e.message : 'at_error' };
  }
}

async function sendViaTwilio(toE164: string, body: string): Promise<SmsResult | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) return null;
  try {
    const params = new URLSearchParams();
    params.set('To', toE164);
    if (from.startsWith('MG')) params.set('MessagingServiceSid', from);
    else params.set('From', from);
    params.set('Body', body);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (res.ok) return { sent: true, provider: 'twilio' };
    const txt = await res.text().catch(() => '');
    return { sent: false, provider: 'twilio', error: txt.slice(0, 200) };
  } catch (e) {
    return { sent: false, provider: 'twilio', error: e instanceof Error ? e.message : 'sms_error' };
  }
}

export async function sendSms(toE164: string, body: string): Promise<SmsResult> {
  const at = await sendViaAfricasTalking(toE164, body);
  if (at) return at;
  const tw = await sendViaTwilio(toE164, body);
  if (tw) return tw;
  return { sent: false, error: 'no_sms_provider' };
}
