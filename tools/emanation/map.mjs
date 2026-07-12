#!/usr/bin/env node
/**
 * ÉMANATION — canal STRUCTUREL (sans navigateur, 100% fiable, rejouable).
 * « Le site nous parle » : il énumère TOUT ce qu'il expose et le dépose pour le cockpit.
 * Cf project_site_emanation_doctrine. Les captures visuelles = canal séparé (serveur stable).
 *
 * Sortie : genius-memory/site/map.json  (écrans + endpoints + sections)
 * Usage  : node tools/emanation/map.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(process.cwd());
const APP = path.join(REPO, 'app');
// Émanation SCINDÉE PAR PROJET (Pascal 2026-07-11 : « si je passe sur un autre projet la règle
// disparaît car la boussole est sur l'app pas sur gw dashboard »). Le cockpit tient un registre
// par projet ; chaque app émane sous site/<projet>/. Le mécanisme de jugement vit dans le cockpit.
const PROJECT = process.env.PROJECT || 'talk2me';
const OUT = process.env.OUT || `/home/ubuntu/dashboard/genius-memory/site/${PROJECT}`;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules') continue; walk(p, acc); }
    else acc.push(p);
  }
  return acc;
}
const all = walk(APP);

// --- écrans (page.tsx) ---
function toRoute(file) {
  const segs = path.relative(APP, path.dirname(file)).split(path.sep).filter(Boolean)
    .filter((s) => !/^\(.*\)$/.test(s));
  const url = '/' + segs.join('/');
  return {
    url: url === '/' ? '/' : url.replace(/\/$/, ''),
    dynamic: segs.some((s) => s.includes('[')),
    groupe: segs[0] && /^\(.*\)$/.test(path.relative(APP, path.dirname(file)).split(path.sep)[0])
      ? path.relative(APP, path.dirname(file)).split(path.sep)[0]
      : (segs[0] || 'racine'),
    file: path.relative(REPO, file),
  };
}
const seen = new Set();
const ecrans = all.filter((f) => /(^|\/)page\.(t|j)sx?$/.test(f)).map(toRoute)
  .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
  .sort((a, b) => a.url.localeCompare(b.url));

// --- endpoints (route.ts sous app/api) ---
const endpoints = all.filter((f) => /(^|\/)route\.(t|j)sx?$/.test(f) && f.includes(`${path.sep}api${path.sep}`))
  .map((f) => {
    const segs = path.relative(APP, path.dirname(f)).split(path.sep);
    const url = '/' + segs.join('/');
    const src = fs.readFileSync(f, 'utf8');
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src));
    return { url, methods, file: path.relative(REPO, f) };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

// --- regroupement par section (1er segment) ---
const sections = {};
for (const e of ecrans) {
  const seg = e.url === '/' ? 'accueil' : e.url.split('/')[1];
  (sections[seg] ||= { ecrans: 0, dynamiques: 0 });
  sections[seg].ecrans++; if (e.dynamic) sections[seg].dynamiques++;
}

const map = {
  projet: PROJECT,
  // POINTEUR vers l'ESPRIT du projet (référence du jugement, à enregistrer côté cockpit).
  esprit: {
    boussole: '/schema',                                   // la boussole vivante (18 écrans)
    tokens: 'lib/design-tokens (--t2m-*)',
    doctrine: ['anti-violet', 'monochrome', 'premium iMessage/Linear', 'nav feed→feed', 'la card prime sur le texte'],
  },
  ecrans_total: ecrans.length,
  endpoints_total: endpoints.length,
  sections: Object.entries(sections).sort((a, b) => b[1].ecrans - a[1].ecrans)
    .map(([nom, v]) => ({ nom, ...v })),
  ecrans,
  endpoints,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(map, null, 2));
console.log(`[emanation·structure] ${ecrans.length} écrans · ${endpoints.length} endpoints · ${map.sections.length} sections → ${OUT}/map.json`);
for (const s of map.sections.slice(0, 15)) console.log(`   ${s.nom.padEnd(16)} ${s.ecrans} écran(s)${s.dynamiques ? ` (${s.dynamiques} dyn.)` : ''}`);
