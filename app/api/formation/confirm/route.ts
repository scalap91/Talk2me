/**
 * Talk2Me — La RECRUE confirme son invitation en formation (Pascal 2026-08-08).
 * Le validateur convoque (ouvre l'accès) ; la recrue doit ACCEPTER avant de suivre.
 * POST {} → confirme MA participation (si un validateur m'a ouvert l'accès et que je ne suis pas déjà certifié).
 * Notifie le validateur (qui m'a ouvert) + le contributeur qui m'a envoyée.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasFormationAccess, confirmFormation, getFormationAccess, getFormationSender } from '@/lib/formation-access';
import { createNotif } from '@/lib/notifs';
import { getUserById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const nameOf = (id: string) => {
  const u = getUserById(id) as { display_name?: string; username?: string } | null;
  return u?.display_name || u?.username || 'quelqu’un';
};

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasFormationAccess(me.id)) return NextResponse.json({ ok: false, reason: 'pas_convoque' });

  const changed = confirmFormation(me.id);
  if (changed) {
    const acc = getFormationAccess(me.id);
    if (acc?.opened_by) createNotif(acc.opened_by, 'formation', 'Recrue confirmée', `${nameOf(me.id)} a confirmé sa participation à la formation.`);
    const sender = getFormationSender(me.id);
    if (sender && sender !== me.id) createNotif(sender, 'formation', 'Ta recrue a confirmé', `${nameOf(me.id)} a confirmé qu'elle suit la formation.`);
  }
  return NextResponse.json({ ok: true, confirmed: true });
}
