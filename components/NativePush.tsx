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
        // ON ATTEND D'ÊTRE CONNECTÉ : aucune autorisation (notifs, micro, caméra) n'est
        // demandée tant que l'user n'est pas loggé. (Au login, la page recharge → ce
        // composant se remonte → connecté → on demande alors, au bon moment.)
        const me = await fetch('/api/auth/me', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (cancelled || !me?.user) return;

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

        // Permissions APPEL (micro + caméra) demandées UNE fois après l'install :
        // un probe getUserMedia déclenche les invites Android, puis on coupe tout.
        // Ainsi l'utilisateur a tout accordé avant le premier appel.
        try {
          if (!localStorage.getItem('t2m_av_perms_asked') && navigator.mediaDevices?.getUserMedia) {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(
              () => navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
            );
            if (s) s.getTracks().forEach((t) => t.stop());
            localStorage.setItem('t2m_av_perms_asked', '1');
          }
        } catch { /* refus = on n'insiste pas */ }
      } catch (e) {
        console.warn('[push] native init failed', e);
      }
    })();

    return () => { cancelled = true; handles.forEach((h) => h?.remove?.()); };
  }, []);

  return null;
}
