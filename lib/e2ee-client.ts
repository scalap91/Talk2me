'use client';

/**
 * E2EE Phase 0 — CRYPTO CÔTÉ CLIENT (Pascal 2026-07-09).
 * ECDH P-256 (WebCrypto). La clé PRIVÉE est générée sur l'appareil, stockée NON-EXTRACTIBLE
 * dans IndexedDB → elle ne quitte jamais le téléphone, le serveur ne peut pas déchiffrer.
 * La clé publique est exportée (JWK) et publiée au serveur pour que les pairs chiffrent vers nous.
 *
 * Phase 0 = clés uniquement (ensureKeypair / registerMyKey). Les helpers de chiffrement
 * (deriveSharedKey / encryptText / decryptText) sont prêts pour la Phase 1 mais PAS encore
 * branchés sur le flux de messages.
 */

const DB_NAME = 't2m-e2ee';
const STORE = 'keys';
const KEY_ID = 'self-ecdh-p256';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as T | undefined);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbPut(key: string, val: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Génère (ou récupère) MA paire ECDH. Clé privée non-extractible, persistée en IndexedDB. */
export async function ensureKeypair(): Promise<CryptoKeyPair> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) throw new Error('no_webcrypto');
  const existing = await idbGet<CryptoKeyPair>(KEY_ID);
  if (existing?.privateKey && existing?.publicKey) return existing;
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,               // privée NON-extractible (sécurité) ; la publique reste exportable
    ['deriveKey', 'deriveBits'],
  );
  await idbPut(KEY_ID, pair);
  return pair;
}

/** Ma clé publique au format JWK (à publier au serveur). */
export async function getMyPublicJwk(): Promise<JsonWebKey> {
  const pair = await ensureKeypair();
  return crypto.subtle.exportKey('jwk', pair.publicKey);
}

/** Publie ma clé publique au serveur (idempotent — à appeler au démarrage / login). */
export async function registerMyKey(): Promise<boolean> {
  try {
    const jwk = await getMyPublicJwk();
    const r = await fetch('/api/e2ee/keys', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public_jwk: jwk }) });
    return r.ok;
  } catch { return false; }
}

// ─────────── Helpers Phase 1 (prêts, pas encore branchés sur les messages) ───────────

/** Dérive la clé AES-GCM partagée avec un pair (à partir de SA clé publique JWK). */
export async function deriveSharedKey(peerPublicJwk: JsonWebKey): Promise<CryptoKey> {
  const pair = await ensureKeypair();
  const peerKey = await crypto.subtle.importKey('jwk', peerPublicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerKey },
    pair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Chiffre un texte avec une clé AES-GCM → payload `iv.ciphertext` (base64). */
export async function encryptText(text: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return `${b64(iv.buffer)}.${b64(ct)}`;
}

/** Déchiffre un payload `iv.ciphertext` avec la clé AES-GCM. */
export async function decryptText(payload: string, key: CryptoKey): Promise<string> {
  const [ivB64, ctB64] = payload.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64));
  return new TextDecoder().decode(pt);
}

// ─────────── Phase 1b — helpers par PAIR (conv amis↔amis) ───────────
// Cache mémoire de la clé partagée par pair (ECDH symétrique : même clé dans les 2 sens).
const _peerKeyCache = new Map<string, CryptoKey | null>();

/** Clé AES-GCM partagée avec un pair (dérivée de SA clé publique). null si le pair n'a pas de clé. */
export async function getPeerKey(peerUserId: string): Promise<CryptoKey | null> {
  if (_peerKeyCache.has(peerUserId)) return _peerKeyCache.get(peerUserId) ?? null;
  try {
    const r = await fetch(`/api/e2ee/keys?user=${encodeURIComponent(peerUserId)}`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json();
    if (!d?.public_jwk) { _peerKeyCache.set(peerUserId, null); return null; }
    const key = await deriveSharedKey(d.public_jwk as JsonWebKey);
    _peerKeyCache.set(peerUserId, key);
    return key;
  } catch { _peerKeyCache.set(peerUserId, null); return null; }
}

/** Chiffre un texte pour un pair. Renvoie le payload chiffré, ou null si pas de clé (→ repli clair). */
export async function encryptForPeer(peerUserId: string, text: string): Promise<string | null> {
  try { const key = await getPeerKey(peerUserId); return key ? await encryptText(text, key) : null; } catch { return null; }
}

/** Déchiffre un payload d'un pair. Renvoie le clair, ou null si échec (→ placeholder). */
export async function decryptFromPeer(peerUserId: string, payload: string): Promise<string | null> {
  try { const key = await getPeerKey(peerUserId); return key ? await decryptText(payload, key) : null; } catch { return null; }
}
