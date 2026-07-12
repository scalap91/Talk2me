#!/usr/bin/env node
/**
 * MOTEUR FONCTIONNEL de La Meute — « SWIPE DE MES POSTS » (Pascal 2026-07-12).
 * `/mes-cards` = « un endroit où on voit nos posts » (revoir SES posts, PAS un feed). Sa FONCTION :
 * le swipe (vertical, snap) doit NAVIGUER d'un de mes posts au suivant. La Meute juge la FONCTION,
 * pas la ressemblance au feed. On déroule le parcours : 3 posts → ouvrir /mes-cards → swiper →
 * vérifier qu'on CHANGE de post. Si bloqué/mort → DÉFAUT (aboie).
 *
 *   T2M_SECRET=<secret> node audit-swipe.mjs   → JSON {ok, defaut, verdict, steps}
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
async function touch(t, x, y) { await cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: t === 'touchEnd' ? [] : [{ x, y }] }); }
async function swipeUp() { await touch('touchStart', 195, 640); for (let i = 1; i <= 8; i++) { await touch('touchMove', 195, 640 - i * 60); await p.waitForTimeout(30); } await touch('touchEnd', 195, 160); await p.waitForTimeout(900); }
// quel post est visible (index de la section snap au centre de l'écran)
async function visibleIndex() {
  return p.evaluate(() => {
    const secs = [...document.querySelectorAll('[data-feed-index]')];
    const mid = window.innerHeight / 2;
    for (const s of secs) { const r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) return Number(s.getAttribute('data-feed-index')); }
    return -1;
  }).catch(() => -1);
}
try {
  await p.request.post(`${BASE}/api/dev/test-login`, { headers: { 'x-test-secret': SECRET, 'content-type': 'application/json' }, data: { phone: '+99901234567' } });
  // 3 posts pour avoir de quoi naviguer
  let firstId = '';
  for (let i = 0; i < 3; i++) {
    const r = await p.request.post(`${BASE}/api/cards/create`, { headers: { 'content-type': 'application/json' }, data: { type: 'texte', text: `Audit swipe post ${i + 1}` } });
    const id = (await r.json().catch(() => ({})))?.card?.id || '';
    if (i === 0) firstId = id;
  }
  await p.waitForTimeout(1200);
  await p.goto(`${BASE}/mes-cards/${firstId}`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(4000);
  const total = await p.evaluate(() => document.querySelectorAll('[data-feed-index]').length).catch(() => 0);
  const steps = [];
  let idx = await visibleIndex();
  steps.push(idx);
  for (let s = 0; s < 3; s++) { await swipeUp(); steps.push(await visibleIndex()); }
  const moved = new Set(steps.filter((x) => x >= 0)).size > 1;
  const defaut = total > 1 && !moved; // plusieurs posts mais le swipe ne change RIEN = défaut
  out({
    ok: true,
    defaut,
    total_posts: total,
    steps,
    verdict: total <= 1 ? 'indéterminé (1 seul post monté)' : (moved ? 'swipe OK — on navigue entre mes posts' : 'SWIPE MORT — plusieurs posts mais le swipe ne change pas de post (on ne peut pas revoir ses posts)'),
  });
} catch (e) {
  out({ ok: false, raison: String(e).slice(0, 140) });
} finally {
  await b.close();
}
