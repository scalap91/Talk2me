/**
 * Talk2Me — envoi SMS (Pascal 2026-06-24). Abstraction provider : aujourd'hui AUCUN
 * fournisseur SMS n'est branché (Twilio inscrit, clés en attente). Tant qu'il n'y a pas
 * de clés, on renvoie {sent:false} → l'appelant affiche le code en fallback DEV (testable).
 * Dès que les clés Twilio (ou autre) sont posées en env, les SMS partent pour de vrai.
 * Portable : un seul point à changer pour brancher Africa's Talking / Orange / etc.
 */
export interface SmsResult { sent: boolean; provider?: string; error?: string }

export async function sendSms(toE164: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM; // numéro ou Messaging Service SID
  if (sid && token && from) {
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
  // Aucun provider configuré → non envoyé (fallback dev géré par l'appelant).
  return { sent: false, error: 'no_sms_provider' };
}
