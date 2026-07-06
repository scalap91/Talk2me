/**
 * /schema/access — gestion des rôles cockpit (SUPER-ADMIN only). Pascal 2026-06-30.
 * Garde côté serveur via cockpitContext().isSuperAdmin (auth réelle). Page interne.
 */
import Link from 'next/link';
import { cockpitContext } from '@/lib/schema/access';
import CockpitDenied from '@/components/schema/CockpitDenied';
import AccessManager from '@/components/schema/AccessManager';

export const dynamic = 'force-dynamic';

export default async function AccessPage() {
  const ctx = await cockpitContext();
  if (!ctx.isSuperAdmin) return <CockpitDenied loggedIn={!!ctx.user} />;

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema/decoupage" className="text-white/55 hover:text-white/90 text-[13px]">← Cockpit</Link>
          <h1 className="text-[15px] font-medium">Gestion des accès</h1>
          <Link href="/schema/roles" className="text-violet-300/80 hover:text-violet-200 text-[13px]">Matrice →</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-7 space-y-5">
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[12.5px] text-white/70 leading-relaxed">
          Attribue à chaque collaborateur un <b>rôle cockpit</b> (lié à son compte authentifié). Il ne verra alors
          que le périmètre de son rôle, sans pouvoir l&apos;élargir. Toi (super-admin via <code>AI_OPS_ADMIN_*</code>) gardes
          le rôle <b>admin</b> inconditionnellement.
        </p>
        <AccessManager />
        <p className="text-[11px] text-white/30">Source : table <code>cockpit_access</code> + <code>/api/schema/access</code> (super-admin, dev-only).</p>
      </div>
    </main>
  );
}
