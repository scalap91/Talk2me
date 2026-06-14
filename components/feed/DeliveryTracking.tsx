'use client';

/**
 * Talk2Me — Suivi de livraison Eat (Pascal 2026-06-10). Le client suit le SCOOTER
 * qui se rapproche sur la carte (réutilise DriveMap/Leaflet de Talk N Drive), puis
 * confirme la réception → LIBÈRE l'escrow (resto + livreur payés).
 * MVP : position du livreur simulée (resto → client). Le vrai GPS livreur = brique
 * driver-side de Talk N Drive (#23).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Bike, ShoppingBag, Check, Loader2, Phone, PhoneOff } from 'lucide-react';
import DriveMap from '@/components/drive/DriveMap';
import { startRingtone } from '@/lib/webrtc-helpers';

export default function DeliveryTracking({ escrowId, restoName, pickup = false, onClose }: { escrowId: string; restoName: string; pickup?: boolean; onClose: () => void }) {
  const [t, setT] = useState(0); // progression 0→1 du scooter
  const [me, setMe] = useState<{ lat: number; lng: number }>({ lat: 48.8566, lng: 2.3522 });
  const [resto, setResto] = useState<{ lat: number; lng: number }>({ lat: 48.8646, lng: 2.3622 });
  const [released, setReleased] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  // Appel SIMULÉ du livreur quand il arrive (démo réaliste, aucun provider).
  const [callPhase, setCallPhase] = useState<'idle' | 'ringing' | 'active'>('idle');
  const [callSecs, setCallSecs] = useState(0);
  const callFiredRef = useRef(false);
  const ringStopRef = useRef<(() => void) | null>(null);

  // Géoloc client → resto placé ~1 km à côté (départ du scooter).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        setMe({ lat, lng });
        setResto({ lat: lat + 0.009, lng: lng + 0.011 });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  // Le scooter avance vers le client (~30 s).
  useEffect(() => {
    if (startedRef.current) return; startedRef.current = true;
    const iv = setInterval(() => setT((x) => (x >= 1 ? 1 : Math.min(1, x + 0.025))), 700);
    return () => clearInterval(iv);
  }, []);

  const driver = { lat: resto.lat + (me.lat - resto.lat) * t, lng: resto.lng + (me.lng - resto.lng) * t };
  const arrived = t >= 0.97;
  // Heure de disponibilité (~10 min) pour le mode récupération.
  const readyAt = useMemo(() => { const d = new Date(Date.now() + 10 * 60000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }, []);
  const status = released
    ? (pickup ? 'Récupérée ✅' : 'Livré ✅')
    : pickup ? `Prête à ${readyAt} — passe la chercher`
    : t < 0.05 ? 'Recherche d’un livreur…' : arrived ? 'Ton livreur est arrivé 🛵' : 'Ton livreur arrive…';
  const etaMin = Math.max(1, Math.round((1 - t) * 12));

  // Quand le livreur ARRIVE (livraison, pas pickup) → il t'appelle (1×, après 1,2 s).
  useEffect(() => {
    if (pickup || released || callFiredRef.current || !arrived) return;
    callFiredRef.current = true;
    const id = setTimeout(() => setCallPhase('ringing'), 1200);
    return () => clearTimeout(id);
  }, [arrived, pickup, released]);

  // Sonnerie + vibration pendant que ça sonne.
  useEffect(() => {
    if (callPhase === 'ringing') {
      try { ringStopRef.current = startRingtone(); } catch { /* audio bloqué */ }
      try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch { /* */ }
    }
    return () => { ringStopRef.current?.(); ringStopRef.current = null; try { navigator.vibrate?.(0); } catch { /* */ } };
  }, [callPhase]);

  // Chrono de l'appel actif.
  useEffect(() => {
    if (callPhase !== 'active') return;
    const id = setInterval(() => setCallSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [callPhase]);

  const callTimer = `${String(Math.floor(callSecs / 60)).padStart(2, '0')}:${String(callSecs % 60).padStart(2, '0')}`;
  const driverLine = callSecs < 7 ? 'Allô ! Je suis en bas avec ta commande 🛵' : 'Je t’attends devant l’entrée, tu peux descendre ?';

  const confirm = async () => {
    if (busy || released) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/wallet/escrow/${escrowId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'release' }),
      });
      if (r.ok) { setReleased(true); setT(1); }
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#0e0e12] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-white/8" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onClose} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ChevronLeft className="w-6 h-6" /></button>
        {pickup ? <ShoppingBag className="w-5 h-5 text-amber-300" /> : <Bike className="w-5 h-5 text-amber-300" />}
        <h1 className="text-[16px] font-semibold text-white/95 truncate">{pickup ? 'À récupérer' : 'Suivi'} · {restoName}</h1>
      </header>

      {/* Carte : pickup → resto à atteindre ; livraison → scooter qui se rapproche */}
      <div className="flex-1 min-h-0 relative">
        <DriveMap
          center={pickup ? resto : me}
          markers={pickup ? [
            { lat: me.lat, lng: me.lng, kind: 'me', label: 'Toi' },
            { lat: resto.lat, lng: resto.lng, kind: 'pickup', label: `🍔 ${restoName}` },
          ] : [
            { lat: me.lat, lng: me.lng, kind: 'me', label: 'Toi' },
            { lat: resto.lat, lng: resto.lng, kind: 'pickup', label: restoName },
            { lat: driver.lat, lng: driver.lng, kind: 'driver', label: '🛵 Livreur' },
          ]}
          className="absolute inset-0"
        />
      </div>

      {/* Statut + confirmation */}
      <div className="shrink-0 p-4 pb-6 border-t border-white/8 bg-[#0e0e12]">
        {pickup && !released && (
          <p className="text-[12px] text-amber-200 mb-2">🛺 Mode Drive : tu es sur la route, tu passes la chercher toi-même — pas de livreur, pas de frais.</p>
        )}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[15px] font-semibold text-white">{status}</p>
            {!released && <p className="text-[12px] text-white/50">{pickup ? `Chez ${restoName}` : arrived ? 'Récupère ta commande' : `Arrivée estimée ~${etaMin} min`}</p>}
          </div>
          {!released && !pickup && !arrived && <Loader2 className="w-5 h-5 animate-spin text-amber-300" />}
        </div>
        <button
          onClick={confirm}
          disabled={busy || released}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-[14px] disabled:opacity-50 active:scale-[0.99]"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {released ? (pickup ? 'Récupérée — paiement libéré ✅' : 'Reçu — paiement libéré ✅') : pickup ? 'J’ai récupéré ma commande → libérer le paiement' : 'J’ai reçu ma commande → libérer le paiement'}
        </button>
      </div>

      {/* APPEL SIMULÉ du livreur (à l'arrivée) */}
      {callPhase !== 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-between py-16 px-6"
          style={{ zIndex: 4000, backgroundColor: '#0b0b0f', backgroundImage: 'linear-gradient(to bottom,#16161e,#0b0b0f)', paddingTop: 'calc(env(safe-area-inset-top) + 3rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 3rem)' }}>
          <div className="flex flex-col items-center gap-3 mt-6">
            <div className="w-28 h-28 rounded-full grid place-items-center text-[44px] shadow-lg" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>🛵</div>
            <p className="text-[22px] font-bold text-white">Livreur</p>
            <p className="text-[13px] text-white/55">{restoName}</p>
            <p className="text-[14px] text-white/70 mt-1">
              {callPhase === 'ringing' ? 'Appel entrant…' : callTimer}
            </p>
            {callPhase === 'active' && (
              <div className="mt-4 max-w-[260px] px-4 py-2.5 rounded-2xl bg-white/[0.08] text-white/90 text-[14px] text-center">« {driverLine} »</div>
            )}
          </div>

          {callPhase === 'ringing' ? (
            <div className="w-full flex items-center justify-around">
              <button onClick={() => setCallPhase('idle')} className="flex flex-col items-center gap-2">
                <span className="w-16 h-16 rounded-full bg-red-500 grid place-items-center"><PhoneOff className="w-7 h-7 text-white" /></span>
                <span className="text-[12px] text-white/60">Refuser</span>
              </button>
              <button onClick={() => { setCallSecs(0); setCallPhase('active'); }} className="flex flex-col items-center gap-2">
                <span className="w-16 h-16 rounded-full bg-emerald-500 grid place-items-center animate-pulse"><Phone className="w-7 h-7 text-white" /></span>
                <span className="text-[12px] text-white/60">Accepter</span>
              </button>
            </div>
          ) : (
            <button onClick={() => setCallPhase('idle')} className="flex flex-col items-center gap-2">
              <span className="w-16 h-16 rounded-full bg-red-500 grid place-items-center"><PhoneOff className="w-7 h-7 text-white" /></span>
              <span className="text-[12px] text-white/60">Raccrocher</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
