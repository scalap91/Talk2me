/**
 * GET /api/emanation — LE SITE RAYONNE SON ÉTAT (Pascal 2026-07-11 « un site doit te rayonner
 * son état » + « brancher le site en API »). Endpoint LIVE : walk du code au runtime → toujours
 * frais (pas de fichier figé). Le cockpit (gw dashboard) le tire et le juge contre la boussole
 * (qui vit, elle, DANS le cockpit). Cf project_site_emanation_doctrine.
 *
 * PUBLIC (allowlisté dans le middleware) : n'expose que la CARTE structurelle (routes/endpoints),
 * aucune donnée utilisateur.
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP = path.join(process.cwd(), 'app');

function walk(dir: string, acc: string[] = []): string[] {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules') continue; walk(p, acc); }
    else acc.push(p);
  }
  return acc;
}

function toRoute(file: string) {
  const segs = path.relative(APP, path.dirname(file)).split(path.sep).filter(Boolean)
    .filter((s) => !/^\(.*\)$/.test(s));
  const url = '/' + segs.join('/');
  return { url: url === '/' ? '/' : url.replace(/\/$/, ''), dynamic: segs.some((s) => s.includes('[')) };
}

export async function GET() {
  let files: string[] = [];
  try { files = walk(APP); } catch { /* */ }

  const seen = new Set<string>();
  const ecrans = files.filter((f) => /(^|\/)page\.(t|j)sx?$/.test(f)).map(toRoute)
    .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
    .sort((a, b) => a.url.localeCompare(b.url));

  const endpoints = files.filter((f) => /(^|\/)route\.(t|j)sx?$/.test(f) && f.includes(`${path.sep}api${path.sep}`))
    .map((f) => {
      const segs = path.relative(APP, path.dirname(f)).split(path.sep);
      let methods: string[] = [];
      try {
        const src = fs.readFileSync(f, 'utf8');
        methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src));
      } catch { /* */ }
      return { url: '/' + segs.join('/'), methods };
    })
    .sort((a, b) => a.url.localeCompare(b.url));

  const sections: Record<string, { ecrans: number; dynamiques: number }> = {};
  for (const e of ecrans) {
    const seg = e.url === '/' ? 'accueil' : e.url.split('/')[1];
    (sections[seg] ||= { ecrans: 0, dynamiques: 0 });
    sections[seg].ecrans++; if (e.dynamic) sections[seg].dynamiques++;
  }

  return NextResponse.json({
    projet: 'talk2me',
    live: true,
    ecrans_total: ecrans.length,
    endpoints_total: endpoints.length,
    sections: Object.entries(sections).sort((a, b) => b[1].ecrans - a[1].ecrans).map(([nom, v]) => ({ nom, ...v })),
    ecrans,
    endpoints,
  });
}
