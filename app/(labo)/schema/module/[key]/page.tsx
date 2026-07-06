/**
 * /schema/module/[key] — FICHE d'un module (jumeau numérique T2M, Pascal 2026-06-30).
 * Rendu depuis lib/schema/registry. Diagnostic env LIVE : présence des clés au runtime
 * (process.env), JAMAIS la valeur (doctrine PII air-gap / sécurité). Page interne.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModule, MODULES, TEAMS, STATUS_META } from '@/lib/schema/registry';
import { cockpitContext } from '@/lib/schema/access';
import CockpitDenied from '@/components/schema/CockpitDenied';

export const dynamic = 'force-dynamic';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Chips({ items, empty }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="text-[12px] text-white/30">{empty || '—'}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <code key={x} className="bg-white/[0.05] border border-white/8 rounded px-1.5 py-0.5 text-[11.5px] text-white/75">{x}</code>
      ))}
    </div>
  );
}

function List({ items, empty, tone }: { items: string[]; empty: string; tone?: string }) {
  if (!items.length) return <span className="text-[12px] text-white/30">{empty}</span>;
  return (
    <ul className="space-y-1 text-[12.5px] list-disc pl-4">
      {items.map((x, i) => <li key={i} className={tone || 'text-white/75'}>{x}</li>)}
    </ul>
  );
}

export default async function ModuleFichePage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await cockpitContext();
  if (!ctx.role) return <CockpitDenied loggedIn={!!ctx.user} />;
  const { key } = await params;
  const m = getModule(key);
  if (!m) notFound();

  const team = TEAMS[m.team];
  const st = STATUS_META[m.status];
  // Diagnostic LIVE : présence des variables d'env (NOM uniquement, jamais la valeur).
  const envState = m.env.map((name) => ({ name, present: !!(process.env[name] && String(process.env[name]).length > 0) }));

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema/decoupage" className="text-white/55 hover:text-white/90 text-[13px]">← Cockpit</Link>
          <h1 className="text-[14px] font-medium truncate px-2">{m.emoji} {m.name}</h1>
          <span className="text-[15px]" title={st.label}>{st.dot}</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-7 space-y-5">
        {/* En-tête */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2 text-[12px] text-white/55">
            <span className="rounded-md bg-white/[0.06] border border-white/10 px-2 py-0.5">{team.emoji} Équipe {team.name}</span>
            <span className="rounded-md bg-white/[0.06] border border-white/10 px-2 py-0.5">{st.dot} {st.label}</span>
          </div>
          <p className="text-[13.5px] text-white/85 mt-3 leading-relaxed">{m.description}</p>
          <p className="text-[12.5px] text-white/55 mt-2"><b className="text-white/70">Objectif :</b> {m.objectif}</p>
        </section>

        {/* Diagnostic env LIVE */}
        <Field label="Diagnostic — clés / variables d'env (présence live, jamais la valeur)">
          {envState.length === 0 ? (
            <span className="text-[12px] text-white/30">Aucune variable d&apos;env propre à ce module.</span>
          ) : (
            <div className="space-y-1.5">
              {envState.map((e) => (
                <div key={e.name} className="flex items-center justify-between text-[12.5px]">
                  <code className="text-white/75">{e.name}</code>
                  <span className={e.present ? 'text-emerald-300' : 'text-white/40'}>
                    {e.present ? '🟢 présente' : '⚪ absente'}
                  </span>
                </div>
              ))}
              <p className="text-[10.5px] text-white/35 pt-1">Détection par nom exact au runtime. La valeur n&apos;est jamais lue ni affichée.</p>
            </div>
          )}
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="APIs externes"><Chips items={m.apis} empty="aucune" /></Field>
          <Field label="Services connectés"><Chips items={m.services} empty="—" /></Field>
          <Field label="Bases / data"><Chips items={m.dbs} empty="—" /></Field>
          <Field label="Endpoints"><Chips items={m.endpoints} empty="—" /></Field>
          <Field label="Clés API nécessaires"><Chips items={m.keys} empty="aucune" /></Field>
          <Field label="Dépendances (modules)">
            {m.deps.length === 0 ? <span className="text-[12px] text-white/30">aucune</span> : (
              <div className="flex flex-wrap gap-1.5">
                {m.deps.map((d) => {
                  const dm = getModule(d);
                  return (
                    <Link key={d} href={`/schema/module/${d}`} className="rounded px-1.5 py-0.5 text-[11.5px] bg-sky-400/10 border border-sky-400/20 text-sky-200/85 hover:bg-sky-400/20">
                      {dm ? `${dm.emoji} ${dm.name}` : d}
                    </Link>
                  );
                })}
              </div>
            )}
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Tâches restantes / roadmap"><List items={m.todos} empty="à jour" tone="text-amber-100/80" /></Field>
          <Field label="Bugs connus"><List items={m.bugs} empty="aucun connu" tone="text-red-200/80" /></Field>
        </div>

        {/* Modules dépendants (qui m'utilise) */}
        <Field label="Utilisé par">
          {(() => {
            const used = MODULES.filter((x) => x.deps.includes(m.key));
            return used.length === 0 ? <span className="text-[12px] text-white/30">aucun module déclaré</span> : (
              <div className="flex flex-wrap gap-1.5">
                {used.map((x) => (
                  <Link key={x.key} href={`/schema/module/${x.key}`} className="rounded px-1.5 py-0.5 text-[11.5px] bg-white/[0.05] border border-white/10 text-white/75 hover:bg-white/10">
                    {x.emoji} {x.name}
                  </Link>
                ))}
              </div>
            );
          })()}
        </Field>

        <p className="text-[11px] text-white/30 pt-2">
          Données : <code>lib/schema/registry.ts</code> (source de vérité unique). Statut = état déclaré, honnête. Diagnostic env = live.
        </p>
      </div>
    </main>
  );
}
