#!/usr/bin/env node
/**
 * LES YEUX — émanation GRAPHIQUE de T2M (Pascal 2026-07-11 « mets mes yeux »).
 * Capture LIVE (conditions réelles mobile) les écrans statiques du site, authentifié via une
 * session de test. Dépose les PNG + un manifeste dans genius-memory/site/talk2me/shots/.
 * Le cockpit pourra les afficher (facette graphique de l'émanation).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = 'https://dev.talk2me.fr';
const CHROME = '/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const OUT = '/home/ubuntu/dashboard/genius-memory/site/talk2me/shots';
const TOKEN = fs.readFileSync('/home/ubuntu/.claude/jobs/8d8314e5/tmp/t2m_sess_token', 'utf8').trim();
const CAP = parseInt(process.env.CAP || '22', 10);

const res = await fetch(`${BASE}/api/emanation`);
const em = await res.json();
// écrans statiques, priorité aux plus haut niveau (url courte), on cape.
const routes = em.ecrans.filter((e) => !e.dynamic).map((e) => e.url)
  .sort((a, b) => (a.split('/').length - b.split('/').length) || a.localeCompare(b))
  .slice(0, CAP);
console.log(`[yeux] ${routes.length} écrans à capturer (sur ${em.ecrans.length}) → ${OUT}`);

fs.mkdirSync(OUT, { recursive: true });
const RESUME = process.env.RESUME === '1';

let browser, ctx, page;
async function fresh() {
  try { if (browser) await browser.close(); } catch { /* */ }
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'talk2me_session', value: TOKEN, domain: 'dev.talk2me.fr', path: '/' }]);
  page = await ctx.newPage();
}
await fresh();

const manifest = [];
let sinceRestart = 0;
for (const url of routes) {
  const slug = url === '/' ? 'home' : url.slice(1).replace(/\//g, '__');
  const file = `${slug}.png`;
  // RESUME : on saute ce qui est déjà capturé (évite de tout refaire + les pages lourdes qui crashent).
  if (RESUME && fs.existsSync(path.join(OUT, file))) {
    manifest.push({ url, status: 200, ok: true, shot: `shots/${file}`, redirect: null, gated: false, err: '' });
    continue;
  }
  // relance préventive du navigateur tous les 25 écrans (évite la fuite mémoire → crash sur pages lourdes)
  if (sinceRestart >= 25) { await fresh(); sinceRestart = 0; }
  let status = 0, ok = false, finalUrl = '', err = '';
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    try {
      const r = await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      status = r ? r.status() : 0;
      finalUrl = page.url().replace(BASE, '');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, file) });
      ok = true; sinceRestart++;
    } catch (e) {
      err = String(e).slice(0, 100);
      if (/closed|crash/i.test(err)) { await fresh(); sinceRestart = 0; } // navigateur mort → on relance et on retente
    }
  }
  // détecte les redirections vers /signin (session invalide) ou coming-soon
  const gated = finalUrl.startsWith('/signin') || finalUrl.includes('coming');
  manifest.push({ url, status, ok, shot: ok ? `shots/${file}` : null, redirect: finalUrl !== url ? finalUrl : null, gated, err });
  console.log(`  ${ok ? (gated ? '🔒' : '📸') : '⚠️ '} ${url}  [${status}]${gated ? ' → ' + finalUrl : ''}${err ? ' ' + err : ''}`);
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ base: BASE, viewport: '390x844', ecrans: manifest }, null, 2));
const okN = manifest.filter((m) => m.ok && !m.gated).length;
const gatedN = manifest.filter((m) => m.gated).length;
console.log(`\n[yeux] ${okN} captures OK · ${gatedN} gated(/signin) · ${manifest.length - okN - gatedN} échecs → ${OUT}/manifest.json`);
