/**
 * Mailer Talk2Me — envoi transactionnel via Brevo API HTTPS.
 *
 * Mode 1 (prod) : BREVO_API_KEY présent → POST https://api.brevo.com/v3/smtp/email
 * Mode 2 (dev)  : pas de clé → log dans console + renvoie fallback_link dans la
 *                 réponse API (PAS d'envoi réel, le user dev clique le lien direct).
 *
 * Blocklist obligatoire (doctrine feedback_emails_test_blocklist) :
 * - aucun @test.com, +test@, +fuzz@, @example.*, @localhost
 * - même en prod : on log un warning et on fallback (sans envoyer)
 */

export interface SendMagicLinkResult {
  sent: boolean;
  fallback_link?: string;
  reason?: string;
}

const TEST_EMAIL_PATTERNS = [
  /@test\.com$/i,
  /\+test@/i,
  /\+fuzz@/i,
  /@example\./i,
  /@localhost$/i,
];

function isTestEmail(email: string): boolean {
  if (!email) return true;
  return TEST_EMAIL_PATTERNS.some((re) => re.test(email));
}

const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'noreply@geniusweb.fr';
const FROM_NAME = process.env.BREVO_FROM_NAME || 'Talk2Me';
const REPLY_TO = process.env.BREVO_REPLY_TO || 'pascal.repir@gmail.com';

function renderHtml(magicUrl: string): string {
  // Template sobre, premium minimal — pas de gros bandeau gradient.
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Talk2Me</title>
  </head>
  <body style="margin:0;padding:0;background:#0e0e12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#e8e8ee;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0e0e12;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background:#15151c;border-radius:24px;border:1px solid rgba(255,255,255,0.08);">
            <tr>
              <td style="padding:40px 32px 8px;">
                <div style="font-size:22px;font-weight:500;letter-spacing:-0.01em;color:#ffffff;">Talk2Me</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px;">
                <div style="font-size:16px;font-weight:500;color:#ffffff;margin-bottom:8px;">Clique pour te connecter</div>
                <div style="font-size:14px;color:rgba(255,255,255,0.65);line-height:1.55;">
                  Tu as demandé un lien de connexion à Talk2Me. Clique sur le bouton ci-dessous pour entrer.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;" align="left">
                <a href="${magicUrl}" style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:500;font-size:14px;">Me connecter à Talk2Me</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;">
                <div style="font-size:12px;color:rgba(255,255,255,0.45);line-height:1.55;">
                  Ce lien est valable 15 minutes et à usage unique. Si tu n'as rien demandé, ignore simplement cet email.
                </div>
                <div style="font-size:11px;color:rgba(255,255,255,0.30);margin-top:16px;word-break:break-all;">
                  Si le bouton ne marche pas, colle cette URL dans ton navigateur&nbsp;:<br>${magicUrl}
                </div>
              </td>
            </tr>
          </table>
          <div style="font-size:11px;color:rgba(255,255,255,0.30);margin-top:24px;">Talk2Me · talk2me.fr</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(magicUrl: string): string {
  return [
    'Talk2Me — clique pour te connecter',
    '',
    'Tu as demandé un lien de connexion à Talk2Me.',
    'Ouvre cette URL dans ton navigateur (lien valable 15 minutes, à usage unique) :',
    '',
    magicUrl,
    '',
    'Si tu n\'as rien demandé, ignore simplement cet email.',
    '',
    'Talk2Me · talk2me.fr',
  ].join('\n');
}

/**
 * Envoie le magic link par email via Brevo.
 * - email blocklist → fallback dev (pas d'envoi réel)
 * - pas de BREVO_API_KEY → fallback dev
 * - sinon → envoi HTTPS Brevo
 */
export async function sendMagicLink(
  email: string,
  magicUrl: string,
): Promise<SendMagicLinkResult> {
  if (isTestEmail(email)) {
    console.warn(`[mailer] BLOCKED test email: ${email} (doctrine emails_test_blocklist)`);
    return { sent: false, fallback_link: magicUrl, reason: 'test_email_blocked' };
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn(`[mailer] DEV MODE (no BREVO_API_KEY): magic link for ${email} = ${magicUrl}`);
    return { sent: false, fallback_link: magicUrl, reason: 'no_smtp_configured' };
  }

  const payload = {
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: [{ email }],
    replyTo: { email: REPLY_TO },
    subject: 'Talk2Me — ton lien de connexion',
    htmlContent: renderHtml(magicUrl),
    textContent: renderText(magicUrl),
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[mailer] Brevo HTTP ${res.status} for ${email}: ${txt.slice(0, 300)}`);
      // Fallback dev pour ne pas bloquer le user pendant qu'on debug SMTP.
      return { sent: false, fallback_link: magicUrl, reason: `brevo_http_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[mailer] Brevo network error for ${email}:`, e);
    return { sent: false, fallback_link: magicUrl, reason: 'network_error' };
  }
}

/** Exposé pour debug / preview HTML email. */
export function previewMagicLinkHtml(magicUrl: string): string {
  return renderHtml(magicUrl);
}
