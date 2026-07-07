/**
 * /schema — Boussole technique Talk2Me (#408b refonte Pascal 2026-06-05).
 *
 * Doctrine [[airbizness-schema-technique]] : la page est le MIROIR du code.
 *
 * Refonte #408b (verbatim Pascal) :
 *   - "JE DOIT VOIR CHAQUE JOUR LIA SAMELIORER AVEC CE MODULE"
 *      → Card Qualité Léa + sparkline 7j en tête (LeaQualityCard).
 *   - "POURQUOI DANS LA BOUSSOLE ON NE VOIT PAS DE CODE NI DE SCHEMA GRAPHIQUE"
 *      → Graphe Mermaid des dépendances inter-modules (ModulesGraph).
 *      → Code source affiché sur chaque page module (cf. /schema/[id]).
 *   - Lien vers /schema/ai-ops (dashboard AI Ops déplacé sous la Boussole).
 */

import Link from 'next/link';
import {
  MODULES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  countByCategory,
  countByStatus,
  type ModuleCategory,
} from '@/lib/schema/modules';
import SchemaFilters from './SchemaFilters';
import LeaQualityCard from './LeaQualityCard';
import ModulesGraph from './ModulesGraph';

// Cette page a maintenant des composants client qui font des fetch live,
// la sortie statique n'a plus de sens. On reste server-rendered.
export const dynamic = 'force-dynamic';

export default function SchemaPage() {
  const byCat = countByCategory();
  const byStatus = countByStatus();

  // Ordre fixé des catégories pour l'affichage
  const orderedCategories: ModuleCategory[] = [
    'auth',
    'social',
    'chat',
    'ia',
    'tools',
    'cards',
    'call',
    'feed',
    'infra',
  ];

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link
            href="/home"
            className="text-white/55 hover:text-white/90 text-[13px]"
          >
            ← Retour
          </Link>
          <h1 className="text-[15px] font-medium tracking-tight">
            Talk2Me · Boussole technique
          </h1>
          <div className="flex gap-3">
            <Link
              href="/schema/liens"
              className="text-[12px] text-sky-300 hover:text-sky-200"
            >
              Liens →
            </Link>
            <Link
              href="/schema/decoupage"
              className="text-[12px] text-amber-300 hover:text-amber-200"
            >
              Cockpit →
            </Link>
            <Link
              href="/schema/card-os"
              className="text-[12px] text-fuchsia-300 hover:text-fuchsia-200"
            >
              Card OS →
            </Link>
            <Link
              href="/schema/db-core"
              className="text-[12px] text-violet-300 hover:text-violet-200"
            >
              db-core →
            </Link>
            <Link
              href="/schema/features"
              className="text-[12px] text-emerald-300 hover:text-emerald-200"
            >
              Features →
            </Link>
            <Link
              href="/schema/ai-ops"
              className="text-[12px] text-pink-300 hover:text-pink-200"
            >
              AI Ops →
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Compteurs globaux */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-[11px] uppercase tracking-wider text-white/45 mb-3">
            Vue d&apos;ensemble
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-[13px]">
            <Counter label="Modules" value={MODULES.length} />
            <Counter
              label={STATUS_LABELS.stable}
              value={byStatus.stable}
              tone="emerald"
            />
            <Counter label={STATUS_LABELS.wip} value={byStatus.wip} tone="amber" />
            <Counter
              label={STATUS_LABELS.todo}
              value={byStatus.todo}
              tone="sky"
            />
            <Counter
              label={STATUS_LABELS.deprecated}
              value={byStatus.deprecated}
              tone="red"
            />
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-white/55">
            Cette page est générée depuis{' '}
            <code className="font-mono text-white/75">lib/schema/modules.ts</code>.
            Elle est censée refléter exactement l&apos;état du code à chaque
            build. Si elle ment, c&apos;est un bug : ouvrir le manifeste.
          </p>
        </section>

        {/* Design system + switch d'affichage (Pascal 2026-07-07) */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-[11px] uppercase tracking-wider text-white/45 mb-3">Design system</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
            <a href="https://claude.ai/code/artifact/f074ba2b-f63c-44d4-a772-83cb8c7b81d8" target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-3 flex items-center gap-2 transition-colors">
              🎨 <span>Design system (tokens, doctrine Carte/Photo)</span>
            </a>
            <a href="https://claude.ai/code/artifact/a15d9394-f0c3-49e7-954b-f83e595a574f" target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-4 py-3 flex items-center gap-2 transition-colors">
              📱 <span>Maquettes (toutes les pages, Carte vs Photo)</span>
            </a>
            <a href="/admin/display" className="rounded-2xl border border-[#FF7F11]/40 bg-[#FF7F11]/10 hover:bg-[#FF7F11]/20 px-4 py-3 flex items-center gap-2 font-semibold transition-colors">
              🔀 <span>SWITCH Carte / Photo</span>
            </a>
          </div>
        </section>

        {/* Qualité Léa (client, fetch /api/schema/lea-trend) */}
        <LeaQualityCard />

        {/* Graphe des modules (client, mermaid) */}
        <ModulesGraph modules={MODULES} />

        {/* Filtres + liste (client) */}
        <SchemaFilters
          modules={MODULES}
          orderedCategories={orderedCategories}
          countsByCategory={byCat}
        />
      </div>
    </main>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'emerald' | 'amber' | 'sky' | 'red';
}) {
  const toneCls =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : tone === 'sky'
          ? 'text-sky-300'
          : tone === 'red'
            ? 'text-red-300'
            : 'text-white/95';
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wider text-white/45">
        {label}
      </div>
      <div className={`text-[20px] font-medium ${toneCls}`}>{value}</div>
    </div>
  );
}
