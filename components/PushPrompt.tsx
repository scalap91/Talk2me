'use client';

/**
 * Talk2Me — Activation des notifications push (Pascal 2026-06-11).
 * Si déjà autorisé → on (ré)abonne en silence. Sinon → petit bandeau
 * « Activer les notifications ». Icône = bulle T2M (gérée par le SW).
 */
import { useCallback, useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function subscribe(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    const res = await fetch('/api/push', { cache: 'no-store' });
    const { publicKey } = await res.json();
    if (!publicKey) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const r = await fetch('/api/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub }),
    });
    return r.ok;
  } catch { return false; }
}

export default function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') { subscribe(); return; }
    if (Notification.permission === 'default') {
      const dismissed = sessionStorage.getItem('t2m-push-dismissed');
      if (!dismissed) setShow(true);
    }
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') { await subscribe(); setShow(false); }
      else { setShow(false); }
    } finally { setBusy(false); }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-[84px] z-[90] rounded-2xl border border-red-400/30 bg-[#1a1014]/97 backdrop-blur p-3 flex items-center gap-3 shadow-xl shadow-black/50">
      <span className="w-9 h-9 rounded-xl bg-red-600 text-white grid place-items-center text-[11px] font-bold shrink-0">T2M</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white/95">Active les notifications</p>
        <p className="text-[11.5px] text-white/55">Sois prévenu des messages et commandes.</p>
      </div>
      <button onClick={enable} disabled={busy} className="px-3 py-2 rounded-lg bg-red-600 text-white text-[12.5px] font-semibold disabled:opacity-50">{busy ? '…' : 'Activer'}</button>
      <button onClick={() => { sessionStorage.setItem('t2m-push-dismissed', '1'); setShow(false); }} aria-label="Plus tard" className="w-7 h-7 rounded-full bg-white/10 text-white/60 grid place-items-center text-[14px]">×</button>
    </div>
  );
}
