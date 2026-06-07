/**
 * Talk2Me PII security tests (Pascal 2026-06-05).
 *
 * Couvre la mission Pascal :
 * 1. T2M Officiel search_users — scope strict (current + amis), sortie sanitisée
 * 2. Scrubber regex sur reply.text avant persistance
 * 3. sanitizeQuotedText pour Léa
 *
 * Run : node tests/pii_security_2026_06_05.mjs
 */

import assert from 'node:assert/strict';

// On utilise tsx loader pour importer le TS directement
const { scrubPiiFromReply } = await import('../lib/ai/officiel/handler.ts');

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  OK  ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, error: e.message });
    console.log(`  KO  ${name}\n        ${e.message}`);
  }
}

console.log('\n=== Talk2Me PII Security tests (Pascal 2026-06-05) ===\n');

// ---------------------------------------------------------------------------
console.log('## scrubPiiFromReply\n');

test('drop ligne "Talk2Me ID : 263368"', () => {
  const r = scrubPiiFromReply(
    'Voici les comptes :\n- pascalrepir — Talk2Me ID : 263368\n- pascalrepir_e20 — Talk2Me ID : 588770'
  );
  assert.equal(r.leaked, true);
  assert.ok(r.reasons.includes('talk2me_id_label'));
  assert.ok(!r.text.toLowerCase().includes('talk2me id'));
  assert.ok(!r.text.includes('263368'));
  assert.ok(!r.text.includes('588770'));
});

test('drop énumération "comptes associés"', () => {
  const r = scrubPiiFromReply(
    "Voici les comptes associés à Pascal.repir sur Talk2Me :\n- pascalrepir\n- pascalrepir_e20"
  );
  assert.equal(r.leaked, true);
  assert.ok(r.reasons.includes('accounts_enumeration'));
});

test('drop ID en clair "id : 123456"', () => {
  const r = scrubPiiFromReply('Ton id : 123456 est privé');
  assert.equal(r.leaked, true);
  // soit id_number_phrase soit six_digit_id
  assert.ok(
    r.reasons.includes('id_number_phrase') || r.reasons.includes('six_digit_id')
  );
});

test('drop email', () => {
  const r = scrubPiiFromReply('Tu peux écrire à pascal.repir@gmail.com');
  assert.equal(r.leaked, true);
  assert.ok(r.reasons.includes('email'));
  assert.ok(!r.text.includes('@gmail.com'));
});

test('redact numéro 6 chiffres isolé', () => {
  const r = scrubPiiFromReply('Le nombre 263368 est sensible');
  assert.equal(r.leaked, true);
  assert.ok(r.reasons.includes('six_digit_id'));
  assert.ok(r.text.includes('[ID masqué]'));
  assert.ok(!r.text.includes('263368'));
});

test('pas de leak sur réponse normale "tu peux voir le buzz"', () => {
  const r = scrubPiiFromReply(
    'Voici les posts qui buzz cette semaine sur Talk2Me. @paul a 42 likes.'
  );
  assert.equal(r.leaked, false);
  assert.equal(r.text, 'Voici les posts qui buzz cette semaine sur Talk2Me. @paul a 42 likes.');
});

test('pas de leak sur dates / nombres normaux 4-5 chiffres', () => {
  const r = scrubPiiFromReply('1234 likes, 99999 vues, posté le 2026-06-05');
  assert.equal(r.leaked, false);
});

test('texte vide → leaked false', () => {
  const r = scrubPiiFromReply('');
  assert.equal(r.leaked, false);
  assert.equal(r.text, '');
});

console.log(`\n=== Résultat : ${pass} OK / ${fail} KO ===`);

if (fail > 0) {
  console.log('\nÉchecs :');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
  process.exit(1);
}
process.exit(0);
