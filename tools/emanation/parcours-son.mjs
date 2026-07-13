#!/usr/bin/env node
/**
 * MOTEUR FONCTIONNEL — parcours « son au feed » (Pascal 2026-07-11).
 * La Meute ne fait pas que regarder : elle DÉROULE l'action et l'audite.
 * Ici : poste un son au feed → le joue → SURVEILLE l'iframe YouTube du son dans le temps.
 * Si le son (iframe) DISPARAÎT / est remplacé « à un certain moment » → régression détectée
 * (remount qui démonte l'iframe, ou audioChannel qui pause). Sortie JSON.
 *
 *   T2M_SECRET=<test-login-secret> node parcours-son.mjs
 */
import pw from 'playwright-core';
const { chromium } = pw;
const BASE = process.env.BASE || 'https://dev.talk2me.fr';
const SECRET = process.env.T2M_SECRET || '';
const CHROME = '/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const VID = 'I4On7vHE09o'; // Kassav (son de test)

function out(o) { console.log(JSON.stringify(o)); }
if (!SECRET) { out({ ok: false, raison: 'pas de T2M_SECRET' }); process.exit(0); }

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage();
try {
  await p.request.post(`${BASE}/api/dev/test-login`, { headers: { 'x-test-secret': SECRET, 'content-type': 'application/json' }, data: { phone: '+9990111222', name: 'MeuteSon' } });
  // 1) POSTER un son au feed (card texte + attached_audio).
  const son = { source: 'youtube', type: 'audio', title: 'KASSAV audit', author: { name: 'Kassav' }, thumbnail_url: `https://i.ytimg.com/vi/${VID}/hqdefault.jpg`, external_url: `https://www.youtube.com/watch?v=${VID}`, embed: { kind: 'iframe', src: `https://www.youtube.com/embed/${VID}` }, meta: { youtube_video_id: VID } };
  const r = await p.request.post(`${BASE}/api/cards/create`, { headers: { 'content-type': 'application/json' }, data: { type: 'texte', text: 'Audit son au feed', attached_audio: son } });
  const created = await r.json().catch(() => null);
  const cardId = created?.card?.id || '';

  // 2) OUVRIR le feed, jouer le son (tap sur le 1er disque/play visible).
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
  await p.evaluate(() => { try { localStorage.setItem('t2m_display', 'photo'); } catch { /* */ } });
  await p.goto(`${BASE}/?sort=recent`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(5000);
  // lance le son : clic sur un bouton disque/lecture s'il y en a un
  await p.evaluate(() => {
    const b = document.querySelector('.vinyl-disc, [aria-label="Lecture"], button[aria-label*="Musique"]');
    if (b) b.click();
  }).catch(() => {});
  await p.waitForTimeout(1500);

  // 3) SURVEILLER l'iframe du son dans le temps (12 échantillons / ~12s), + un scroll au milieu.
  const samples = [];
  const count = async () => p.evaluate((vid) => document.querySelectorAll(`iframe[src*="${vid}"]`).length, VID).catch(() => -1);
  for (let i = 0; i < 12; i++) {
    if (i === 5) { await p.mouse.wheel(0, 500); await p.waitForTimeout(300); await p.mouse.wheel(0, -500); } // trigger scroll/remount
    samples.push(await count());
    await p.waitForTimeout(1000);
  }
  const maxSeen = Math.max(...samples, 0);
  // coupure = l'iframe a été présente puis a disparu (1→0) à un moment
  let cutAt = -1;
  for (let i = 1; i < samples.length; i++) { if (samples[i - 1] > 0 && samples[i] === 0) { cutAt = i; break; } }
  out({ ok: true, cardId, samples, maxIframes: maxSeen, coupe: cutAt >= 0, coupe_a_s: cutAt, verdict: cutAt >= 0 ? `SON COUPÉ à ~${cutAt}s (iframe démontée)` : maxSeen > 0 ? 'son stable (pas de coupure détectée)' : 'son jamais lancé (iframe absente — parcours à ajuster)' });
} catch (e) {
  out({ ok: false, raison: String(e).slice(0, 140) });
} finally {
  await b.close();
}
