'use client';

/**
 * Talk2Me — Suivi de livraison RÉEL (Pascal 2026-07-26). Re-câblage de l'ancienne brique « Chez Mama »
 * (qui simulait un scooter à Paris) sur le VRAI moteur Système B (`lib/shipment.ts`). Une seule brique,
 * une seule vérité : on lit `GET /api/transport/shipments?id=` ({shipment, legs, events}) + polling live.
 * Sert TOUTES les livraisons (boutique, Eat, colis P2P) — l'acheteur suit son colis du dépôt jusqu'à lui.
 * La réception se valide par les 4 derniers chiffres du tél de l'acheteur (le livreur les saisit) → escrow libéré serveur.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Bike, Check, Loader2, MapPin } from '@/lib/icons';
import DriveMap from '@/components/drive/DriveMap';

type Pt = { lat: number; lng: number };
interface Trace {
  shipment: { tracking: string; product_label: string | null; status: string; mode?: string | null;
    o_lat: number; o_lng: number; o_label: string; d_lat: number; d_lng: number; d_label: string;
    cur_lat?: number | null; cur_lng?: number | null; pickup_code?: string | null };
  legs: { status: string; carrier_id: string }[];
  events: { type: string; lat: number | null; lng: number | null; meta: string | null; created_at: number }[];
}

const STATUS_FR: Record<string, string> = {
  created: 'En préparation', at_depot: 'Au dépôt', in_transit: 'En route vers toi',
  ready_for_pickup: 'Prêt à retirer', delivered: 'Livré ✅', cancelled: 'Annulé',
};
// Événements = étapes de la chaîne de garde (les 'position' alimentent la carte, pas la timeline).
const EVENT_FR: Record<string, string> = {
  created: 'Commande créée', ready_for_pickup: 'Prêt au point de retrait', leg_assigned: 'Confié à un livreur',
  received_at_depot: 'Reçu au dépôt', picked_up: 'Colis enlevé', departed: 'En route',
  arrived: 'Livreur arrivé', delivered: 'Livré', payment_released: 'Paiement libéré',
};
const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default function DeliveryTracking({ shipmentId, escrowId, onClose }: { shipmentId?: string; escrowId?: string; onClose: () => void }) {
  const [tr, setTr] = useState<Trace | null>(null);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Résolution : par id colis (suivi profil) OU par escrow (suivi ouvert depuis une commande boutique/Eat).
  const query = shipmentId ? `id=${encodeURIComponent(shipmentId)}` : escrowId ? `escrow=${encodeURIComponent(escrowId)}` : '';

  const load = async () => {
    if (!query) { setErr('not_found'); return; }
    try {
      const d = await fetch(`/api/transport/shipments?${query}`, { cache: 'no-store' }).then((r) => r.json());
      if (d?.shipment) setTr(d as Trace); else setErr(d?.error || 'not_found');
    } catch { setErr('network'); }
  };
  useEffect(() => {
    load();
    timer.current = setInterval(load, 10000); // suivi vivant
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const sh = tr?.shipment;
  const status = sh ? (STATUS_FR[sh.status] || sh.status) : '…';
  const delivered = sh?.status === 'delivered';
  const origin: Pt | null = sh ? { lat: sh.o_lat, lng: sh.o_lng } : null;
  const dest: Pt | null = sh ? { lat: sh.d_lat, lng: sh.d_lng } : null;
  // Position RÉELLE du colis : dernier ping (cur_lat/lng) ; sinon dérivée du statut.
  const colis: Pt | null = !sh ? null
    : (sh.cur_lat != null && sh.cur_lng != null) ? { lat: sh.cur_lat, lng: sh.cur_lng }
    : delivered ? dest
    : sh.status === 'in_transit' ? { lat: (sh.o_lat + sh.d_lat) / 2, lng: (sh.o_lng + sh.d_lng) / 2 }
    : origin;
  // Timeline = étapes réelles (on masque les pings GPS 'position').
  const steps = (tr?.events || []).filter((e) => e.type !== 'position');
  const isRetrait = sh?.mode === 'retrait';

  return (
    <div className="fixed inset-0 z-[80] bg-[#0e0e12] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-white/8" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onClose} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ChevronLeft className="w-6 h-6" /></button>
        <Bike className="w-5 h-5 text-amber-300" />
        <h1 className="text-[16px] font-semibold text-white/95 truncate">Suivi · {sh?.product_label || 'Colis'}</h1>
        <span className="ml-auto text-[11px] font-mono text-white/40">{sh?.tracking || ''}</span>
      </header>

      {/* Carte : dépôt (origine) → toi (dest) + position réelle du colis */}
      <div className="flex-1 min-h-0 relative">
        {origin && dest && (
          <DriveMap
            center={colis || dest}
            markers={[
              { id: 'origin', lat: origin.lat, lng: origin.lng, kind: 'pickup' as const, label: `🏪 ${sh!.o_label}` },
              { id: 'dest', lat: dest.lat, lng: dest.lng, kind: 'me' as const, label: `🏁 ${sh!.d_label}` },
              ...(colis && !delivered ? [{ id: 'colis', lat: colis.lat, lng: colis.lng, kind: 'driver' as const, label: '📦 Colis' }] : []),
            ]}
            className="absolute inset-0"
          />
        )}
        {!tr && !err && <div className="absolute inset-0 grid place-items-center text-white/50"><Loader2 className="w-6 h-6 animate-spin" /></div>}
        {err && <div className="absolute inset-0 grid place-items-center text-white/50 text-[13px]">Colis introuvable.</div>}
      </div>

      {/* Statut + chaîne de garde réelle */}
      <div className="shrink-0 max-h-[46%] overflow-y-auto p-4 pb-6 border-t border-white/8 bg-[#0e0e12]">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[16px] font-bold text-white">{status}</p>
          {!delivered && sh && <Loader2 className="w-4 h-4 animate-spin text-amber-300" />}
        </div>
        <p className="text-[12px] text-white/50 mb-4 flex items-center gap-1"><MapPin className="w-3 h-3" />{sh?.o_label} → {sh?.d_label}</p>

        {/* Code de réception (livraison = 4 derniers chiffres de TON tél ; retrait = code dédié). */}
        {!delivered && sh && (
          <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-3">
            {isRetrait
              ? <p className="text-[13px] text-emerald-200">🏪 Code de retrait : <b className="font-mono tracking-widest text-emerald-100">{sh.pickup_code || '— (visible dans Mes colis)'}</b> — montre-le au point de retrait.</p>
              : <p className="text-[13px] text-emerald-200">📲 À la livraison, donne au livreur les <b>4 derniers chiffres de ton téléphone</b> pour confirmer la réception.</p>}
          </div>
        )}

        {/* Timeline chaîne de garde */}
        <div className="space-y-0">
          {steps.map((e, i) => {
            const meta = e.meta ? (() => { try { return JSON.parse(e.meta); } catch { return {}; } })() : {};
            const last = i === steps.length - 1;
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={'w-2.5 h-2.5 rounded-full mt-1.5 ' + (last ? 'bg-amber-400' : 'bg-emerald-400')} />
                  {!last && <div className="w-px flex-1 bg-white/12 my-0.5" />}
                </div>
                <div className="pb-3">
                  <p className="text-[13.5px] text-white/90">{EVENT_FR[e.type] || e.type} {meta.photo ? <span className="text-white/40">· 📷</span> : null}</p>
                  <p className="text-[11px] text-white/40">{hhmm(e.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {delivered && (
          <div className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-emerald-300"><Check className="w-4 h-4" /> Colis remis — paiement libéré.</div>
        )}
      </div>
    </div>
  );
}
