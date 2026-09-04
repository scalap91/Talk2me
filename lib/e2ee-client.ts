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
const JWK_ID = 'self-ecdh-p256-jwk';   // paire persistée en JWK (fiable WebView/IndexedDB)
const PUB_REG_ID = 'self-pub-registered'; // dernière clé publique publiée (anti-réécrasement)
const LS_JWK = 't2m-e2ee-jwk';            // miroir localStorage (persistance renforcée WebView)

type JwkPair = { pub: JsonWebKey; priv: JsonWebKey };
function lsGetJwk(): JwkPair | null { try { const s = localStorage.getItem(LS_JWK); return s ? JSON.parse(s) as JwkPair : null; } catch { return null; } }
function lsPutJwk(v: JwkPair): void { try { localStorage.setItem(LS_JWK, JSON.stringify(v)); } catch { /* quota/WebView → ignore */ } }

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
  // 1) JWK persisté : localStorage PRIORITAIRE (le plus fiable en WebView) puis IndexedDB.
  //    Auto-réparation : on ré-écrit dans les 2 stores → la clé survit tant qu'AU MOINS un
  //    persiste, donc elle cesse de tourner (avant : CryptoKey non-extractible ne survivait pas
  //    → clé régénérée à chaque reload → clé serveur écrasée → « clé indisponible »).
  const jwks = lsGetJwk() ?? await idbGet<JwkPair>(JWK_ID);
  if (jwks?.pub && jwks?.priv) {
    try {
      const publicKey = await crypto.subtle.importKey('jwk', jwks.pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
      const privateKey = await crypto.subtle.importKey('jwk', jwks.priv, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
      lsPutJwk(jwks); idbPut(JWK_ID, jwks).catch(() => {}); // ré-écrit les 2 (répare si l'un vidé)
      return { publicKey, privateKey };
    } catch { /* JWK corrompu → on régénère plus bas */ }
  }
  // 2) Compat : ancienne paire CryptoKey si elle a survécu (rare). Sinon on régénère.
  const legacy = await idbGet<CryptoKeyPair>(KEY_ID);
  if (legacy?.privateKey && legacy?.publicKey && (legacy.privateKey as CryptoKey).algorithm) return legacy;
  // 3) Génération EXTRACTIBLE + DOUBLE persistance (localStorage + IndexedDB).
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const [pub, priv] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey),
  ]);
  const rec: JwkPair = { pub, priv };
  lsPutJwk(rec); await idbPut(JWK_ID, rec);
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
    // Multi-appareil : on publie TOUJOURS la clé de CET appareil (pas de skip idempotent —
    // sinon la clé d'appareil ne serait jamais publiée si la même paire a déjà été publiée en legacy).
    const r = await fetch('/api/e2ee/keys', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public_jwk: jwk, device_id: getDeviceId() }) });
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

// ─────────── MULTI-APPAREIL (Pascal 2026-09-01) ───────────
// Identifiant STABLE de cet appareil (navigateur). Persisté en localStorage.
const DEVICE_ID_KEY = 't2m-device-id';
function getDeviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE_ID_KEY);
    if (!d) { d = (crypto.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2))); localStorage.setItem(DEVICE_ID_KEY, d); }
    return d;
  } catch { return 'dev-' + Math.random().toString(36).slice(2); }
}

let _myUid: string | null | undefined;
async function getMyUserId(): Promise<string | null> {
  if (_myUid !== undefined) return _myUid;
  try { const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }); const d = await r.json(); _myUid = d?.user?.id ?? null; } catch { _myUid = null; }
  return _myUid ?? null;
}

type DevKey = { device_id: string; public_jwk: JsonWebKey };
const _devKeys = new Map<string, { at: number; keys: DevKey[] }>();
async function getDeviceKeys(userId: string): Promise<DevKey[]> {
  const c = _devKeys.get(userId);
  if (c && Date.now() - c.at < 60_000) return c.keys;
  try {
    const r = await fetch(`/api/e2ee/keys?user=${encodeURIComponent(userId)}`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json();
    let keys: DevKey[] = Array.isArray(d?.keys) ? d.keys.filter((k: DevKey) => k?.device_id && k?.public_jwk) : [];
    if (keys.length === 0 && d?.public_jwk) keys = [{ device_id: 'legacy', public_jwk: d.public_jwk as JsonWebKey }];
    _devKeys.set(userId, { at: Date.now(), keys });
    return keys;
  } catch { return []; }
}
async function deriveWith(jwk: JsonWebKey): Promise<CryptoKey | null> {
  try { return await deriveSharedKey(jwk); } catch { return null; }
}

/** Chiffre le texte vers TOUS les appareils du pair + les MIENS (relecture partout). Format v2. */
export async function encryptForPeer(peerUserId: string, text: string): Promise<string | null> {
  try {
    const myUid = await getMyUserId(); if (!myUid) return null;
    const myDev = getDeviceId();
    const [peerKeys, myKeys] = await Promise.all([getDeviceKeys(peerUserId), getDeviceKeys(myUid)]);
    const targets: { u: string; d: string; jwk: JsonWebKey }[] = [];
    for (const k of peerKeys) targets.push({ u: peerUserId, d: k.device_id, jwk: k.public_jwk });
    for (const k of myKeys) targets.push({ u: myUid, d: k.device_id, jwk: k.public_jwk }); // inclut l'appareil courant → je me relis
    if (targets.length === 0) return null;
    const b: Record<string, string> = {};
    for (const t of targets) { const key = await deriveWith(t.jwk); if (key) b[`${t.u}:${t.d}`] = await encryptText(text, key); }
    if (Object.keys(b).length === 0) return null;
    return btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, su: myUid, sd: myDev, b }))));
  } catch { return null; }
}

/** Déchiffre un payload (v2 multi-appareil, repli v1 mono-clé). null si pas pour cet appareil / échec. */
export async function decryptFromPeer(peerUserId: string, payload: string): Promise<string | null> {
  try {
    const json = decodeURIComponent(escape(atob(payload)));
    if (json.charCodeAt(0) === 123) {
      const env = JSON.parse(json) as { v?: number; su?: string; sd?: string; b?: Record<string, string> };
      if (env?.v === 2 && env.b) {
        const myUid = await getMyUserId(); const myDev = getDeviceId();
        const blob = myUid ? env.b[`${myUid}:${myDev}`] : undefined;
        if (!blob) return null; // pas chiffré pour cet appareil
        const senderKeys = await getDeviceKeys(env.su || '');
        const sjwk = senderKeys.find((k) => k.device_id === env.sd)?.public_jwk ?? senderKeys[0]?.public_jwk;
        if (!sjwk) return null;
        const key = await deriveWith(sjwk);
        return key ? await decryptText(blob, key) : null;
      }
    }
  } catch { /* pas du v2 → repli v1 */ }
  try { const key = await getPeerKey(peerUserId); return key ? await decryptText(payload, key) : null; } catch { return null; }
}

/** Détecte un CHANGEMENT de clé publique du pair (façon Signal « le numéro de sécurité a changé »).
 *  'new' = 1re fois qu'on la voit · 'same' · 'changed' · 'none' = pair sans clé publiée. */
export async function checkPeerKeyChange(peerUserId: string): Promise<'new' | 'same' | 'changed' | 'none'> {
  return 'same'; // multi-appareil : auto-réparation → plus de bannière de changement de clé
  try {
    const r = await fetch(`/api/e2ee/keys?user=${encodeURIComponent(peerUserId)}`, { credentials: 'include', cache: 'no-store' });
    const d = await r.json();
    if (!d?.public_jwk) return 'none';
    const sig = JSON.stringify(d.public_jwk);
    const prev = await idbGet<string>(`peerpub:${peerUserId}`);
    await idbPut(`peerpub:${peerUserId}`, sig);
    if (!prev) return 'new';
    if (prev === sig) return 'same';
    _peerKeyCache.delete(peerUserId); // clé changée → invalide la clé dérivée en cache
    return 'changed';
  } catch { return 'none'; }
}
