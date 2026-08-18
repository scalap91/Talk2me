#!/usr/bin/env node
/**
 * INSPECTEUR DE VITRINE — test de non-régression du feed unifié (Pascal 2026-08-18).
 *
 * Ce que La Meute manquait : après un changement de feed, plus rien ne vérifiait que les cartes
 * « enveloppe » (boutique / formation / 3D) sortent CORRECTEMENT du feed unifié. Cet inspecteur
 * publie/lit le feed comme un vrai client et échoue (exit 1) si une régression revient.
 *
 * Vérifie, sur /api/posts?src=cards, vu par un utilisateur NON-propriétaire :
 *   1. BOUTIQUE   → au moins une carte types:['boutique'] avec des produits (items > 0).
 *   2. FORMATION  → carte types:['formation'] avec des modules payants VERROUILLÉS (locked)
 *                   (jamais de contenu payant en clair au feed).
 *   3. LABO 3D    → aucune carte portant [PIECE3D]/[PANO360]/[LEA360] dans le feed (parquée).
 *
 * Usage : BASE=https://dev.talk2me.fr TEST_LOGIN_SECRET=xxx node tests/feed_inspector.mjs
 */
const BASE = process.env.BASE || 'https://dev.talk2me.fr';
const SECRET = process.env.TEST_LOGIN_SECRET;
if (!SECRET) { console.error('✗ TEST_LOGIN_SECRET manquant (env)'); process.exit(2); }

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ✓ ' + msg); };

async function main() {
  // 1) session d'un utilisateur de test NON-propriétaire (téléphone réservé +9990…)
  const login = await fetch(`${BASE}/api/dev/test-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-secret': SECRET },
    body: JSON.stringify({ phone: '+99901234567', name: 'Inspecteur Vitrine' }),
  });
  if (!login.ok) { console.error('✗ test-login a échoué:', login.status); process.exit(2); }
  const { token } = await login.json();
  const cookie = `talk2me_session=${token}`;

  // 2) feed unifié, comme le client
  const res = await fetch(`${BASE}/api/posts?src=cards&limit=100`, { headers: { Cookie: cookie } });
  if (!res.ok) { console.error('✗ /api/posts a échoué:', res.status); process.exit(2); }
  const items = (await res.json()).items || [];
  const cards = items.map((it) => { try { return { it, sc: JSON.parse(it.dotcard || '{}') }; } catch { return { it, sc: {} }; } });
  console.log(`Feed: ${items.length} items\n`);

  // 1. BOUTIQUE avec produits
  const boutiques = cards.filter((c) => (c.sc.types || []).includes('boutique'));
  const withProducts = boutiques.filter((c) => Array.isArray(c.sc.items) && c.sc.items.length > 0);
  ok(boutiques.length > 0, `au moins une boutique dans le feed (${boutiques.length})`);
  ok(withProducts.length > 0, `au moins une boutique AVEC produits (${withProducts.length}/${boutiques.length})`);
  const leak = boutiques.find((c) => /\[VITRINE:/.test(c.it.caption || ''));
  ok(!leak, 'aucune boutique ne laisse fuir [VITRINE:] dans la légende');

  // 2. FORMATION gatée pour un non-propriétaire
  const formations = cards.filter((c) => (c.sc.types || []).includes('formation'));
  if (formations.length > 0) {
    const mods = formations[0].sc.items || [];
    const locked = mods.filter((m) => m && m.locked);
    ok(mods.length > 0, `formation avec modules (${mods.length})`);
    ok(locked.length > 0, `modules payants VERROUILLÉS pour un non-proprio (${locked.length})`);
  } else {
    console.log('  (aucune formation dans le feed — skip gating)');
  }

  // 3. LABO 3D parqué
  const labo = cards.filter((c) => /\[(?:PIECE3D|PANO360|LEA360)\b/.test((c.sc.text && c.sc.text.body) || c.sc.title || c.it.caption || ''));
  ok(labo.length === 0, `aucune carte 3D/labo dans le feed (${labo.length})`);

  if (fails.length) { console.error('\n✗ RÉGRESSION:\n' + fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
  console.log('\n✓ INSPECTEUR VITRINE : tout est vert.');
}
main().catch((e) => { console.error('✗ erreur:', e); process.exit(2); });
