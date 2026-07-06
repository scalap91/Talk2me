/**
 * /schema/graph — GRAPHE DES CONNEXIONS (jumeau numérique T2M, Pascal 2026-06-30).
 * (A) Graphe réseau des dépendances entre modules (depuis registry.edges()).
 * (B) Parcours de requête réels (FLOWS) : « où passe une requête », chaque étape
 * affichant son vrai statut ; la santé d'un flux = sa pire étape. Tout grounded.
 * SVG rendu côté serveur, zéro lib lourde. Page interne (dev-only via schema/layout).
 */
import Link from 'next/link';
import { MODULES, FLOWS, STATUS_META, edges, getModule, type ModStatus } from '@/lib/schema/registry';
import { cockpitContext } from '@/lib/schema/access';
import CockpitDenied from '@/components/schema/CockpitDenied';

export const dynamic = 'force-dynamic';

const COLOR: Record<ModStatus, string> = {
  ok: '#34d399', partial: '#fbbf24', dev: '#60a5fa', error: '#f87171', off: '#6b7280',
};
const SEV: Record<ModStatus, number> = { error: 4, partial: 3, dev: 2, ok: 1, off: 0 };

function worstFlowStatus(stepStatuses: ModStatus[]): ModStatus {
  if (!stepStatuses.length) return 'ok';
  return stepStatuses.reduce((a, b) => (SEV[b] > SEV[a] ? b : a), 'ok' as ModStatus);
}

export default async function GraphPage() {
  const ctx = await cockpitContext();
  if (!ctx.role) return <CockpitDenied loggedIn={!!ctx.user} />;
  // ---- (A) Layout circulaire du graphe de dépendances ----
  const N = MODULES.length;
  const cx = 400, cy = 400, R = 290, LR = 340;
  const pos = new Map<string, { x: number; y: number; a: number }>();
  MODULES.forEach((m, i) => {
    const a = (-90 + (360 / N) * i) * (Math.PI / 180);
    pos.set(m.key, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a });
  });
  const E = edges();

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema/decoupage" className="text-white/55 hover:text-white/90 text-[13px]">← Cockpit</Link>
          <h1 className="text-[15px] font-medium">Graphe des connexions</h1>
          <span className="w-16" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        {/* (B) PARCOURS DE REQUÊTE — la réponse directe à « où passe une requête » */}
        <section>
          <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-1">Parcours d&apos;une requête</h2>
          <p className="text-[12px] text-white/50 mb-4">Le chemin réel d&apos;une requête à travers les modules et services. La pastille d&apos;une étape = son vrai statut. La santé du flux = sa pire étape.</p>
          <div className="space-y-4">
            {FLOWS.map((f) => {
              const statuses: ModStatus[] = f.steps
                .map((s) => (s.moduleKey ? getModule(s.moduleKey)?.status : s.status))
                .filter(Boolean) as ModStatus[];
              const health = worstFlowStatus(statuses);
              return (
                <div key={f.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="text-[14px] font-semibold">{f.name}</div>
                    <span className="text-[12px] shrink-0" title={STATUS_META[health].label}>{STATUS_META[health].dot} {STATUS_META[health].label}</span>
                  </div>
                  <p className="text-[12px] text-white/55 mb-3">{f.desc}</p>
                  <div className="flex flex-wrap items-stretch gap-1.5">
                    {f.steps.map((s, i) => {
                      const mod = s.moduleKey ? getModule(s.moduleKey) : undefined;
                      const st = mod?.status ?? s.status;
                      const dot = st ? STATUS_META[st].dot : '';
                      const inner = (
                        <span
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px]"
                          style={{ borderColor: st ? COLOR[st] + '55' : 'rgba(255,255,255,0.12)', background: st ? COLOR[st] + '12' : 'rgba(255,255,255,0.02)' }}
                        >
                          {dot && <span className="text-[10px]">{dot}</span>}
                          {mod ? `${mod.emoji} ${mod.name}` : s.label}
                        </span>
                      );
                      return (
                        <span key={i} className="inline-flex items-center gap-1.5">
                          {mod ? <Link href={`/schema/module/${mod.key}`} className="hover:opacity-80">{inner}</Link> : inner}
                          {i < f.steps.length - 1 && <span className="text-white/30 text-[13px]">→</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* (A) GRAPHE RÉSEAU DES DÉPENDANCES */}
        <section>
          <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-1">Réseau des dépendances</h2>
          <p className="text-[12px] text-white/50 mb-3">Chaque trait = « dépend de ». Couleur des nœuds = statut du module. {E.length} liens entre {N} modules.</p>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2 overflow-x-auto">
            <svg viewBox="0 0 800 800" className="w-full max-w-[700px] mx-auto" style={{ aspectRatio: '1/1' }}>
              {/* arêtes */}
              {E.map((e, i) => {
                const a = pos.get(e.from)!, b = pos.get(e.to)!;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.13)" strokeWidth={1} />;
              })}
              {/* nœuds + labels */}
              {MODULES.map((m) => {
                const p = pos.get(m.key)!;
                const right = Math.cos(p.a) >= 0;
                const lx = cx + LR * Math.cos(p.a);
                const ly = cy + LR * Math.sin(p.a);
                return (
                  <g key={m.key}>
                    <circle cx={p.x} cy={p.y} r={9} fill={COLOR[m.status]} stroke="#0e0e12" strokeWidth={2} />
                    <text
                      x={lx} y={ly}
                      fill="rgba(255,255,255,0.78)" fontSize={12}
                      textAnchor={right ? 'start' : 'end'} dominantBaseline="middle"
                    >
                      {m.emoji} {m.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/55 px-1 mt-3">
            {(Object.keys(STATUS_META) as ModStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR[s] }} /> {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </section>

        <p className="text-[11px] text-white/30">
          Données : <code>lib/schema/registry.ts</code> (modules + FLOWS + edges). Graphe et parcours générés depuis la source de vérité unique.
        </p>
      </div>
    </main>
  );
}
