/**
 * /schema/[id] — Détail d'un module Talk2Me.
 *
 * Lit le manifeste lib/schema/modules.ts et affiche :
 *   - Header (nom + status badge + catégorie)
 *   - Responsabilité (1 ligne)
 *   - Description
 *   - Fichiers impliqués
 *   - Endpoints API exposés
 *   - Tables DB
 *   - Dépendances (depends_on) + Utilisé par (calculé inverse)
 *   - Doctrines liées
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  MODULES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_DOTS,
  getModule,
  getModuleUsedBy,
} from '@/lib/schema/modules';
import SourceViewer from './SourceViewer';

// #408b — La page est maintenant dynamique (SourceViewer fetch live).
// Elle peut être pré-rendue, mais on ne force plus static car le SourceViewer
// est un client component qui fetch /api/schema/source au runtime.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SchemaDetailPage({ params }: PageProps) {
  const { id } = await params;
  const mod = getModule(id);
  if (!mod) notFound();

  const usedBy = getModuleUsedBy(id);

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link
            href="/schema"
            className="text-white/55 hover:text-white/90 text-[13px]"
          >
            ← Boussole
          </Link>
          <h1 className="text-[15px] font-medium tracking-tight truncate max-w-[60%]">
            {mod.name}
          </h1>
          <span className="w-12" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 space-y-5">
        {/* Header */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center gap-3 mb-3">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_DOTS[mod.status]}`}
            />
            <span className="text-[11px] uppercase tracking-wider text-white/55">
              {STATUS_LABELS[mod.status]} · {CATEGORY_LABELS[mod.category]}
            </span>
          </div>
          <h2 className="text-[20px] font-medium tracking-tight">{mod.name}</h2>
          <p className="mt-2 text-[13.5px] text-white/80 leading-relaxed">
            {mod.responsibility}
          </p>
          {mod.description && mod.description !== mod.responsibility && (
            <p className="mt-3 text-[12.5px] text-white/55 leading-relaxed">
              {mod.description}
            </p>
          )}
        </section>

        {/* Fichiers */}
        <Section title="Fichiers" count={mod.files.length}>
          <ul className="space-y-1.5">
            {mod.files.map((f) => (
              <li
                key={f}
                className="font-mono text-[12px] text-white/80 break-all"
              >
                <span className="text-white/35 mr-1.5">›</span>
                {f}
              </li>
            ))}
          </ul>
        </Section>

        {/* Code source (#408b) — onglets par fichier + syntax highlight */}
        <Section title="Code source">
          <SourceViewer files={mod.files.map((f) => ({ path: f }))} />
        </Section>

        {/* Endpoints */}
        {mod.api_endpoints && mod.api_endpoints.length > 0 && (
          <Section title="Endpoints API" count={mod.api_endpoints.length}>
            <ul className="space-y-1.5">
              {mod.api_endpoints.map((e) => (
                <li
                  key={e}
                  className="font-mono text-[12px] text-emerald-200/85 break-all"
                >
                  {e}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Tables */}
        {mod.db_tables && mod.db_tables.length > 0 && (
          <Section title="Tables DB" count={mod.db_tables.length}>
            <div className="flex flex-wrap gap-1.5">
              {mod.db_tables.map((t) => (
                <span
                  key={t}
                  className="font-mono text-[11.5px] px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-white/80"
                >
                  {t}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Dépendances */}
        {mod.depends_on && mod.depends_on.length > 0 && (
          <Section title="Appelle" count={mod.depends_on.length}>
            <ul className="space-y-1.5">
              {mod.depends_on.map((dep) => {
                const target = getModule(dep);
                return (
                  <li key={dep}>
                    {target ? (
                      <Link
                        href={`/schema/${dep}`}
                        className="inline-flex items-center gap-2 text-[12.5px] text-white/85 hover:text-white"
                      >
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOTS[target.status]}`}
                        />
                        {target.name}
                        <span className="text-white/35 text-[11px]">
                          {CATEGORY_LABELS[target.category]}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-[12.5px] text-red-300/80">
                        ⚠ {dep} (introuvable)
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* Used by */}
        {usedBy.length > 0 && (
          <Section title="Appelé par" count={usedBy.length}>
            <ul className="space-y-1.5">
              {usedBy.map((id2) => {
                const target = getModule(id2);
                if (!target) return null;
                return (
                  <li key={id2}>
                    <Link
                      href={`/schema/${id2}`}
                      className="inline-flex items-center gap-2 text-[12.5px] text-white/85 hover:text-white"
                    >
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOTS[target.status]}`}
                      />
                      {target.name}
                      <span className="text-white/35 text-[11px]">
                        {CATEGORY_LABELS[target.category]}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* Doctrines */}
        {mod.doctrine_refs && mod.doctrine_refs.length > 0 && (
          <Section title="Doctrines liées" count={mod.doctrine_refs.length}>
            <ul className="space-y-1">
              {mod.doctrine_refs.map((d) => (
                <li
                  key={d}
                  className="text-[12px] text-red-200/80 font-mono break-all"
                >
                  [[{d}]]
                </li>
              ))}
            </ul>
          </Section>
        )}

        {mod.last_updated && (
          <p className="text-[11px] text-white/35 text-center pt-2">
            Dernière mise à jour : {mod.last_updated}
          </p>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="text-[11px] uppercase tracking-wider text-white/45 mb-3">
        {title}
        {typeof count === 'number' && (
          <span className="ml-1.5 text-white/30">· {count}</span>
        )}
      </div>
      {children}
    </section>
  );
}
