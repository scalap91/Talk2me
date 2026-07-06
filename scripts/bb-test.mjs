// Test API BigBuy — à lancer dès que BIGBUY_API_KEY est rempli dans .env.local.
//   node scripts/bb-test.mjs
// Base sandbox par défaut ; mettre BIGBUY_BASE=https://api.bigbuy.eu pour la prod.
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const KEY = env.BIGBUY_API_KEY, BASE = env.BIGBUY_BASE || 'https://api.sandbox.bigbuy.eu';
if (!KEY) { console.log('⛔ Clé BigBuy manquante (BIGBUY_API_KEY). Remplis-la puis relance.'); process.exit(0); }
const h = { Authorization: `Bearer ${KEY}`, Accept: 'application/json' };
const get = async (p) => { const r = await fetch(`${BASE}${p}`, { headers: h }); const t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch { return t; } })() }; };

console.log('Base:', BASE);
console.log('\n=== 1) Catégories (fr) ===');
const cats = await get('/rest/catalog/categories.json?isoCode=fr');
console.log('HTTP', cats.status, '| échantillon:', JSON.stringify(Array.isArray(cats.body) ? cats.body.slice(0, 5) : cats.body).slice(0, 600));

console.log('\n=== 2) Produits (page 1) ===');
const prods = await get('/rest/catalog/products.json?page=1&pageSize=3');
console.log('HTTP', prods.status, '| échantillon:', JSON.stringify(Array.isArray(prods.body) ? prods.body.slice(0, 2) : prods.body).slice(0, 800));
