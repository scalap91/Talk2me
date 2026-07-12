#!/usr/bin/env node
/**
 * MODULE code-mort — COUCHE 1 : cartographie STATIQUE (aucune exécution).
 * Pascal 2026-07-11 (« j'ai trop de code mort »). Doctrine : on n'efface RIEN,
 * on sort des CANDIDATS. Zones PROTÉGÉES jamais candidates : labo + boussole (/schema).
 *
 * Repère, sans lancer le site :
 *   - fichiers JAMAIS importés (modules orphelins)   [signal fort]
 *   - exports JAMAIS référencés ailleurs             [signal moyen]
 *
 * Sortie : tools/code-mort/candidates.json + rapport lisible en console.
 * Usage : node tools/code-mort/scan.mjs   (depuis la racine talk2me-dev)
 *
 * NB : c'est la couche SÛRE. La couche 2 (crawler + couverture) et la couche 5
 * (vérif IA par croisements) confirmeront chaque candidat AVANT toute coupe.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIRS = ['app', 'components', 'lib', 'hooks', 'contexts', 'providers', 'store', 'stores'];
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

// --- ZONES PROTÉGÉES (jamais candidates) : labo + boussole ---
// Verbatim Pascal : « tout code en labo ne doit pas être retiré, la boussole aussi ».
const PROTECTED = [
  /(^|\/)\(labo\)(\/|$)/,   // app/(labo)/**
  /(^|\/)labo(\/|$)/,       // tout dossier labo
  /(^|\/)schema(\/|$)/,     // /schema = la boussole
];
const isProtected = (rel) => PROTECTED.some((re) => re.test(rel));

// --- Fichiers ENTRÉE Next (jamais « importés » mais bien vivants) ---
const NEXT_ENTRY = new Set([
  'page', 'layout', 'route', 'loading', 'error', 'not-found', 'template',
  'default', 'global-error', 'middleware', 'instrumentation', 'sitemap',
  'robots', 'opengraph-image', 'icon', 'apple-icon', 'manifest',
]);
const isEntry = (file) => {
  const b = path.basename(file).replace(/\.(t|j)sx?$/, '');
  return NEXT_ENTRY.has(b);
};

function walk(dir, acc = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
      walk(p, acc);
    } else if (EXTS.includes(path.extname(e.name)) && !e.name.endsWith('.d.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

// Résout un spécifieur d'import vers un chemin absolu de fichier source (ou null).
function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // paquet npm
  const tries = [];
  for (const ext of EXTS) tries.push(base + ext);
  for (const ext of EXTS) tries.push(path.join(base, 'index' + ext));
  if (EXTS.includes(path.extname(base))) tries.unshift(base);
  for (const t of tries) { if (fs.existsSync(t) && fs.statSync(t).isFile()) return t; }
  return null;
}

const IMPORT_RE = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

// 1) collecte des fichiers
const files = [];
for (const d of SRC_DIRS) files.push(...walk(path.join(ROOT, d)));
const rel = (f) => path.relative(ROOT, f);

// 2) graphe d'imports : qui importe quoi
const importedBy = new Map(); // fichier résolu -> [fichiers qui l'importent]
const codeByFile = new Map();
for (const f of files) {
  let code = '';
  try { code = fs.readFileSync(f, 'utf8'); } catch { /* */ }
  codeByFile.set(f, code);
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(code))) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    const target = resolveSpec(spec, f);
    if (target) {
      if (!importedBy.has(target)) importedBy.set(target, []);
      importedBy.get(target).push(f);
    }
  }
}

// 3) candidats : fichiers orphelins (jamais importés), hors entrées Next, hors protégés
const orphans = [];
for (const f of files) {
  const r = rel(f);
  if (isProtected(r)) continue;      // labo / boussole : intouchable
  if (isEntry(f)) continue;          // page/route/layout… : vivant par convention
  const importers = importedBy.get(f) || [];
  if (importers.length === 0) {
    orphans.push({
      file: r,
      raison: 'jamais importé (module orphelin)',
      signal: 'fort',
      lignes: (codeByFile.get(f) || '').split('\n').length,
    });
  }
}

// 4) protégés recensés (transparence : ce qu'on a volontairement épargné)
const protectedCount = files.filter((f) => isProtected(rel(f))).length;

const report = {
  genere_le: null, // horodaté après coup (pas de Date.now ici pour rester déterministe/rejouable)
  racine: ROOT,
  fichiers_scannes: files.length,
  fichiers_proteges_labo_boussole: protectedCount,
  candidats: orphans.sort((a, b) => b.lignes - a.lignes),
  note: "COUCHE 1 statique. Rien n'est supprimé. Chaque candidat DOIT passer la couche 2 (couverture au run) + la vérif IA (croisements : sortie du code, mémoire gw, remplacé par une autre techno, labo/boussole) avant toute coupe.",
};

const outDir = path.join(ROOT, 'tools', 'code-mort');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'candidates.json'), JSON.stringify(report, null, 2));

// 5) rapport console
console.log('\n=== code-mort · COUCHE 1 (statique) ===');
console.log(`fichiers scannés          : ${files.length}`);
console.log(`protégés (labo+boussole)  : ${protectedCount}  (jamais candidats)`);
console.log(`CANDIDATS (jamais importés): ${orphans.length}\n`);
for (const o of report.candidats) {
  console.log(`  • ${o.file}  (${o.lignes} l · ${o.signal})`);
}
console.log(`\n→ détail : tools/code-mort/candidates.json`);
console.log('→ rien supprimé. Étapes suivantes : couche 2 (crawler+couverture) puis vérif IA.\n');
