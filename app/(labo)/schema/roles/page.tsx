/**
 * /schema/roles — MATRICE DES PERMISSIONS (cockpit T2M, Pascal 2026-06-30).
 * Rôles × équipes : qui voit quoi. Capacités déclarées + accès aux paramètres
 * sensibles. « Voir le cockpit comme ce rôle » → /schema/decoupage?role=. Filtre de
 * VUE ; l'enforcement par compte authentifié = étape future. Page interne.
 */
import Link from 'next/link';
import { ROLES, TEAMS, teamsForRole, modulesForRole, type TeamKey } from '@/lib/schema/registry';
import { cockpitContext } from '@/lib/schema/access';
import CockpitDenied from '@/components/schema/CockpitDenied';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const ctx = await cockpitContext();
  if (!ctx.role) return <CockpitDenied loggedIn={!!ctx.user} />;
  const teamKeys = Object.keys(TEAMS) as TeamKey[];

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema/decoupage" className="text-white/55 hover:text-white/90 text-[13px]">← Cockpit</Link>
          <h1 className="text-[15px] font-medium">Permissions · Rôles × Équipes</h1>
          <span className="w-16" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[12.5px] text-white/70 leading-relaxed">
          Chaque utilisateur appartient à une ou plusieurs équipes ; les droits sont attribués par <b>rôle</b>.
          Chacun ne voit que les modules de son périmètre. Ici, c&apos;est un <b>filtre de vue</b> du cockpit
          (sélectionnable en haut du cockpit) ; lier ces rôles aux <b>comptes authentifiés</b> (enforcement réel)
          est l&apos;étape suivante.
        </p>

        {/* Matrice */}
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-[12px] border-collapse">
            <thead className="bg-white/[0.04] text-white/55">
              <tr>
                <th className="text-left px-3 py-2 sticky left-0 bg-[#16181f]">Rôle</th>
                {teamKeys.map((t) => (
                  <th key={t} className="px-2 py-2 text-center" title={TEAMS[t].name}>{TEAMS[t].emoji}</th>
                ))}
                <th className="px-3 py-2 text-center">Sensible</th>
                <th className="px-3 py-2 text-center">Modules</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => {
                const seen = new Set(teamsForRole(r.key));
                const nbMods = modulesForRole(r.key).length;
                return (
                  <tr key={r.key} className="border-t border-white/8">
                    <td className="px-3 py-2 sticky left-0 bg-[#0e0e12] whitespace-nowrap">
                      <Link href={`/schema/decoupage?role=${r.key}`} className="font-medium hover:text-violet-200">{r.emoji} {r.name}</Link>
                    </td>
                    {teamKeys.map((t) => (
                      <td key={t} className="px-2 py-2 text-center">
                        {seen.has(t) ? <span className="text-emerald-400">●</span> : <span className="text-white/12">·</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">{r.sensitive ? '🔓' : '🔒'}</td>
                    <td className="px-3 py-2 text-center text-white/60">{nbMods}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Détail des rôles */}
        <div className="grid sm:grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <div key={r.key} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <div className="text-[14px] font-semibold">{r.emoji} {r.name}</div>
                <Link href={`/schema/decoupage?role=${r.key}`} className="text-[11.5px] text-violet-300/80 hover:text-violet-200">voir comme →</Link>
              </div>
              <div className="text-[11.5px] text-white/55 mt-1">
                Équipes : {r.teams === 'all' ? <span className="text-emerald-300/80">toutes</span> : teamsForRole(r.key).map((t) => `${TEAMS[t].emoji} ${TEAMS[t].name}`).join(' · ')}
              </div>
              <ul className="mt-2 space-y-0.5 text-[11.5px] text-white/70 list-disc pl-4">
                {r.caps.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/45">
          {(Object.keys(TEAMS) as TeamKey[]).map((t) => <span key={t}>{TEAMS[t].emoji} {TEAMS[t].name}</span>)}
        </div>

        <p className="text-[11px] text-white/30">Source : <code>lib/schema/registry.ts</code> (ROLES + TEAMS). 🔓 = peut modifier les paramètres sensibles (clés/infra).</p>
      </div>
    </main>
  );
}
