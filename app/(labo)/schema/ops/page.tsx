/**
 * /schema/ops — LOGS & COÛTS (cockpit T2M, Pascal 2026-06-30). Garde serveur :
 * rôle à paramètres SENSIBLES (admin / infra / paiement) ou super-admin. Données
 * réelles (PM2, logs, tailles DB) ; honnête sur le monétaire. Page interne.
 */
import Link from 'next/link';
import { cockpitContext } from '@/lib/schema/access';
import { getRole } from '@/lib/schema/registry';
import CockpitDenied from '@/components/schema/CockpitDenied';
import OpsPanel from '@/components/schema/OpsPanel';

export const dynamic = 'force-dynamic';

export default async function OpsPage() {
  const ctx = await cockpitContext();
  const role = ctx.role ? getRole(ctx.role) : null;
  const allowed = ctx.isSuperAdmin || !!role?.sensitive;
  if (!allowed) return <CockpitDenied loggedIn={!!ctx.user} />;

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema/decoupage" className="text-white/55 hover:text-white/90 text-[13px]">← Cockpit</Link>
          <h1 className="text-[15px] font-medium">Logs &amp; Coûts</h1>
          <span className="w-16" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-7 space-y-5">
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[12.5px] text-white/70 leading-relaxed">
          Données <b className="text-white">réelles</b> : processus PM2 (statut, mémoire, CPU, uptime, redémarrages),
          dernières erreurs des logs, taille des bases sur disque. Côté <b>coûts</b>, seul ce qui est <b>mesurable</b>
          est affiché ; le monétaire non instrumenté est marqué comme tel — aucun chiffre inventé.
        </p>
        <OpsPanel />
        <p className="text-[11px] text-white/30">Source : <code>lib/schema/ops.ts</code> + <code>/api/schema/ops</code> (rôle sensible, dev-only).</p>
      </div>
    </main>
  );
}
