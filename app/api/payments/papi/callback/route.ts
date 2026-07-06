/**
 * POST /api/payments/papi/callback (Pascal 2026-06-23) — webhook PaPi.
 *
 * PaPi POST ici après un paiement avec le statut final. On authentifie le callback
 * en vérifiant que paymentReference correspond à un intent ET que notificationToken
 * matche celui stocké à la création (PaPi n'a pas de signature HMAC ; le token est
 * le secret par-paiement). Puis on crédite le wallet UNE fois (idempotent).
 *
 * Doctrine [[feedback_watchdog_pipeline]] : succès/échec/rejet → Telegram.
 * Route PUBLIQUE (pas de session) → whitelistée dans middleware.ts.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIntent, markIntentPaid, markIntentFailed } from '@/lib/payments';
import type { PapiNotification } from '@/lib/payments/papi';
import { notifyTelegram } from '@/lib/ai-ops/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: PapiNotification = {};
  try { body = (await req.json()) as PapiNotification; } catch { /* corps illisible */ }

  const ref = String(body.paymentReference || '');
  const intent = ref ? getIntent(ref) : null;
  if (!intent) {
    // Référence inconnue : on accuse réception (PaPi ne réessaiera pas en boucle)
    // mais on aboie, car un callback non rattaché est suspect.
    notifyTelegram(`⚠️ PaPi callback — référence inconnue: ${ref || '(vide)'}`);
    return NextResponse.json({ ok: true, ignored: 'unknown_ref' });
  }

  // Authentification : le token du callback doit matcher celui stocké à la création.
  if (!intent.notif_token || body.notificationToken !== intent.notif_token) {
    notifyTelegram(`🚨 PaPi callback REJETÉ — token invalide (ref ${ref}). Tentative de falsification ?`);
    return NextResponse.json({ ok: false, error: 'bad_token' }, { status: 401 });
  }

  const status = String(body.paymentStatus || '').toUpperCase();
  const amount = typeof body.amount === 'number' ? body.amount : intent.amount_cents;
  const method = body.paymentMethod || '?';

  if (status === 'SUCCESS') {
    const r = markIntentPaid(intent.id, body.merchantPaymentReference || null);
    // r.error === 'already_paid' = doublon de callback, normal et inoffensif (idempotent).
    if (r.ok) {
      notifyTelegram(`💳 PaPi ENCAISSÉ ${amount} Ar via ${method} (ref ${ref}). Solde crédité.`);
    }
  } else if (status === 'FAILED') {
    markIntentFailed(intent.id);
    notifyTelegram(`❌ PaPi paiement ÉCHOUÉ ${amount} Ar via ${method} (ref ${ref}). ${body.message || ''}`.trim());
  }
  // PENDING : on accuse réception, on attend le callback final.

  return NextResponse.json({ ok: true });
}
