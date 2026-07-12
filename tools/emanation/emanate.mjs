#!/usr/bin/env node
/**
 * ÉMANATION du site — CANAL 1 : « le site nous parle » (Pascal 2026-07-11).
 * Doctrine : un site doit RAYONNER son état vers le cockpit. Cf project_site_emanation_doctrine.
 *
 * Ce script (déterministe, rejouable) :
 *   1. énumère TOUTES les routes (app/**\/page.tsx),
 *   2. s'authentifie en compte de test (test-login),
 *   3. visite chaque écran et le CAPTURE (les « yeux »),
 *   4. dépose l'autoportrait dans genius-memory/site/ (map.json + shots/*.png)
 *      → le cockpit le sert + me le réinjecte.
 *
 * Usage : node tools/emanation/emanate.mjs   (next dev doit tourner sur $BASE)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const REPO = path.resolve(process.cwd());
const APP = path.join(REPO, 'app');
const BASE = process.env.BASE || 'http://localhost:3099';
const SECRET = process.env.TEST_LOGIN_SECRET || 'emanation-dev';
const OUT = process.env.OUT || '/home/ubuntu/dashboard/genius-memory/site';
const SHOTS = path.join(OUT, 'shots');
// Binaire chromium (cache Playwright déjà présent sur ce host).
const CHROME = process.env.CHROME || '/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

// --- 1) énumération des routes depuis app/**/page.tsx ---
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'api' || e.name === 'node_modules') continue;
      walk(p, acc);
    } else if (/^page\.(t|j)sx?$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}
function fileToRoute(file) {
  let rel = path.relative(APP, path.dirname(file)); // '' pour la racine
  const segs = rel.split(path.sep).filter(Boolean)
    .filter((s) => !/^\(.*\)$/.test(s)); // enlève les groupes (labo), (marketing)…
  const url = '/' + segs.join('/');
  const dynamic = segs.some((s) => s.includes('[')); // [id], [...slug]
  return { url: url === '/' ? '/' : url.replace(/\/$/, ''), dynamic, file: path.relative(REPO, file) };
}

const routes = walk(APP).map(fileToRoute)
  // v1 : on capture les écrans STATIQUES (les [param] dynamiques → listés mais non shootés,
  // faute d'ID réel — canal 2 les nourrira via le crawler).
  .sort((a, b) => a.url.localeCompare(b.url));
const seen = new Set();
const uniq = routes.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
const staticRoutes = uniq.filter((r) => !r.dynamic);

console.log(`[emanation] ${uniq.length} routes (${staticRoutes.length} statiques à capturer, ${uniq.length - staticRoutes.length} dynamiques listées)`);

// --- 2) auth test-login → cookie de session ---
async function login() {
  const res = await fetch(`${BASE}/api/dev/test-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-secret': SECRET },
    body: JSON.stringify({ phone: '+9990000001', name: 'Emanation' }),
  });
  if (!res.ok) throw new Error(`test-login ${res.status}: ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') || '';
  const first = setCookie.split(',')[0].split(';')[0]; // name=value
  const [name, ...rest] = first.split('=');
  return { name: name.trim(), value: rest.join('=').trim() };
}

// --- 3) capture ---
async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const cookie = await login();
  console.log(`[emanation] session OK (cookie ${cookie.name})`);

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // S23 FE (Pascal teste mobile)
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([{ name: cookie.name, value: cookie.value, domain: 'localhost', path: '/' }]);
  const page = await ctx.newPage();

  const captured = [];
  for (const r of staticRoutes) {
    const slug = (r.url === '/' ? 'home' : r.url.slice(1).replace(/\//g, '__')) || 'home';
    const shot = path.join(SHOTS, `${slug}.png`);
    let status = 0, title = '', ok = false, err = '';
    try {
      const resp = await page.goto(BASE + r.url, { waitUntil: 'networkidle', timeout: 20000 });
      status = resp ? resp.status() : 0;
      title = await page.title().catch(() => '');
      await page.screenshot({ path: shot });
      ok = true;
    } catch (e) { err = String(e).slice(0, 140); }
    captured.push({ url: r.url, status, title, ok, shot: ok ? `shots/${slug}.png` : null, err, file: r.file });
    console.log(`  ${ok ? '📸' : '⚠️ '} ${r.url}  [${status}] ${title}${err ? ' — ' + err : ''}`);
  }

  await browser.close();

  const map = {
    base: BASE,
    routes_total: uniq.length,
    routes_dynamiques: uniq.filter((r) => r.dynamic).map((r) => ({ url: r.url, file: r.file })),
    ecrans: captured,
  };
  fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(map, null, 2));
  const okN = captured.filter((c) => c.ok).length;
  console.log(`\n[emanation] ${okN}/${captured.length} écrans capturés → ${OUT}/map.json + shots/`);
}

main().catch((e) => { console.error('[emanation] ÉCHEC:', e); process.exit(1); });
