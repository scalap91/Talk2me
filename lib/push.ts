import 'server-only';

/**
 * Talk2Me — Web Push (Pascal 2026-06-11). Abonnements stockés par user ; envoi
 * via web-push (VAPID). Nettoyage auto des abonnements morts (404/410).
 */
import webpush from 'web-push';
import { existsSync, readFileSync } from 'fs';
import { getDb } from '@/lib/db';

// ---- Firebase Cloud Messaging (notifs natives APK Android, Pascal 2026-06-11) ----
// La clé de compte de service (fichier n°2 de Firebase) est lue depuis
// FIREBASE_SERVICE_ACCOUNT (chemin) ou /home/ubuntu/talktome/.firebase-admin.json.
// Tant qu'elle est absente, l'envoi FCM est simplement sauté (web push continue).
const FCM_KEY_PATH = process.env.FIREBASE_SERVICE_ACCOUNT || '/home/ubuntu/talktome/.firebase-admin.json';
let fcmApp: import('firebase-admin').app.App | null = null;
let fcmTried = false;
async function getFcm(): Promise<import('firebase-admin').messaging.Messaging | null> {
  if (fcmApp) return (await import('firebase-admin')).messaging(fcmApp);
  if (fcmTried) return null;
  fcmTried = true;
  if (!existsSync(FCM_KEY_PATH)) return null;
  try {
    const admin = (await import('firebase-admin')).default;
    const cred = JSON.parse(readFileSync(FCM_KEY_PATH, 'utf8'));
    fcmApp = admin.apps.length ? admin.apps[0]! : admin.initializeApp({ credential: admin.credential.cert(cred) });
    return admin.messaging(fcmApp);
  } catch (e) {
    console.warn('[push] FCM init failed', e);
    return null;
  }
}

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contact@talk2me.fr', pub, priv);
  configured = true;
  return true;
}

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscriptions(user_id);
    CREATE TABLE IF NOT EXISTS push_fcm_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_push_fcm_user ON push_fcm_tokens(user_id);
  `);
  ensured = true;
}

/** Enregistre un token FCM (appareil natif Android/APK). */
export function saveFcmToken(userId: string, token: string, platform = 'android'): boolean {
  ensure();
  if (!token) return false;
  getDb().prepare(
    `INSERT INTO push_fcm_tokens (token, user_id, platform, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id`
  ).run(token, userId, platform, Date.now());
  return true;
}

export function removeFcmToken(token: string): void {
  ensure();
  getDb().prepare('DELETE FROM push_fcm_tokens WHERE token = ?').run(token);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }

export function saveSubscription(userId: string, sub: PushSub): boolean {
  ensure();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  getDb().prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, Date.now());
  return true;
}

export function removeSubscription(endpoint: string): void {
  ensure();
  getDb().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;        // où ouvrir au clic
  tag?: string;        // regroupe les notifs (ex: une conv)
}

/** Envoie une notif à TOUS les appareils d'un user (web push + FCM natif). Best-effort. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  ensure();
  let sent = 0;

  // 1) Web Push (PWA / navigateur)
  if (configure()) {
    const subs = getDb().prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId) as { endpoint: string; p256dh: string; auth: string }[];
    const data = JSON.stringify(payload);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data);
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) removeSubscription(s.endpoint);
      }
    }));
  }

  // 2) FCM (appli native APK Android)
  const tokens = getDb().prepare('SELECT token FROM push_fcm_tokens WHERE user_id = ?').all(userId) as { token: string }[];
  if (tokens.length) {
    const fcm = await getFcm();
    if (fcm) {
      await Promise.all(tokens.map(async (t) => {
        try {
          await fcm.send({
            token: t.token,
            notification: { title: payload.title, body: payload.body },
            data: { url: payload.url || '/' },
            android: {
              priority: 'high',
              notification: { icon: 'ic_stat_notify', color: '#dc2626', tag: payload.tag },
            },
          });
          sent++;
        } catch (e: unknown) {
          const code = (e as { errorInfo?: { code?: string } })?.errorInfo?.code;
          if (code === 'messaging/registration-token-not-registered') removeFcmToken(t.token);
        }
      }));
    }
  }

  return sent;
}
