/**
 * Talk2Me PII security — Test scope strict de search_users (Pascal 2026-06-05).
 *
 * Vérifie que le handler search_users (T2M Officiel) :
 *   - Renvoie [] sans ctx.senderUser (fail-safe)
 *   - Renvoie [] sur lookup 6-chiffres (refus énumération via talk2me_id)
 *   - Restreint le résultat à current user + amis acceptés
 *   - Sortie sanitisée : username + display_name + avatar_url + is_self,
 *     PAS de talk2me_id, PAS d'email, PAS d'id interne
 *
 * Run : npx tsx tests/pii_search_users_scope_2026_06_05.mjs
 */

import assert from 'node:assert/strict';

const { OFFICIEL_HANDLERS } = await import('../lib/ai/officiel/tools.ts');
const {
  createUser,
  addFriend,
  removeFriend,
  searchUsers,
  getUserByUsername,
} = await import('../lib/db.ts');

const handler = OFFICIEL_HANDLERS.search_users;

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  OK  ${name}`);
  } catch (e) {
    fail++;
    console.log(`  KO  ${name}\n        ${e.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  OK  ${name}`);
  } catch (e) {
    fail++;
    console.log(`  KO  ${name}\n        ${e.message}`);
  }
}

console.log('\n=== Talk2Me PII search_users scope tests (Pascal 2026-06-05) ===\n');

// Setup : on cherche/crée 3 users de test
// Contrainte DB : username [a-z0-9_]{3,20} → on raccourcit
const ts = Date.now().toString(36).slice(-8);
const aliceUsername = `pii_alice_${ts}`;
const bobUsername = `pii_bob_${ts}`;
const charlieUsername = `pii_chrl_${ts}`;

const alice = getUserByUsername(aliceUsername) || createUser({
  username: aliceUsername,
  display_name: 'Alice PII Test',
  email: `${aliceUsername}@piitest.local`,
});
const bob = getUserByUsername(bobUsername) || createUser({
  username: bobUsername,
  display_name: 'Bob PII Test',
  email: `${bobUsername}@piitest.local`,
});
const charlie = getUserByUsername(charlieUsername) || createUser({
  username: charlieUsername,
  display_name: 'Charlie PII Stranger',
  email: `${charlieUsername}@piitest.local`,
});

// Alice et Bob amis. Charlie = étranger.
addFriend(alice.id, bob.id);

console.log(`  setup users alice=${alice.id} bob=${bob.id} charlie=${charlie.id}\n`);

// --- Tests ---
await asyncTest('fail-safe : sans ctx.senderUser → []', async () => {
  const r = await handler({ query: 'pii_' }, {});
  assert.equal(r.ok, true);
  assert.equal(r.users.length, 0);
});

await asyncTest('fail-safe : ctx.senderUser=null → []', async () => {
  const r = await handler({ query: 'pii_' }, { senderUser: null });
  assert.equal(r.users.length, 0);
});

await asyncTest('refus lookup talk2me_id 6 chiffres', async () => {
  const r = await handler(
    { query: alice.talk2me_id || '123456' },
    { senderUser: alice }
  );
  assert.equal(r.users.length, 0, 'lookup talk2me_id doit retourner []');
});

await asyncTest('Alice cherche "pii_test" → trouve Alice + Bob (PAS Charlie)', async () => {
  const r = await handler({ query: 'pii_' }, { senderUser: alice });
  const usernames = r.users.map((u) => u.username);
  assert.ok(usernames.includes(aliceUsername), 'Alice doit voir Alice (self)');
  assert.ok(usernames.includes(bobUsername), 'Alice doit voir Bob (ami)');
  assert.ok(
    !usernames.includes(charlieUsername),
    `Alice NE doit PAS voir Charlie (étranger). Got: ${usernames.join(', ')}`
  );
});

await asyncTest('sortie sanitisée — pas de talk2me_id', async () => {
  const r = await handler({ query: 'pii_' }, { senderUser: alice });
  for (const u of r.users) {
    assert.equal(u.talk2me_id, undefined, 'talk2me_id NE doit PAS être dans la sortie');
    assert.equal(u.id, undefined, "id interne NE doit PAS être dans la sortie");
    assert.equal(u.email, undefined, 'email NE doit PAS être dans la sortie');
    assert.ok(typeof u.username === 'string');
    assert.ok('display_name' in u);
    assert.ok('avatar_url' in u);
    assert.ok('is_self' in u);
  }
});

await asyncTest('is_self correct pour Alice', async () => {
  const r = await handler({ query: 'pii_' }, { senderUser: alice });
  const self = r.users.find((u) => u.username === aliceUsername);
  const friend = r.users.find((u) => u.username === bobUsername);
  assert.equal(self?.is_self, true);
  assert.equal(friend?.is_self, false);
});

await asyncTest('Charlie isolé cherche Alice → [] (étranger)', async () => {
  const r = await handler({ query: aliceUsername }, { senderUser: charlie });
  assert.equal(
    r.users.length,
    0,
    `Charlie (étranger) NE doit PAS voir Alice. Got: ${JSON.stringify(r.users)}`
  );
});

await asyncTest('searchUsers brut (DB) trouve bien Charlie (pour comparaison)', () => {
  // Sanity check : la DB renvoie bien Charlie sur recherche large
  const raw = searchUsers('pii_', null);
  const usernames = raw.map((u) => u.username);
  assert.ok(usernames.includes(charlieUsername));
});

// Cleanup amitié pour idempotence
try { removeFriend(alice.id, bob.id); } catch {}

console.log(`\n=== Résultat : ${pass} OK / ${fail} KO ===`);
if (fail > 0) process.exit(1);
process.exit(0);
