/**
 * Test harness — Talk2Me #339 Consciousness Lot 1.
 *
 * Usage : `npx tsx tests/consciousness-dump.ts <userId>`
 *
 * Imprime le bloc consciousness pour un user donné + mesure cache hit.
 * Vérifie :
 *  - le bloc contient les 7 sections (N1..N7)
 *  - cache 2e appel < 5ms
 *  - longueur totale système prompt restera raisonnable
 */

import { buildConsciousness } from '@/lib/ai/consciousness';
import { invalidateConsciousness } from '@/lib/ai/consciousness';

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Usage: tsx tests/consciousness-dump.ts <userId>');
    process.exit(1);
  }

  // Premier appel (build cold)
  invalidateConsciousness(userId);
  const t1 = Date.now();
  const block1 = await buildConsciousness({ userId, mode: 'chat' });
  const dt1 = Date.now() - t1;

  // 2e appel (devrait hit le cache)
  const t2 = Date.now();
  const block2 = await buildConsciousness({ userId, mode: 'chat' });
  const dt2 = Date.now() - t2;

  // Vérifications
  const checks = [
    { name: 'CONSCIOUSNESS CORE header', ok: block1.includes('AI CONSCIOUSNESS CORE') },
    { name: 'N1 QUI SUIS-JE', ok: block1.includes('## QUI SUIS-JE') },
    { name: 'N2 ÉCOSYSTÈME', ok: block1.includes('## ÉCOSYSTÈME TALK2ME') },
    { name: 'N3 OUTILS', ok: block1.includes('## OUTILS DISPONIBLES') },
    { name: 'N3 search_youtube listé', ok: block1.includes('search_youtube') },
    { name: 'N3 search_place listé', ok: block1.includes('search_place') },
    { name: 'N3 search_web listé', ok: block1.includes('search_web') },
    { name: 'N4 CARDS', ok: block1.includes('## CARDS DISPONIBLES') },
    { name: 'N4 PlaceCard listée', ok: block1.includes('PlaceCard') },
    { name: 'N4 RecipeCard listée', ok: block1.includes('RecipeCard') },
    { name: 'N4 WeatherCard listée', ok: block1.includes('WeatherCard') },
    { name: 'N5 CET UTILISATEUR', ok: block1.includes('## CET UTILISATEUR') },
    { name: 'N5 Profil', ok: block1.includes('Profil :') },
    { name: 'N5 Mémoires', ok: block1.includes('Mémoires sur lui') },
    { name: 'N5 Habitudes', ok: block1.includes('Habitudes apprises') },
    { name: 'N6 AMIS', ok: block1.includes('## AMIS') },
    { name: 'N7 AUTRES IA', ok: block1.includes('## AUTRES IA') },
    { name: 'N7 ISOLATION STRICTE', ok: block1.includes('ISOLATION STRICTE') },
    { name: 'FIN CONSCIOUSNESS', ok: block1.includes('FIN CONSCIOUSNESS') },
    { name: 'Cache hit identique', ok: block1 === block2 },
    { name: 'Cache 2e appel < 5ms', ok: dt2 < 5 },
    { name: 'Cold build < 200ms', ok: dt1 < 200 },
  ];

  console.log('=== CONSCIOUSNESS BLOCK DUMP ===');
  console.log(block1);
  console.log('=== METRICS ===');
  console.log(`Cold build : ${dt1}ms`);
  console.log(`Cache hit  : ${dt2}ms`);
  console.log(`Block size : ${block1.length} chars (~${Math.round(block1.length / 4)} tokens)`);
  console.log('=== CHECKS ===');
  let failed = 0;
  for (const c of checks) {
    const tag = c.ok ? 'OK ' : 'KO ';
    if (!c.ok) failed++;
    console.log(`[${tag}] ${c.name}`);
  }
  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
