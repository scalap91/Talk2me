/**
 * /schema/decoupage — COCKPIT modules (jumeau numérique T2M, Pascal 2026-06-30).
 * Se rend depuis lib/schema/registry (source de vérité unique). Grille par équipe,
 * statut réel déclaré, lien vers la fiche de chaque module. Tableau scale + fondations
 * conservés. Page interne (dev-only via schema/layout).
 */
import Link from 'next/link';
import { MODULES, TEAMS, STATUS_META, modulesByTeam, type ModStatus, getRole, teamsForRole, modulesForRole } from '@/lib/schema/registry';
import RoleSwitcher from '@/components/schema/RoleSwitcher';
import { cockpitContext } from '@/lib/schema/access';
import CockpitDenied from '@/components/schema/CockpitDenied';

export const dynamic = 'force-dynamic';

const SCALE: string[][] = [
  ['Base de données', 'better-sqlite3 (fichiers .db locaux, 1 writer)', 'PostgreSQL managé répliqué — 1 schéma/module', 'BLOQUANT'],
  ['Stockage médias', 'uploads sur disque local', 'Object storage (S3 / MinIO / R2) + CDN', 'BLOQUANT'],
  ['Cache / sessions', 'caches mémoire (Map) par process', 'Redis partagé (cache + sessions + rate-limit)', 'BLOQUANT'],
  ['Serveurs app', '1 machine, PM2 blue-green', 'N réplicas STATELESS derrière load-balancer', 'NÉCESSAIRE'],
  ['Temps réel', 'SFU local', 'SFU clusterisé (mediasoup) + TURN dédié', 'À dimensionner'],
  ['IA / GPU', 'GPU local (planté)', 'LLM via API (DeepSeek) OK sans GPU ; vidéo-avatar = GPU cloud', 'Le cœur NE dépend pas du GPU'],
];

function Bloc({ title, children, tone }: { title: string; children: React.ReactNode; tone?: string }) {
  return (
    <section className={'rounded-2xl border p-4 ' + (tone || 'border-white/10 bg-white/[0.03]')}>
      <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default async function DecoupagePage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  // BINDING AUTH RÉELLE : le rôle vient de la session, pas d'un ?role= libre.
  const ctx = await cockpitContext();
  if (!ctx.role) return <CockpitDenied loggedIn={!!ctx.user} />;
  const isAdmin = ctx.role === 'admin';
  const sp = await searchParams;
  // ?role= (view-as) n'est honoré QUE pour l'admin. Sinon verrouillé au rôle réel.
  const wantRole = typeof sp.role === 'string' && getRole(sp.role) ? (sp.role as string) : null;
  const viewingAs = isAdmin && wantRole && wantRole !== ctx.role;
  const roleKey = isAdmin && wantRole ? wantRole : ctx.role;
  const fromUrl = !!viewingAs;
  const role = getRole(roleKey)!;
  const visibleMods = modulesForRole(roleKey);
  const allowedTeams = new Set(teamsForRole(roleKey));
  const groups = modulesByTeam().filter((g) => allowedTeams.has(g.team));
  const counts = visibleMods.reduce((c, m) => { c[m.status] = (c[m.status] || 0) + 1; return c; }, {} as Record<ModStatus, number>);

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema" className="text-white/55 hover:text-white/90 text-[13px]">← Boussole</Link>
          <h1 className="text-[15px] font-medium">Cockpit · Modules · Équipes</h1>
          <div className="flex gap-3">
            <Link href="/schema/graph" className="text-sky-300/90 hover:text-sky-200 text-[13px]">Graphe →</Link>
            <Link href="/schema/diag" className="text-emerald-300/90 hover:text-emerald-200 text-[13px]">Diag →</Link>
            {isAdmin && <Link href="/schema/ops" className="text-orange-300/90 hover:text-orange-200 text-[13px]">Ops →</Link>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Bandeau de rôle — périmètre de vue */}
        <section className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-2 text-[13px] text-white/55 mb-1">
                {isAdmin ? (
                  <>
                    <span>Voir en tant que :</span>
                    <RoleSwitcher current={roleKey} fromUrl={fromUrl} />
                    {viewingAs && <span className="text-amber-300/80 text-[11.5px]">👁️ aperçu (ton rôle réel : admin)</span>}
                    <Link href="/schema/access" className="text-violet-300/80 hover:text-violet-200 text-[12px]">gérer les accès →</Link>
                  </>
                ) : (
                  <span>🔒 Rôle attribué à ton compte (verrouillé)</span>
                )}
                <Link href="/schema/roles" className="text-violet-300/80 hover:text-violet-200 text-[12px]">matrice →</Link>
              </div>
              <div className="text-[14px] font-semibold">{role.emoji} {role.name} — {visibleMods.length} module(s) visible(s) sur {MODULES.length}</div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {role.caps.map((c) => <span key={c} className="text-[10.5px] rounded bg-white/[0.06] border border-white/10 px-1.5 py-0.5 text-white/70">{c}</span>)}
                <span className={`text-[10.5px] rounded px-1.5 py-0.5 border ${role.sensitive ? 'bg-red-400/10 border-red-400/25 text-red-200/80' : 'bg-emerald-400/10 border-emerald-400/20 text-emerald-200/80'}`}>
                  {role.sensitive ? '🔓 paramètres sensibles' : '🔒 pas de modif sensible'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Vue d'ensemble — cockpit en un coup d'œil */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold">{visibleMods.length} modules · {groups.length} équipes</div>
              <p className="text-[12px] text-white/55 mt-0.5">Chaque module = une application dans l&apos;application : sa fiche, son API, son stockage, son équipe.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[12px]">
              {(Object.keys(counts) as ModStatus[]).filter((s) => counts[s] > 0).map((s) => (
                <span key={s} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                  {STATUS_META[s].dot} {counts[s]} <span className="text-white/45">{STATUS_META[s].label}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Légende */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/55 px-1">
          {(Object.keys(STATUS_META) as ModStatus[]).map((s) => (
            <span key={s}>{STATUS_META[s].dot} {STATUS_META[s].label}</span>
          ))}
        </div>

        {/* Grille par équipe */}
        {groups.map(({ team, mods }) => (
          <Bloc key={team} title={`${TEAMS[team].emoji} Équipe ${TEAMS[team].name}`}>
            <p className="text-[11.5px] text-white/45 -mt-1 mb-3">{TEAMS[team].scope}</p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {mods.map((m) => (
                <Link
                  key={m.key}
                  href={`/schema/module/${m.key}`}
                  className="group rounded-xl border border-white/8 bg-white/[0.02] p-3 hover:border-white/20 hover:bg-white/[0.05] transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[14px] font-semibold flex items-center gap-2">
                      <span>{m.emoji}</span>{m.name}
                    </div>
                    <span className="text-[15px] shrink-0" title={STATUS_META[m.status].label}>{STATUS_META[m.status].dot}</span>
                  </div>
                  <p className="text-[11.5px] text-white/60 mt-1 line-clamp-2">{m.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                    {m.apis.slice(0, 3).map((a) => (
                      <code key={a} className="bg-sky-400/10 border border-sky-400/15 text-sky-200/80 rounded px-1.5 py-0.5">{a}</code>
                    ))}
                    {m.env.length > 0 && <code className="bg-amber-400/10 border border-amber-400/15 text-amber-200/80 rounded px-1.5 py-0.5">{m.env.length} clé(s) env</code>}
                  </div>
                  <div className="mt-2 text-[11px] text-white/30 group-hover:text-white/60 transition">Ouvrir la fiche →</div>
                </Link>
              ))}
            </div>
          </Bloc>
        ))}

        <Bloc title="Vision : ce cockpit (jumeau numérique)">
          <p className="text-[13px] text-white/75 leading-relaxed">
            Objectif long terme : la boussole devient le <b>point d&apos;entrée unique</b> pour piloter T2M — voir
            d&apos;un coup d&apos;œil où en est le dev, quels modules sont finis/en cours, quelles API sont connectées,
            quels services sont en panne, qui travaille sur quoi, les dépendances, les coûts et les perfs.
          </p>
          <p className="text-[12px] text-white/50 mt-2">
            <b className="text-white/70">État actuel (Phase 1) :</b> architecture modulaire + fiche par module + statut réel + découpage par équipes.
            <b className="text-white/70"> Phases suivantes :</b> graphe des connexions live, centre de diagnostic (test API / quotas / temps de réponse),
            permissions par rôle/équipe, logs &amp; coûts en temps réel. Tout sera <b>grounded</b> (données réelles), jamais des voyants bidons.
          </p>
        </Bloc>

        <Bloc title="Prêt pour 300 000 users (et plus) ?" tone="border-red-400/25 bg-red-500/[0.06]">
          <p className="text-[13px] text-red-100/90 mb-3">
            <b>Franchement : pas encore en l&apos;état</b> côté infra (1 serveur + SQLite + uploads disque + caches mémoire).
            Mais le code est désormais <b>découpé en modules</b> (couche données éclatée en 16 fichiers autour d&apos;un socle) →
            chaque module peut migrer vers sa base/son serveur sans casser les autres. Reste à remplacer les briques d&apos;infra.
          </p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-[12px]">
              <thead className="bg-white/[0.04] text-white/55">
                <tr><th className="text-left px-3 py-2">Brique</th><th className="text-left px-3 py-2">Aujourd&apos;hui</th><th className="text-left px-3 py-2">Cible multi-serveur</th><th className="text-left px-3 py-2">Verdict</th></tr>
              </thead>
              <tbody>
                {SCALE.map((r, i) => (
                  <tr key={i} className="border-t border-white/8 align-top">
                    <td className="px-3 py-2 font-medium text-white/85">{r[0]}</td>
                    <td className="px-3 py-2 text-white/60">{r[1]}</td>
                    <td className="px-3 py-2 text-emerald-200/80">{r[2]}</td>
                    <td className="px-3 py-2 text-amber-200/80">{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloc>

        <Bloc title="Fondations multi-serveur — chantier en cours">
          <ul className="space-y-1.5 text-[13px] text-white/80">
            <li>✅ <b>lib/cache.ts</b> — cache unifié (mémoire aujourd&apos;hui, <b>prêt Redis</b>).</li>
            <li>✅ <b>lib/storage.ts</b> — stockage unifié (disque local, <b>prêt S3/MinIO/R2</b>).</li>
            <li>✅ <b>lib/db.ts cassé</b> — socle <code>db-core</code> + 16 modules data (users, sessions, chat, messages, social, cards, commerce, drive…). db.ts 7283 → ~1030 l.</li>
            <li>🔧 Migrer les caches <code>Map</code> → <code>lib/cache</code> ; router les uploads → <code>lib/storage</code> (module par module).</li>
            <li>⏳ Brancher PostgreSQL + Redis + object storage ; app stateless + load-balancer.</li>
          </ul>
        </Bloc>
      </div>
    </main>
  );
}
