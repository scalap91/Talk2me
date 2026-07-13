#!/usr/bin/env node
/**
 * MOTEUR DE NON-RÉGRESSION (Pascal 2026-07-11 « créer ce moteur »).
 * Module DANS LE DUR : sur demande, il déroule tout le site (le cockpit rend chaque page,
 * d'après l'API du projet), garde une RÉFÉRENCE (baseline), et DIFFE avant/après codage →
 * les régressions (écran changé / cassé / disparu / nouveau) remontent seules.
 *
 *   node engine.mjs --baseline   → capture tout + FIXE la référence (l'état sain, avant de coder)
 *   node engine.mjs              → capture tout + DIFF vs référence → rapport régressions
 *
 * Auth : session de test dans $T2M_TOKEN (fournie par run.sh). Cible : $BASE (déf dev.talk2me.fr).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/home/ubuntu/talk2me-dev/tools/emanation/node_modules/playwright-core/index.mjs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const BASE = process.env.BASE || 'https://dev.talk2me.fr';
const PROJECT = process.env.PROJECT || 'talk2me';
const CHROME = '/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const TOKEN = process.env.T2M_TOKEN || '';
const ROOT = `/home/ubuntu/dashboard/genius-memory/site/${PROJECT}`;
const SHOTS = path.join(ROOT, 'shots');       // dernier état (aussi lu par la galerie du cockpit)
const BASELINE = path.join(ROOT, 'baseline'); // référence figée
const DIFF = path.join(ROOT, 'diff');         // images de différence
const MODE = process.argv.includes('--baseline') ? 'baseline' : 'check';
const THRESH = 1.5; // % de pixels changés au-delà duquel on signale (sous 1.5% = bruit dynamique)
const CAP = parseInt(process.env.CAP || '150', 10);
// Pages CANVAS/WebGL/AR : se redessinent à chaque frame (non déterministes) → un diff pixel n'a
// aucun sens, on les EXCLUT du verdict (reportées à part, jamais en « cassé »). Pascal 2026-07-11.
const VOLATILE = /^\/(composer|ar|world|boutique3d|avatar-studio|avatar-creator|piece|rd\/avatar|demo-|apercu-feed-machine)/;

if (!TOKEN) { console.error('[moteur] pas de session ($T2M_TOKEN). Lance via run.sh.'); process.exit(2); }

// ---- 1) capture résiliente de tous les écrans statiques ----
async function captureAll() {
  const res = await fetch(`${BASE}/api/emanation`);
  const em = await res.json();
  const routes = em.ecrans.filter((e) => !e.dynamic).map((e) => e.url)
    .sort((a, b) => (a.split('/').length - b.split('/').length) || a.localeCompare(b)).slice(0, CAP);
  fs.mkdirSync(SHOTS, { recursive: true });
  let browser, ctx, page;
  async function fresh() {
    try { if (browser) await browser.close(); } catch { /* */ }
    browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'talk2me_session', value: TOKEN, domain: 'dev.talk2me.fr', path: '/' }]);
    page = await ctx.newPage();
  }
  await fresh();
  const manifest = []; let since = 0;
  for (const url of routes) {
    const slug = url === '/' ? 'home' : url.slice(1).replace(/\//g, '__');
    const file = `${slug}.png`;
    if (since >= 25) { await fresh(); since = 0; }
    let ok = false, status = 0, finalUrl = '', err = '';
    for (let a = 0; a < 2 && !ok; a++) {
      try {
        const r = await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        status = r ? r.status() : 0; finalUrl = page.url().replace(BASE, '');
        await page.waitForTimeout(1500);
        // STABILISER avant capture : couper animations/transitions + geler vidéos → sinon un diff
        // image-à-image sur du mouvement = faux positif. Pascal 2026-07-11 « ne pas aboyer pour rien ».
        await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' }).catch(() => {});
        await page.evaluate(() => { document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch { /* */ } }); }).catch(() => {});
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(SHOTS, file) });
        ok = true; since++;
      } catch (e) { err = String(e).slice(0, 90); if (/closed|crash|Target/i.test(err)) { await fresh(); since = 0; break; } }
    }
    const gated = finalUrl.startsWith('/signin') || finalUrl.includes('coming');
    manifest.push({ url, slug, file, status, ok, gated, shot: ok ? `shots/${file}` : null, err });
    process.stdout.write(ok ? (gated ? '🔒' : '·') : 'x');
  }
  await browser.close();
  fs.writeFileSync(path.join(SHOTS, 'manifest.json'), JSON.stringify({ base: BASE, ecrans: manifest }, null, 2));
  console.log(`\n[moteur] ${manifest.filter((m) => m.ok && !m.gated).length}/${manifest.length} écrans capturés.`);
  return manifest;
}

// ---- 2) diff pixel entre deux PNG ----
function diffPct(aPath, bPath, outPath) {
  const a = PNG.sync.read(fs.readFileSync(aPath));
  const b = PNG.sync.read(fs.readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) return { pct: 100, sizeChanged: true };
  const out = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.12 });
  if (outPath && n > 0) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, PNG.sync.write(out)); }
  return { pct: (100 * n) / (a.width * a.height), sizeChanged: false, pixels: n };
}

// ---- MAIN ----
const manifest = await captureAll();

if (MODE === 'baseline') {
  fs.rmSync(BASELINE, { recursive: true, force: true }); fs.mkdirSync(BASELINE, { recursive: true });
  let n = 0;
  for (const m of manifest) if (m.ok) { fs.copyFileSync(path.join(SHOTS, m.file), path.join(BASELINE, m.file)); n++; }
  fs.writeFileSync(path.join(BASELINE, 'manifest.json'), JSON.stringify({ base: BASE, ecrans: manifest, frozen: true }, null, 2));
  console.log(`[moteur] RÉFÉRENCE figée : ${n} écrans dans baseline/. (relance sans --baseline après codage pour comparer)`);
  process.exit(0);
}

// check : comparer shots vs baseline
if (!fs.existsSync(BASELINE)) { console.error('[moteur] pas de référence. Lance d\'abord : node engine.mjs --baseline'); process.exit(3); }
fs.rmSync(DIFF, { recursive: true, force: true });
const report = { changed: [], broken: [], gated: [], volatile: [], nouveau: [], disparu: [], ok: 0 };
const curFiles = new Set(manifest.filter((m) => m.ok).map((m) => m.file));
for (const m of manifest) {
  if (!m.ok) { report.broken.push({ url: m.url, raison: m.err || 'capture échouée' }); continue; }
  // Page auth-gate (login/coming-soon) = HORS PÉRIMÈTRE, PAS une casse (sinon le chien aboie
  // pour rien : rôle admin non accordé au user de test, etc.). Pascal 2026-07-11.
  if (m.gated) { report.gated.push(m.url); continue; }
  if (VOLATILE.test(m.url)) { report.volatile.push(m.url); continue; }
  const bl = path.join(BASELINE, m.file);
  if (!fs.existsSync(bl)) { report.nouveau.push(m.url); continue; }
  const d = diffPct(path.join(SHOTS, m.file), bl, path.join(DIFF, m.file));
  if (d.pct >= THRESH) report.changed.push({ url: m.url, diff_pct: +d.pct.toFixed(2), size_changed: d.sizeChanged, diff_img: `diff/${m.file}` });
  else report.ok++;
}
// écrans de la référence disparus du site actuel
for (const f of fs.readdirSync(BASELINE)) if (f.endsWith('.png') && !curFiles.has(f)) report.disparu.push(f.replace(/\.png$/, '').replace(/__/g, '/'));

report.changed.sort((a, b) => b.diff_pct - a.diff_pct);
fs.writeFileSync(path.join(ROOT, 'regression.json'), JSON.stringify(report, null, 2));

console.log('\n===== RÉGRESSIONS =====');
console.log(`✓ inchangés : ${report.ok}`);
console.log(`⚠ CHANGÉS   : ${report.changed.length}`);
report.changed.slice(0, 20).forEach((c) => console.log(`   ${c.diff_pct}%  ${c.url}${c.size_changed ? '  (taille modifiée)' : ''}`));
console.log(`✗ CASSÉS    : ${report.broken.length}`);
report.broken.slice(0, 20).forEach((c) => console.log(`   ${c.url} — ${c.raison}`));
if (report.nouveau.length) console.log(`＋ nouveaux : ${report.nouveau.length} (${report.nouveau.slice(0, 8).join(', ')})`);
if (report.disparu.length) console.log(`－ disparus : ${report.disparu.length} (${report.disparu.slice(0, 8).join(', ')})`);
console.log(`\n[moteur] rapport → ${ROOT}/regression.json · images de diff → diff/`);
