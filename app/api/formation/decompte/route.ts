/**
 * Talk2Me — DÉCOMPTE MENSUEL DU FORMATEUR (Pascal 2026-08-08).
 * Le formateur-validateur voit EN CHIFFRES, mois par mois, la santé des recrues qu'il a formées
 * (transactions réelles). Sa paie en découle (versée par Talk2Me, jamais direct de la recrue).
 * Chiffres mauvais = formation/suivi bâclés. Réservé aux validateurs.
 * GET ?month=YYYY-MM (défaut = mois courant) → totaux + détail par recrue + sélecteur de mois.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { listCohort } from '@/lib/formation-access';
import { sumContributorActivity } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidateur(me: { id: string; email?: string | null; is_admin?: boolean }): boolean {
  return !!me.is_admin || hasPermission(me.id, me.email || '', 'curation_validateur');
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isValidateur(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const now = new Date();
  const monthParam = (req.nextUrl.searchParams.get('month') || '').match(/^\d{4}-\d{2}$/)
    ? (req.nextUrl.searchParams.get('month') as string)
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, mo] = monthParam.split('-').map(Number);
  const since = new Date(y, mo - 1, 1).getTime();
  const until = new Date(y, mo, 1).getTime();

  const cohort = listCohort(me.id);
  const recrues = cohort.map((c) => {
    const a = sumContributorActivity(c.user_id, since, until);
    return { user_id: c.user_id, name: c.name, certified: c.certified, tx_count: a.tx_count, volume_cents: a.volume_cents, commission_cents: a.commission_cents, active: a.tx_count > 0 };
  }).sort((x, z) => z.volume_cents - x.volume_cents);

  const totals = recrues.reduce((t, r) => ({
    recrues: t.recrues + 1,
    formees: t.formees + (r.certified ? 1 : 0),
    actives: t.actives + (r.active ? 1 : 0),
    tx_count: t.tx_count + r.tx_count,
    volume_cents: t.volume_cents + r.volume_cents,
    commission_cents: t.commission_cents + r.commission_cents,
  }), { recrues: 0, formees: 0, actives: 0, tx_count: 0, volume_cents: 0, commission_cents: 0 });

  // Sélecteur : les 6 derniers mois (clés YYYY-MM).
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return NextResponse.json({ ok: true, month: monthParam, months, recrues, totals });
}
