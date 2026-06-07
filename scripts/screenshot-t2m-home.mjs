// Talk2Me — screenshots /home pour valider les 17 embeds T2M Officiel
// S23 FE 390×844, headless, captures dans /home/ubuntu/dashboard/uploads/

import pwPkg from '/var/www/airbizness/site_audit/node_modules/playwright/index.js';
const { chromium } = pwPkg;
import fs from 'node:fs/promises';

const SESSION_TOKEN = '38e192d3821065a9cf11ea02c4ade58e696c4c67016e9d8e64a2c7cca2c2f987';
const BASE = 'http://localhost:3010';
const OUT = '/home/ubuntu/dashboard/uploads';

// Ordre du feed (DESC, post le plus récent = premier scroll = top = deezer)
// On capture dans l'ordre où ils apparaissent à l'écran
const PLATFORMS_TOP_DOWN = [
  'deezer',
  'applemusic',
  'loom',
  'pinterest',
  'linkedin',
  'dailymotion',
  'twitch',
  'reddit',
  'vimeo',
  'soundcloud',
  'instagram',
  'facebook',
  'twitter',
  'maps',
  'spotify',
  'tiktok',
  'youtube',
];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S711B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  deviceScaleFactor: 2.5,
  isMobile: true,
  hasTouch: true,
});
// Cookie session T2M Officiel
await context.addCookies([
  {
    name: 'talk2me_session',
    value: SESSION_TOKEN,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  },
]);

const page = await context.newPage();
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
// console silencieux (iframes externes throw beaucoup)

console.log('Naviguer vers', BASE + '/home');
await page.goto(BASE + '/home', { waitUntil: 'domcontentloaded', timeout: 30_000 });

// Laisse le feed initial se rendre (iframes externes prennent leur temps)
await page.waitForTimeout(6000);

// Cherche les cards via data-testid
const cardsLocator = page.locator('[data-testid^="post-card-"]');
const initialCount = await cardsLocator.count();
console.log('Cards initiales détectées :', initialCount);

if (initialCount === 0) {
  // Snapshot debug
  await page.screenshot({ path: `${OUT}/_debug_home_empty.png`, fullPage: false });
  const html = await page.content();
  await fs.writeFile(`${OUT}/_debug_home_empty.html`, html);
  console.log('Aucune card détectée. Snapshot debug → uploads/_debug_home_empty.png');
}

// Le feed est snap-y vertical fullscreen. On scroll par viewport (844px).
// Chaque "page" = 1 post fullscreen. On screenshote, on scroll, on screenshote.
const captured = [];

for (let i = 0; i < PLATFORMS_TOP_DOWN.length; i++) {
  const plat = PLATFORMS_TOP_DOWN[i];
  const out = `${OUT}/t2m_home_${plat}.png`;

  // Attend que iframe / embed potentiel commence à charger
  await page.waitForTimeout(4500);

  // Trouve le post actuellement visible (centré)
  const visibleCard = await page.evaluateHandle(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid^="post-card-"]'));
    const vh = window.innerHeight;
    let best = null, bestScore = -1;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const visTop = Math.max(0, r.top);
      const visBottom = Math.min(vh, r.bottom);
      const vis = Math.max(0, visBottom - visTop);
      if (vis > bestScore) { bestScore = vis; best = c; }
    }
    return best;
  });

  // Screenshot pleine page (viewport mobile)
  try {
    await page.screenshot({ path: out, fullPage: false });
    console.log(`[${i + 1}/${PLATFORMS_TOP_DOWN.length}] ${plat} → ${out}`);
    captured.push({ plat, path: out, ok: true });
  } catch (e) {
    console.log(`[${i + 1}/${PLATFORMS_TOP_DOWN.length}] ${plat} → ERROR ${e.message}`);
    captured.push({ plat, path: out, ok: false, err: e.message });
  }

  // Scroll vers le post suivant : scroll de la hauteur du viewport sur le container
  // Le container scrollable contient le snap-y vertical. On cherche le bon container.
  if (i < PLATFORMS_TOP_DOWN.length - 1) {
    await page.evaluate(() => {
      // Trouve le scroller (élément avec overflow + snap)
      const all = Array.from(document.querySelectorAll('*'));
      let scroller = null;
      for (const el of all) {
        const cs = getComputedStyle(el);
        if ((cs.scrollSnapType || '').includes('y') && (cs.overflowY === 'auto' || cs.overflowY === 'scroll')) {
          scroller = el;
          break;
        }
      }
      if (!scroller) {
        // Fallback : window
        window.scrollBy({ top: window.innerHeight, behavior: 'instant' });
      } else {
        scroller.scrollBy({ top: scroller.clientHeight, behavior: 'instant' });
      }
    });
  }
}

await browser.close();

// Rapport
const ok = captured.filter(c => c.ok).length;
console.log(`\n=== SCREENSHOTS ===`);
console.log(`OK: ${ok}/${captured.length}`);
for (const c of captured) {
  console.log(`  ${c.ok ? 'OK' : 'KO'}  ${c.plat}  ${c.path}${c.err ? ' — ' + c.err : ''}`);
}
