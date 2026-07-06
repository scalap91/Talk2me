/**
 * /schema/liens — INVENTAIRE de tous les liens/pages + API de l'app (Pascal
 * 2026-06-29). Scanné EN DIRECT depuis le dossier app/ (miroir exact du code,
 * doctrine [[airbizness-schema-technique]]). Sert à inspecter chaque lien un par
 * un et décider quoi garder/virer. Page interne (dev-only via schema/layout).
 */
import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const APP_DIR = path.join(process.cwd(), 'app');

function listPages(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'api') continue; // les API sont listées à part
      out.push(...listPages(full));
    } else if (e.name === 'page.tsx' || e.name === 'page.jsx') {
      const rel = path.relative(APP_DIR, dir);
      const segs = rel.split(path.sep).filter((s) => s && !(s.startsWith('(') && s.endsWith(')')));
      out.push('/' + segs.join('/'));
    }
  }
  return out;
}

function listApi(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listApi(full));
    else if (e.name === 'route.ts' || e.name === 'route.tsx') {
      out.push('/' + path.relative(APP_DIR, dir).split(path.sep).join('/'));
    }
  }
  return out;
}

export default function LiensPage() {
  const pages = Array.from(new Set(listPages(APP_DIR))).sort();
  const apis = Array.from(new Set(listApi(path.join(APP_DIR, 'api')))).sort();

  // Regroupe les pages par 1er segment.
  const groups = new Map<string, string[]>();
  for (const p of pages) {
    const top = p === '/' ? '(racine)' : p.split('/')[1];
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top)!.push(p);
  }
  const groupKeys = Array.from(groups.keys()).sort();

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema" className="text-white/55 hover:text-white/90 text-[13px]">← Boussole</Link>
          <h1 className="text-[15px] font-medium">Tous les liens · pages · API</h1>
          <span className="w-16" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[13px] text-white/70">
          <b className="text-white">{pages.length} pages</b> · <b className="text-white">{apis.length} routes API</b> —
          scanné en direct depuis <code className="text-white/75">app/</code>. Les pages sans <code>[param]</code> sont
          cliquables (clique pour inspecter). Dis-moi celles à virer, une par une.
        </div>

        <section className="space-y-4">
          <h2 className="text-[13px] uppercase tracking-wider text-white/45">Pages ({pages.length})</h2>
          {groupKeys.map((g) => (
            <div key={g} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[12px] font-semibold text-amber-300/80 mb-2">/{g === '(racine)' ? '' : g} <span className="text-white/35 font-normal">· {groups.get(g)!.length}</span></div>
              <div className="flex flex-wrap gap-1.5">
                {groups.get(g)!.map((p) => (
                  p.includes('[')
                    ? <code key={p} className="bg-white/[0.05] border border-white/8 rounded px-2 py-1 text-[11.5px] text-white/55">{p}</code>
                    : <Link key={p} href={p} className="bg-white/[0.05] border border-white/10 rounded px-2 py-1 text-[11.5px] text-sky-200/85 hover:bg-white/[0.10]">{p}</Link>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-[13px] uppercase tracking-wider text-white/45">Routes API ({apis.length})</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 max-h-[420px] overflow-y-auto">
            <div className="flex flex-col gap-0.5">
              {apis.map((a) => <code key={a} className="text-[11px] text-white/55">{a}</code>)}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
