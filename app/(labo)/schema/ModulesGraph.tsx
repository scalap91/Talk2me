'use client';

/**
 * Talk2Me #408b — Graphe Mermaid des dépendances inter-modules (Pascal 2026-06-05).
 *
 * Verbatim Pascal : "POURQUOI DANS LA BOUSSOLE ON NE VOIT PAS DE CODE NI DE
 * SCHEMA GRAPHIQUE DES MODULE".
 *
 * Choix mermaid (vs react-flow) :
 *   - statique, pas besoin d'éditeur drag/drop
 *   - rendu auto layout dagre
 *   - peu de boilerplate, contenu généré depuis MODULES en plain text
 *   - nodes cliquables via Mermaid `click X "/schema/X"`
 *
 * Limites :
 *   - Avec ~40 modules, le rendu est dense. On filtre depuis le client : on
 *     ne montre que les arêtes inter-catégories par défaut, l'utilisateur
 *     peut basculer en "tout afficher".
 */

import { useEffect, useRef, useState } from 'react';
import type {
  ModuleCategory,
  ModuleSpec,
} from '@/lib/schema/modules';

interface Props {
  modules: ModuleSpec[];
}

const CATEGORY_FILL: Record<ModuleCategory, string> = {
  auth: '#dc2626',
  social: '#06b6d4',
  chat: '#3b82f6',
  ia: '#ec4899',
  tools: '#f59e0b',
  cards: '#10b981',
  call: '#f97316',
  feed: '#f87171',
  infra: '#64748b',
};

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildMermaid(modules: ModuleSpec[], mode: 'all' | 'inter-cat'): string {
  const lines: string[] = ['graph LR'];
  const idMap = new Map<string, string>();
  for (const m of modules) {
    const sid = safeId(m.id);
    idMap.set(m.id, sid);
    // Truncate name for légibilité
    const label = m.name.length > 22 ? m.name.slice(0, 22) + '…' : m.name;
    lines.push(`  ${sid}["${label}"]`);
    lines.push(`  class ${sid} cat_${m.category}`);
    // Click handler pour ouvrir la page module
    lines.push(`  click ${sid} "/schema/${m.id}" _self`);
  }
  // Arêtes
  for (const m of modules) {
    const from = idMap.get(m.id);
    if (!from || !m.depends_on) continue;
    for (const dep of m.depends_on) {
      const tgt = modules.find((x) => x.id === dep);
      if (!tgt) continue;
      if (mode === 'inter-cat' && tgt.category === m.category) continue;
      const to = idMap.get(dep);
      if (!to) continue;
      lines.push(`  ${from} --> ${to}`);
    }
  }
  // Classes (couleurs par catégorie)
  for (const [cat, fill] of Object.entries(CATEGORY_FILL)) {
    lines.push(
      `  classDef cat_${cat} fill:${fill},stroke:${fill},color:#fff,stroke-width:1px,rx:6,ry:6`,
    );
  }
  return lines.join('\n');
}

export default function ModulesGraph({ modules }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'inter-cat' | 'all'>('inter-cat');
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    setLoaded(false);
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            background: 'transparent',
            primaryColor: '#1a1a22',
            primaryTextColor: '#e5e5e5',
            lineColor: 'rgba(255,255,255,0.25)',
            fontSize: '12px',
          },
          flowchart: {
            curve: 'basis',
            nodeSpacing: 35,
            rankSpacing: 50,
            padding: 10,
          },
          securityLevel: 'loose', // pour autoriser les click handlers vers /schema/...
        });
        const code = buildMermaid(modules, mode);
        const { svg, bindFunctions } = await mermaid.render(
          'modules-graph-' + Date.now(),
          code,
        );
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        // Responsive : le SVG mermaid a une largeur fixe → illisible sur mobile.
        // On le force à tenir dans la largeur de l'écran (Pascal 2026-06-29).
        const svgEl = ref.current.querySelector('svg');
        if (svgEl) {
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');
          svgEl.style.width = '100%';
          svgEl.style.height = 'auto';
          svgEl.style.maxWidth = '100%';
        }
        if (bindFunctions) bindFunctions(ref.current);
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modules, mode]);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-white/45">
          Carte des modules · dépendances
        </div>
        <div className="flex gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode('inter-cat')}
            className={
              'px-2.5 h-7 rounded-full border transition-colors ' +
              (mode === 'inter-cat'
                ? 'bg-white/15 border-white/30 text-white'
                : 'bg-white/[0.03] border-white/10 text-white/55 hover:text-white')
            }
          >
            Inter-catégorie
          </button>
          <button
            type="button"
            onClick={() => setMode('all')}
            className={
              'px-2.5 h-7 rounded-full border transition-colors ' +
              (mode === 'all'
                ? 'bg-white/15 border-white/30 text-white'
                : 'bg-white/[0.03] border-white/10 text-white/55 hover:text-white')
            }
          >
            Tout
          </button>
        </div>
      </div>

      {err && (
        <div className="text-[12px] text-red-300/80 py-4">
          Rendu mermaid en échec : {err}
        </div>
      )}

      {!loaded && !err && (
        <div className="text-[12px] text-white/45 py-4 animate-pulse">
          Rendu du graphe…
        </div>
      )}

      <div
        ref={ref}
        className="modules-graph overflow-x-auto -mx-2"
        style={{ minHeight: 240 }}
      />

      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
        {Object.entries(CATEGORY_FILL).map(([cat, color]) => (
          <span
            key={cat}
            className="inline-flex items-center gap-1.5 text-white/55"
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: color }}
            />
            {cat}
          </span>
        ))}
      </div>
      <p className="text-[10.5px] text-white/35 mt-2">
        Clic sur un module = ouvrir sa fiche. Le mode &quot;Inter-catégorie&quot; cache
        les arêtes intra-catégorie pour gagner en lisibilité.
      </p>
    </section>
  );
}
