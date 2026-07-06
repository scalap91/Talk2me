// Test API Banggood — à lancer dès que BANGGOOD_APP_ID/SECRET sont remplis dans .env.local.
//   node scripts/bg-test.mjs
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const ID = env.BANGGOOD_APP_ID, SECRET = env.BANGGOOD_APP_SECRET, BASE = 'https://api.banggood.com';
if (!ID || !SECRET) { console.log('⛔ Clés Banggood manquantes (BANGGOOD_APP_ID / BANGGOOD_APP_SECRET). Remplis-les puis relance.'); process.exit(0); }
const j = async (u) => { const r = await fetch(u); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

console.log('=== 1) getAccessToken ===');
const tok = await j(`${BASE}/getAccessToken?app_id=${encodeURIComponent(ID)}&app_secret=${encodeURIComponent(SECRET)}`);
console.log(JSON.stringify(tok).slice(0, 400));
const access = tok && tok.access_token;
if (!access) { console.log('⛔ pas de access_token — vérifier clés / domaine vérifié / IP whitelist / palier API.'); process.exit(0); }

console.log('\n=== 2) getCategoryList ===');
console.log(JSON.stringify(await j(`${BASE}/getCategoryList?access_token=${access}&lang=fr`)).slice(0, 900));

console.log('\n=== 3) getProductList ===');
console.log(JSON.stringify(await j(`${BASE}/getProductList?access_token=${access}&lang=fr&currency=EUR&page=1`)).slice(0, 1100));
