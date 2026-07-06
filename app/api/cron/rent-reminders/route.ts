/**
 * Cron LOYER SEMI-AUTO. Protégé par x-cron-secret (= CRON_SECRET). Appelé 1×/jour.
 * 1) génère les échéances du mois pour tous les baux actifs ;
 * 2) RELANCE par push les locataires qui ont une échéance impayée ;
 * 3) en RETARD (échéance dépassée) : push locataire + bailleur (watchdog).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateAllDuesNow, listUnpaidDues } from '@/lib/leases';
import { sendPushToUser } from '@/lib/push';
import { formatMoney } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const leases = generateAllDuesNow();
  const unpaid = listUnpaidDues();
  const now = Date.now();
  let reminded = 0, overdue = 0;
  for (const d of unpaid) {
    const amount = formatMoney(d.amount_cents);
    const what = d.title ? ` (${d.title})` : '';
    if (d.due_date < now) {
      overdue++;
      sendPushToUser(d.tenant_id, { title: '⚠️ Loyer en retard', body: `Loyer ${d.period}${what} : ${amount} en attente. Règle-le dans Talk2Me.`, url: '/loyers' }).catch(() => {});
      sendPushToUser(d.landlord_id, { title: '⚠️ Loyer impayé', body: `Le loyer ${d.period}${what} (${amount}) n'est pas réglé.`, url: '/loyers' }).catch(() => {});
    } else {
      reminded++;
      sendPushToUser(d.tenant_id, { title: '🏠 Loyer à régler', body: `Loyer ${d.period}${what} : ${amount}. Paie en 1 clic dans Talk2Me.`, url: '/loyers' }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, leases, reminded, overdue });
}
