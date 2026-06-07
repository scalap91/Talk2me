// Talk2Me #386 — screenshots logo T2M sur /signin + /home (avatar T2M)
// S23 FE 390×844, headless. Captures dans /home/ubuntu/dashboard/uploads/

import pwPkg from '/var/www/airbizness/site_audit/node_modules/playwright/index.js';
const { chromium } = pwPkg;

const SESSION_TOKEN = '38e192d3821065a9cf11ea02c4ade58e696c4c67016e9d8e64a2c7cca2c2f987';
const BASE = 'http://localhost:3010';
const OUT = '/home/ubuntu/dashboard/uploads';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; SM-S711B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

// === 1. /signin sans cookie ===
const pageSignin = await context.newPage();
await pageSignin.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
await pageSignin.waitForTimeout(800);
await pageSignin.screenshot({ path: `${OUT}/talk2me_logo_signin.png`, fullPage: false });
console.log('[ok] /signin screenshot →', `${OUT}/talk2me_logo_signin.png`);
await pageSignin.close();

// === 2. /home avec cookie T2M Officiel (avatar visible) ===
await context.addCookies([
  {
    name: 'talk2me_session',
    value: SESSION_TOKEN,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  },
]);
const pageHome = await context.newPage();
await pageHome.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
await pageHome.waitForTimeout(4000);
// Scroll un peu pour avoir un post avec author visible
await pageHome.evaluate(() => window.scrollTo(0, 0));
await pageHome.waitForTimeout(500);
await pageHome.screenshot({ path: `${OUT}/talk2me_logo_avatar_t2m.png`, fullPage: false });
console.log('[ok] /home screenshot →', `${OUT}/talk2me_logo_avatar_t2m.png`);
await pageHome.close();

await browser.close();
console.log('done');
