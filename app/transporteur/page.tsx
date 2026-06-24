'use client';

/**
 * Talk2Me — Acheminement relais (Brique B), UI testable.
 * Villes Mada en presets (pas de carte requise). Déclarer un trajet, créer un colis,
 * suivre l'itinéraire et exécuter les remises aux 4 chiffres. Doctrine MODULE_DISTRIBUTION.md §10.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2, Truck, Package, MapPin, Navigation } from 'lucide-react';

import { queuedPost, startOutboxAutoFlush, outboxCount } from '@/lib/client/offline-queue';

const ShipmentMap = dynamic(() => import('@/components/transport/ShipmentMap'), { ssr: false });

const CITIES: Record<string, { lat: number; lng: number }> = {
  'Antananarivo': { lat: -18.8792, lng: 47.5079 },
  'Toamasina': { lat: -18.1492, lng: 49.4023 },
  'Mahajanga': { lat: -15.7167, lng: 46.3167 },
  'Fianarantsoa': { lat: -21.4536, lng: 47.0858 },
  'Toliara': { lat: -23.3568, lng: 43.6671 },
  'Antsiranana': { lat: -12.2787, lng: 49.2917 },
  'Morondava': { lat: -20.2833, lng: 44.2833 },
};
const CITY_NAMES = Object.keys(CITIES);
const MODES = [['pied', 'À pied'], ['velo', 'Vélo'], ['moto', 'Moto'], ['scooter', 'Scooter'], ['voiture', 'Voiture'], ['taxibrousse', 'Taxi-brousse']];

type Json = Record<string, unknown>;
const post = (url: string, body: Json) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const getJ = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

export default function Transporteur() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [tab, setTab] = useState<'colis' | 'trajets'>('colis');
  const [trips, setTrips] = useState<Json[]>([]);
  const [ships, setShips] = useState<Json[]>([]);
  const [sel, setSel] = useState<Json | null>(null);     // trace { shipment, legs, events }
  const [cands, setCands] = useState<Json[]>([]);
  const [contacts, setContacts] = useState<Json[]>([]);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [popupClosed, setPopupClosed] = useState('');
  const [offline, setOffline] = useState(0);
  const [codeInput, setCodeInput] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // forms
  const [tFrom, setTFrom] = useState('Toamasina'); const [tTo, setTTo] = useState('Antananarivo'); const [tMode, setTMode] = useState('taxibrousse'); const [tDur, setTDur] = useState('480');
  const [sLabel, setSLabel] = useState(''); const [sFrom, setSFrom] = useState('Toamasina'); const [sTo, setSTo] = useState('Antananarivo'); const [sBuyer, setSBuyer] = useState('');
  const [nextPhone, setNextPhone] = useState('');

  const reload = useCallback(() => {
    getJ('/api/transport/trips').then((d) => d?.trips && setTrips(d.trips)).catch(() => {});
    getJ('/api/transport/shipments').then((d) => d?.shipments && setShips(d.shipments)).catch(() => {});
  }, []);
  useEffect(() => {
    getJ('/api/auth/me').then((d) => setMe(d?.user || null)).catch(() => {});
    getJ('/api/transport/mycode').then((d) => setMyCode(d?.code || null)).catch(() => {});
    startOutboxAutoFlush();
    reload();
    const t = setInterval(() => setOffline(outboxCount()), 5000);
    return () => clearInterval(t);
  }, [reload]);

  const openShip = (id: string) => {
    getJ('/api/transport/shipments?id=' + id).then((d) => { if (d?.shipment) { setSel(d); setMsg(''); } });
    getJ('/api/transport/contacts?shipment_id=' + id).then((d) => setContacts(d?.contacts || [])).catch(() => {});
  };

  // Polling : suivi vivant (approche, étapes) → les pop-up s'ouvrent tout seuls.
  useEffect(() => {
    const id = (sel?.shipment as Json | undefined)?.id as string | undefined;
    if (!id) return;
    const t = setInterval(() => getJ('/api/transport/shipments?id=' + id).then((d) => { if (d?.shipment) setSel(d); }).catch(() => {}), 12000);
    return () => clearInterval(t);
  }, [sel]);

  const declareTrip = async () => {
    setBusy(true); setMsg('');
    const o = CITIES[tFrom], d = CITIES[tTo];
    const r = await post('/api/transport/trips', { o: { ...o, label: tFrom }, d: { ...d, label: tTo }, depart_at: Date.now(), duration_min: Number(tDur) || 480, mode: tMode });
    setBusy(false);
    if (r?.trips) { setTrips(r.trips); setMsg('Trajet déclaré ✓'); } else setMsg('Erreur: ' + (r?.error || '?'));
  };
  const createShip = async () => {
    if (!sLabel.trim()) { setMsg('Nom du produit requis.'); return; }
    setBusy(true); setMsg('');
    const o = CITIES[sFrom], d = CITIES[sTo];
    const r = await post('/api/transport/shipments', { product_label: sLabel, buyer_id: sBuyer.trim() || undefined, o: { ...o, label: sFrom }, d: { ...d, label: sTo } });
    setBusy(false);
    if (r?.tracking) { setMsg('Colis créé ✓ — n° ' + r.tracking); setSLabel(''); reload(); openShip(r.id as string); } else setMsg('Erreur: ' + (r?.error || '?'));
  };

  const sh = sel?.shipment as Json | undefined;
  const legs = (sel?.legs as Json[]) || [];
  const events = (sel?.events as Json[]) || [];
  const activeLeg = legs.find((l) => l.status !== 'done');
  const isCustodian = !!(me && sh && sh.custody_user_id === me.id);
  const isActiveCarrier = !!(me && activeLeg && activeLeg.carrier_id === me.id);
  const isBuyer = !!(me && sh && sh.buyer_id === me.id);
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const pt = (lat: unknown, lng: unknown, label?: string) => (num(lat) !== undefined && num(lng) !== undefined ? { lat: num(lat)!, lng: num(lng)!, label } : null);
  const shareGeo = (action: 'share_pos' | 'set_dropoff') => navigator.geolocation?.getCurrentPosition(
    (p) => act(action, { lat: p.coords.latitude, lng: p.coords.longitude }),
    () => setMsg('Géoloc refusée.'), { enableHighAccuracy: true });

  // POP-UP de remise (façon Uber) : s'ouvre tout seul selon le rôle + l'état du tronçon.
  const legStatus = activeLeg?.status as string | undefined;
  const approaching = !!(activeLeg && (activeLeg as Json).approaching);
  let popup: 'show_code' | 'enter_code' | null = null;
  if (sh && sh.status !== 'delivered') {
    if (legStatus === 'assigned') { popup = isActiveCarrier ? 'enter_code' : isCustodian ? 'show_code' : null; }
    else if (legStatus === 'enroute' && approaching) { popup = isActiveCarrier ? 'enter_code' : isBuyer ? 'show_code' : null; }
  }
  const popupKey = popup ? `${popup}:${activeLeg?.id}:${legStatus}` : '';

  const act = async (action: string, extra: Json = {}) => {
    if (!sh) return; setBusy(true); setMsg('');
    const r = await queuedPost('/api/transport/action', { shipment_id: sh.id, action, ...extra });
    setBusy(false);
    if (r.queued) { setMsg('📴 Hors réseau — action enregistrée, synchro au retour du réseau.'); setOffline(outboxCount()); return; }
    const d = r.data as Json | null;
    if (d?.shipment) { setSel(d); reload(); } else setMsg('✗ ' + ((d?.error as string) || 'erreur'));
  };
  const ask4 = (label: string) => (window.prompt(label + '\n(4 derniers chiffres du téléphone)') || '').trim();
  const findCarriers = async () => { if (!sh) return; const d = await getJ('/api/transport/match?shipment_id=' + sh.id); setCands(d?.candidates || []); if (!d?.candidates?.length) setMsg('Aucun porteur sur ce trajet pour l’instant.'); };
  const ping = () => navigator.geolocation?.getCurrentPosition(
    (p) => act('ping', { lat: p.coords.latitude, lng: p.coords.longitude }),
    () => setMsg('Géoloc refusée.'), { enableHighAccuracy: true });

  return (
    <div className="min-h-screen bg-[#0e0e14] text-white px-4 py-5 max-w-xl mx-auto">
      <button onClick={() => router.back()} className="text-white/50 text-sm mb-3">← Retour</button>
      <h1 className="text-xl font-bold flex items-center gap-2 mb-3"><Truck className="w-5 h-5 text-amber-300" /> Acheminement</h1>

      <div className="flex gap-2 mb-4">
        {(['colis', 'trajets'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={'flex-1 py-2 rounded-xl text-[13px] font-medium ' + (tab === t ? 'bg-amber-500 text-black' : 'bg-white/[0.05] text-white/70')}>
            {t === 'colis' ? 'Colis' : 'Mes trajets'}
          </button>
        ))}
      </div>

      {msg && <p className="text-[13px] text-amber-200 mb-3">{msg}</p>}

      {tab === 'trajets' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
            <div className="text-[13px] font-semibold">Déclarer un trajet (je porte des colis sur ma route)</div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="De" v={tFrom} set={setTFrom} opts={CITY_NAMES} />
              <Select label="Vers" v={tTo} set={setTTo} opts={CITY_NAMES} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Moyen" v={tMode} set={setTMode} opts={MODES.map((m) => m[0])} labels={Object.fromEntries(MODES)} />
              <Field label="Durée (min)" v={tDur} set={setTDur} type="number" />
            </div>
            <button onClick={declareTrip} disabled={busy} className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-semibold text-[13px] disabled:opacity-50">{busy ? '…' : 'Déclarer'}</button>
            <p className="text-[11px] text-white/40">Porteur CNI-vérifié requis. (Pas encore vérifié → Profil → Devenir transporteur.)</p>
          </div>
          {trips.map((t) => (
            <div key={t.id as string} className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-[13px] flex items-center justify-between">
              <span>{t.o_label as string} → {t.d_label as string} · {t.mode as string}</span>
              <span className={'text-[11px] ' + (t.status === 'open' ? 'text-emerald-300' : 'text-white/40')}>{t.status as string}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'colis' && !sel && (
        <div className="space-y-4">
          <button onClick={async () => { setBusy(true); setMsg('Démo en cours…'); const r = await post('/api/transport/demo', {}); setBusy(false); if (r?.shipment_id) { setMsg('Démo créée ✓ — regarde l’itinéraire + tes notifications.'); reload(); openShip(r.shipment_id as string); } else setMsg('Erreur démo: ' + (r?.error || '?')); }}
            disabled={busy} className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-amber-500 text-black font-bold text-[14px] disabled:opacity-50">
            ▶️ Démo bout-en-bout (article → relais → paiement)
          </button>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
            <div className="text-[13px] font-semibold">Faire acheminer un colis</div>
            <Field label="Produit" v={sLabel} set={setSLabel} placeholder="T-shirt" />
            <div className="grid grid-cols-2 gap-2">
              <Select label="De (vendeur)" v={sFrom} set={setSFrom} opts={CITY_NAMES} />
              <Select label="Vers (client)" v={sTo} set={setSTo} opts={CITY_NAMES} />
            </div>
            <Field label="ID client (optionnel, pour test)" v={sBuyer} set={setSBuyer} placeholder="user_id de l'acheteur" />
            <button onClick={createShip} disabled={busy} className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-semibold text-[13px] disabled:opacity-50">{busy ? '…' : 'Créer le bon de transport'}</button>
          </div>
          {ships.map((s) => (
            <button key={s.id as string} onClick={() => openShip(s.id as string)} className="w-full text-left rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-amber-300" />{s.product_label as string || 'Colis'}</span>
                <span className="text-[11px] font-mono text-white/45">{s.tracking as string}</span>
              </div>
              <div className="text-[11px] text-white/50 mt-0.5">{s.o_label as string} → {s.d_label as string} · {statusFr(s.status as string)}</div>
            </button>
          ))}
        </div>
      )}

      {/* DÉTAIL / SUIVI */}
      {tab === 'colis' && sel && sh && (
        <div className="space-y-4">
          <button onClick={() => setSel(null)} className="text-white/50 text-[13px]">← Mes colis</button>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{sh.product_label as string || 'Colis'}</div>
              <div className="text-[12px] font-mono text-amber-300">{sh.tracking as string}</div>
            </div>
            <div className="text-[12px] text-white/55 mt-1">{sh.o_label as string} → {sh.d_label as string}</div>
            <div className="text-[12px] mt-1">État : <b>{statusFr(sh.status as string)}</b></div>
            {sh.alert ? <div className="mt-2 text-[12px] text-red-200 bg-red-500/15 border border-red-400/30 rounded-lg px-2.5 py-1.5">⚠️ {sh.alert === 'panne' ? 'Panne signalée par le porteur' : sh.alert === 'manquement' ? 'Manquement : porteur bloqué sans réponse — dénoncé au responsable' : String(sh.alert)}</div> : null}
          </div>

          {/* CARTE : départ, colis (rendez-vous), livraison */}
          <ShipmentMap
            origin={pt(sh.o_lat, sh.o_lng, sh.o_label as string)}
            dest={pt(sh.d_lat, sh.d_lng, sh.d_label as string)}
            colis={pt(sh.cur_lat, sh.cur_lng) || pt(sh.o_lat, sh.o_lng)}
            rendezvous={!!activeLeg && activeLeg.status === 'assigned'}
          />

          {/* Boutons position : détenteur (rendez-vous) + acheteur (livraison) */}
          <div className="flex flex-col gap-2">
            {isCustodian && sh.status !== 'delivered' && (
              <button onClick={() => shareGeo('share_pos')} className="w-full py-2.5 rounded-xl bg-white/[0.07] text-white text-[13px] font-medium"><MapPin className="w-4 h-4 inline mr-1" /> Partager ma position (point de rendez-vous)</button>
            )}
            {isBuyer && sh.status !== 'delivered' && (
              <button onClick={() => shareGeo('set_dropoff')} className="w-full py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-[13px] font-medium"><MapPin className="w-4 h-4 inline mr-1" /> Donner ma position de livraison</button>
            )}
            {!!activeLeg && activeLeg.status === 'assigned' && isActiveCarrier && (
              <div className="text-[12px] text-amber-200/80 text-center">📍 Va au point de rendez-vous (📦 sur la carte) puis fais la remise (4 chiffres).</div>
            )}
          </div>

          {/* Itinéraire (événements) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><Navigation className="w-4 h-4 text-amber-300" /> Itinéraire du colis</div>
            <div className="space-y-1.5">
              {events.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-white/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="flex-1">{eventFr(e.type as string)}{e.lat ? <span className="text-white/35"> · 📍</span> : null}</span>
                  <span className="text-white/35">{new Date(e.created_at as number).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ACTIONS contextuelles */}
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-4 space-y-2">
            <div className="text-[12px] text-white/55 mb-1">Actions</div>

            {/* Watchdog : je suis le porteur et le système m'a détecté à l'arrêt */}
            {isActiveCarrier && activeLeg && (activeLeg as Json).stalled ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 space-y-2">
                <div className="text-[13px] text-red-100 font-medium">Vous semblez à l’arrêt. Un problème ?</div>
                <div className="flex gap-2">
                  <button onClick={() => act('status_reply', { kind: 'panne' })} className="flex-1 py-2 rounded-lg bg-red-500 text-white text-[12px] font-semibold">🛠️ Panne</button>
                  <button onClick={() => act('status_reply', { kind: 'pause' })} className="flex-1 py-2 rounded-lg bg-white/10 text-white text-[12px]">☕ Pause</button>
                  <button onClick={() => act('status_reply', { kind: 'ras' })} className="flex-1 py-2 rounded-lg bg-white/10 text-white text-[12px]">👍 RAS</button>
                </div>
              </div>
            ) : null}

            {/* Pas de tronçon actif + je détiens → désigner / trouver le porteur suivant */}
            {!activeLeg && isCustodian && sh.status !== 'delivered' && (
              <>
                {/* Désignation DIRECTE par numéro (porteur rencontré au rendez-vous) */}
                <div className="rounded-xl bg-white/[0.05] p-2.5 space-y-2">
                  <div className="text-[12px] text-white/70">Passer le relais : entre le numéro du porteur suivant</div>
                  <div className="flex gap-2">
                    <input value={nextPhone} onChange={(e) => setNextPhone(e.target.value)} inputMode="tel" placeholder="032 ..." className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-amber-400/50" />
                    <button onClick={() => { if (nextPhone.trim()) act('assign_phone', { phone: nextPhone.trim() }).then(() => setNextPhone('')); }} className="px-3 py-2 rounded-lg bg-amber-500 text-black font-semibold text-[12px]">Désigner</button>
                  </div>
                  <div className="text-[11px] text-white/35">Le porteur doit être inscrit + CNI validée. Tu confirmeras la remise par ses 4 derniers chiffres.</div>
                </div>
                <div className="text-[11px] text-white/40 text-center">— ou —</div>
                <button onClick={findCarriers} disabled={busy} className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-semibold text-[13px]">🔎 Trouver un porteur (trajets déclarés)</button>
                {cands.map((c) => {
                  const t = c.trip as Json;
                  return (
                    <div key={t.id as string} className="flex items-center justify-between rounded-xl bg-white/[0.05] px-3 py-2 text-[12px]">
                      <span>{t.o_label as string} → {t.d_label as string} · {t.mode as string}</span>
                      <button onClick={() => act('assign', { trip_id: t.id })} className="px-2.5 py-1 rounded-lg bg-emerald-500 text-black font-semibold">Assigner</button>
                    </div>
                  );
                })}
              </>
            )}

            {/* Tronçon assigné + je détiens → remettre au porteur (4 chiffres) */}
            {activeLeg && activeLeg.status === 'assigned' && isCustodian && (
              <button onClick={() => { const c = ask4('Remettre le colis au porteur'); if (c) act('pickup', { last4: c }); }} className="w-full py-2.5 rounded-xl bg-emerald-500 text-black font-semibold text-[13px]">📦 Remettre au porteur (4 chiffres)</button>
            )}

            {/* Je suis le porteur, colis pris → le colis part */}
            {isActiveCarrier && activeLeg!.status === 'picked' && (
              <button onClick={() => act('depart', { duration_min: 480 })} className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-semibold text-[13px]">🚚 Le colis part</button>
            )}

            {/* Je suis le porteur, en route → position / arrivée / livraison */}
            {isActiveCarrier && activeLeg!.status === 'enroute' && (
              <>
                <button onClick={ping} className="w-full py-2.5 rounded-xl bg-white/[0.08] text-white font-medium text-[13px]"><MapPin className="w-4 h-4 inline mr-1" /> Envoyer ma position</button>
                <button onClick={() => act('arrived')} className="w-full py-2.5 rounded-xl bg-white/[0.08] text-white font-medium text-[13px]">🏁 Fin de mon tronçon (je garde jusqu’au suivant)</button>
                <button onClick={() => { const c = ask4('Livrer au CLIENT final'); if (c) act('deliver', { last4: c }); }} className="w-full py-2.5 rounded-xl bg-emerald-500 text-black font-semibold text-[13px]">✅ Livrer au client (4 chiffres)</button>
              </>
            )}

            {sh.status === 'delivered' && <div className="text-emerald-300 text-[13px] text-center py-1">Livré ✓</div>}
            {!activeLeg && !isCustodian && sh.status !== 'delivered' && <div className="text-white/40 text-[12px] text-center py-1">En attente du détenteur du colis.</div>}
          </div>

          {/* Contacts cloisonnés (voisins de chaîne) — sans numéro, ping masqué */}
          {contacts.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
              <div className="text-[12px] text-white/55">Joindre (sans numéro — notification)</div>
              {contacts.map((c) => (
                <div key={c.user_id as string} className="flex items-center justify-between rounded-xl bg-white/[0.05] px-3 py-2 text-[13px]">
                  <span>{c.label as string} <span className="text-white/40 text-[11px]">· {c.relation as string}</span></span>
                  <button onClick={() => post('/api/transport/contacts', { shipment_id: sh.id, to: c.user_id }).then((r) => setMsg(r?.ok ? 'Notifié ✓' : '✗ ' + (r?.error || '')))}
                    className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-[12px]">Joindre</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* POP-UP de remise (façon Uber) — s'ouvre tout seul */}
      {sel && sh && popup && popupClosed !== popupKey && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setPopupClosed(popupKey)}>
          <div className="w-full max-w-sm rounded-3xl bg-[#15151c] border border-white/15 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            {popup === 'show_code' ? (
              <>
                <div className="text-[15px] font-semibold text-white">{legStatus === 'enroute' ? '🛵 Ton colis arrive' : '📦 Remets le colis au porteur'}</div>
                <div className="text-[12px] text-white/60 mt-1">{legStatus === 'enroute' ? 'Donne ce code au livreur à la remise.' : 'Donne ce code au porteur pour qu’il prenne le colis.'}</div>
                <div className="my-5 text-5xl font-black tracking-[0.3em] text-amber-300">{myCode || '????'}</div>
                {!myCode && <div className="text-[11px] text-red-300 mb-3">Ajoute ton numéro de téléphone à ton profil pour avoir un code.</div>}
                <button onClick={() => setPopupClosed(popupKey)} className="w-full py-2.5 rounded-xl bg-white/10 text-white text-[13px]">OK</button>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold text-white">{legStatus === 'enroute' ? '✅ Livraison au client' : '📦 Récupérer le colis'}</div>
                <div className="text-[12px] text-white/60 mt-1">Demande {legStatus === 'enroute' ? 'au client' : 'au détenteur'} son code (4 chiffres) et saisis-le.</div>
                <input value={codeInput} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="••••"
                  className="my-4 w-40 mx-auto block text-center text-3xl tracking-[0.4em] bg-white/[0.06] border border-white/15 rounded-xl py-3 outline-none focus:border-amber-400/60" />
                <div className="flex gap-2">
                  <button onClick={() => setPopupClosed(popupKey)} className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-[13px]">Plus tard</button>
                  <button onClick={() => { if (codeInput.length === 4) { act(legStatus === 'enroute' ? 'deliver' : 'pickup', { last4: codeInput }); setCodeInput(''); } }}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-black font-semibold text-[13px]">Valider</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {offline > 0 && (
        <div className="fixed bottom-3 inset-x-3 z-40 text-center text-[12px] text-amber-200 bg-amber-900/60 border border-amber-500/30 rounded-xl py-2">📴 {offline} action(s) hors-réseau en attente — synchro auto au retour du réseau</div>
      )}
    </div>
  );
}

function statusFr(s: string) { return ({ created: 'Créé', in_transit: 'En acheminement', delivered: 'Livré', cancelled: 'Annulé' } as Record<string, string>)[s] || s; }
function eventFr(t: string) { return ({ created: 'Bon de transport créé', leg_assigned: 'Porteur assigné', picked_up: 'Colis pris en charge', departed: 'Le colis est parti', position: 'Position mise à jour', arrived: 'Arrivé (fin de tronçon)', delivered: 'Livré au client', exception: '⚠️ Anomalie détectée', carrier_ok: 'Porteur a confirmé (RAS)', contact: 'Mise en relation', denounced: '🚨 Manquement dénoncé au responsable', payment_held: '🔒 Paiement bloqué (escrow simulé)', payment_released: '💰 Paiement libéré (simulé)', dropoff_set: '📍 Client a donné sa position de livraison' } as Record<string, string>)[t] || t; }

function Field({ label, v, set, type = 'text', placeholder }: { label: string; v: string; set: (s: string) => void; type?: string; placeholder?: string }) {
  return (<label className="block"><span className="text-[12px] text-white/60">{label}</span>
    <input value={v} onChange={(e) => set(e.target.value)} type={type} placeholder={placeholder} className="mt-1 w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-[14px] outline-none focus:border-amber-400/50" /></label>);
}
function Select({ label, v, set, opts, labels }: { label: string; v: string; set: (s: string) => void; opts: string[]; labels?: Record<string, string> }) {
  return (<label className="block"><span className="text-[12px] text-white/60">{label}</span>
    <select value={v} onChange={(e) => set(e.target.value)} className="mt-1 w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-[14px] outline-none focus:border-amber-400/50">
      {opts.map((o) => <option key={o} value={o} className="bg-[#1a1a22]">{labels?.[o] || o}</option>)}
    </select></label>);
}
