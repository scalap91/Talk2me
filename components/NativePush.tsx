'use client';

/**
 * Talk2Me — Enregistrement des notifications NATIVES (APK Capacitor, Pascal 2026-06-11).
 * Quand l'app tourne dans l'APK, on demande la permission Android, on récupère le
 * token FCM et on l'envoie au serveur (/api/push/fcm). Au tap d'une notif → on
 * ouvre l'URL. Sur le web classique : ce composant ne fait rien (c'est PushPrompt).
 */
import { useEffect } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function NativePush() {
  useEffect(() => {
    const cap = (window as any).Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
    const PN = cap.Plugins?.PushNotifications;
    if (!PN) return;

    let cancelled = false;
    const handles: any[] = [];

    (async () => {
      try {
        // token reçu → envoyé au serveur
        handles.push(await PN.addListener('registration', async (t: { value: string }) => {
          if (cancelled || !t?.value) return;
          fetch('/api/push/fcm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: t.value, platform: cap.getPlatform?.() || 'android' }),
          }).catch(() => {});
        }));
        handles.push(await PN.addListener('registrationError', (e: any) => console.warn('[push] reg error', e)));
        // tap sur une notif → ouvrir l'URL
        handles.push(await PN.addListener('pushNotificationActionPerformed', (a: any) => {
          const url = a?.notification?.data?.url;
          if (url) window.location.href = url;
        }));

        const perm = await PN.checkPermissions();
        let granted = perm?.receive === 'granted';
        if (!granted) {
          const req = await PN.requestPermissions();
          granted = req?.receive === 'granted';
        }
        if (granted && !cancelled) await PN.register();
      } catch (e) {
        console.warn('[push] native init failed', e);
      }
    })();

    return () => { cancelled = true; handles.forEach((h) => h?.remove?.()); };
  }, []);

  return null;
}
