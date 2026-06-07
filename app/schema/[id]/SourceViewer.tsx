'use client';

/**
 * Talk2Me #408b — Source viewer pour /schema/[id] (Pascal 2026-06-05).
 *
 * Affiche le contenu d'un fichier source avec coloration syntaxique
 * (react-syntax-highlighter, thème one-dark). Onglet par fichier si plusieurs.
 *
 * Verbatim Pascal : "POURQUOI DANS LA BOUSSOLE ON NE VOIT PAS DE CODE NI DE
 * SCHEMA GRAPHIQUE DES MODULE".
 */

import { useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface FileTab {
  path: string;
}

interface SourceResult {
  path: string;
  language: string;
  lines: number;
  truncated: boolean;
  content: string;
  error: string | null;
  imports?: string[];
}

interface Props {
  files: FileTab[];
}

export default function SourceViewer({ files }: Props) {
  const [active, setActive] = useState(files[0]?.path || '');
  const [data, setData] = useState<SourceResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    setData(null);
    fetch(`/api/schema/source?path=${encodeURIComponent(active)}`)
      .then((r) => r.json())
      .then((d: SourceResult) => setData(d))
      .catch((e: Error) =>
        setData({
          path: active,
          language: 'text',
          lines: 0,
          truncated: false,
          content: '',
          error: e.message,
        }),
      )
      .finally(() => setLoading(false));
  }, [active]);

  if (files.length === 0) {
    return (
      <div className="text-[12px] text-white/45">Aucun fichier listé pour ce module.</div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Onglets fichiers */}
      <div className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <button
            type="button"
            key={f.path}
            onClick={() => setActive(f.path)}
            className={
              'font-mono text-[11px] px-2.5 h-7 rounded-md border transition-colors break-all ' +
              (active === f.path
                ? 'bg-pink-500/15 border-pink-400/30 text-white'
                : 'bg-white/[0.03] border-white/10 text-white/70 hover:bg-white/[0.07]')
            }
            title={f.path}
          >
            {shortPath(f.path)}
          </button>
        ))}
      </div>

      {/* Code */}
      <div className="rounded-2xl border border-white/10 bg-[#0b0b10] overflow-hidden">
        <div className="px-3 py-2 border-b border-white/8 flex items-center justify-between text-[11px] text-white/55 font-mono">
          <span className="truncate">{active}</span>
          {data && !data.error && (
            <span className="text-white/35 whitespace-nowrap">
              {data.lines} ligne{data.lines > 1 ? 's' : ''}
              {data.truncated && (
                <span className="ml-2 text-amber-300/85">· tronqué à 500</span>
              )}
            </span>
          )}
        </div>
        <div className="text-[11.5px] max-h-[60vh] overflow-auto">
          {loading && (
            <div className="px-3 py-6 text-white/45 animate-pulse">
              Chargement source…
            </div>
          )}
          {data?.error && (
            <div className="px-3 py-6 text-red-300/85 text-[12px]">
              Impossible de lire {active} : {data.error}
            </div>
          )}
          {data && !data.error && data.content && (
            <SyntaxHighlighter
              language={data.language}
              style={oneDark as Record<string, React.CSSProperties>}
              showLineNumbers
              wrapLongLines={false}
              customStyle={{
                margin: 0,
                background: 'transparent',
                fontSize: 11.5,
                lineHeight: '1.55',
                padding: '12px 0',
              }}
              lineNumberStyle={{
                minWidth: '2.6em',
                color: 'rgba(255,255,255,0.25)',
                fontSize: 10.5,
              }}
            >
              {data.content}
            </SyntaxHighlighter>
          )}
        </div>
      </div>

      {/* Imports détectés */}
      {data?.imports && data.imports.length > 0 && (
        <details className="text-[12px] text-white/65">
          <summary className="cursor-pointer text-white/55 hover:text-white/85">
            Imports détectés ({data.imports.length})
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-white/65">
            {data.imports.map((i) => (
              <li key={i} className="break-all">
                <span className="text-white/35 mr-1.5">›</span>
                {i}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function shortPath(p: string): string {
  // Garde les 2 derniers segments pour la lisibilité du tab
  const parts = p.split('/');
  if (parts.length <= 2) return p;
  return parts.slice(-2).join('/');
}
