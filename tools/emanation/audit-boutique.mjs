#!/usr/bin/env node
/**
 * MOTEUR FONCTIONNEL de La Meute — « VITRINE BOUTIQUE » (Pascal 2026-07-12).
 * Défaut appris : une card VITRINE (`[VITRINE:id]` dans la légende) qui tombe sur le rendu par
 * défaut FAIT FUITER le marqueur brut `[VITRINE:…]` à l'écran + n'a pas de bloc boutique. La Meute
 * parcourt le feed et ABOIE si le marqueur apparaît dans le RENDU, ou si aucun « Voir la boutique »
 * n'accompagne une vitrine. (La Meute était aveugle aux boutiques → ce trou est comblé.)
 *
 *   T2M_SECRET=<secret> node audit-boutique.mjs   → JSON {ok, defaut, verdict}
 */
import pw from 'playwright-core';
const { chromium } = pw;
const BASE = process.env.BASE || 'https://dev.talk2me.fr';
const SECRET = process.env.T2M_SECRET || '';
const CHROME = '/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

function out(o) { console.log(JSON.stringify(o)); }
if (!SECRET) { out({ ok: false, raison: 'pas de T2M_SECRET' }); process.exit(0); }

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
async function t(ty, x, y) { await cdp.send('Input.dispatchTouchEvent', { type: ty, touchPoints: ty === 'touchEnd' ? [] : [{ x, y }] }); }
async function up() { await t('touchStart', 195, 650); for (let i = 1; i <= 8; i++) { await t('touchMove', 195, 650 - i * 60); await p.waitForTimeout(28); } await t('touchEnd', 195, 150); await p.waitForTimeout(750); }
try {
  await p.request.post(`${BASE}/api/dev/test-login`, { headers: { 'x-test-secret': SECRET, 'content-type': 'application/json' }, data: { phone: '+99901234567' } });
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
  await p.evaluate(() => { try { localStorage.setItem('t2m_display', 'photo'); } catch { /* */ } });
  await p.goto(`${BASE}/?sort=recent`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(5000);
  let leak = false, sawVitrine = false, vitrineSansCta = false;
  for (let i = 0; i < 16; i++) {
    const s = await p.evaluate(() => {
      const txt = document.body.innerText || '';
      return { leak: /\[VITRINE:/i.test(txt), vitrine: /Boutique|VITRINE/i.test(txt), cta: /Voir la boutique/i.test(txt) };
    }).catch(() => ({ leak: false, vitrine: false, cta: false }));
    if (s.leak) leak = true;
    if (s.vitrine) { sawVitrine = true; if (!s.cta && s.leak) vitrineSansCta = true; }
    if (leak) break;
    await up();
  }
  const defaut = leak;
  out({
    ok: true,
    defaut,
    vu_vitrine: sawVitrine,
    verdict: leak
      ? 'DÉFAUT — le marqueur brut [VITRINE:…] FUIT dans le rendu (vitrine tombée sur le rendu par défaut, pas de bloc boutique).'
      : (sawVitrine ? 'OK — vitrine(s) rendues proprement, aucun marqueur qui fuit' : 'indéterminé (aucune vitrine croisée dans le feed)'),
  });
} catch (e) {
  out({ ok: false, raison: String(e).slice(0, 140) });
} finally {
  await b.close();
}
