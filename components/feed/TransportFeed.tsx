'use client';

/**
 * Talk2Me — Onglet TRANSPORTEUR (Pascal 2026-06-10). Demander à transporter /
 * déménager un objet (à pied aussi), livrer un colis, ou l'emmener aux ENCOMBRANTS.
 * Liste des demandes ouvertes (pour les transporteurs). Matching/escrow = brique suivante.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Truck, Package, Sofa, Trash2, Camera, Phone, Video } from '@/lib/icons';
import { formatMoney } from '@/lib/money';
import CardDevButton from '@/components/dev/CardDevButton';

// 'move' | 'encombrants' = vrais kinds du board (courses P2P). 'parcel' = SEULEMENT une carte-raccourci
// qui reroute vers /envoyer-colis (rail escrow shipments) — jamais posté sur ce board, jamais mis dans `kind` d'état.
type Kind = 'move' | 'parcel' | 'encombrants';
interface Req { id: string; requester_id: string; kind: string; title: string; photo_url: string | null; from_text: string | null; to_text: string | null; when_text: string | null; budget_cents: number | null; requester_name: string | null; offers_count?: number; created_at: number }
interface Offer { id: string; request_id: string; transporter_id: string; price_cents: number; note: string | null; status: string; transporter_name: string | null }
interface Course { id: string; requester_id: string; transporter_id: string | null; kind: string; title: string; from_text: string | null; to_text: string | null; when_text: string | null; status: string; progress: string | null; agreed_price_cents: number | null; escrow_id: string | null; handoff_token: string | null; requester_name: string | null; transporter_name: string | null }

const STEPS: { k: string; label: string }[] = [
  { k: 'assigned', label: 'Accepté' },
  { k: 'enroute', label: 'En route' },
  { k: 'picked', label: 'Récupéré' },
  { k: 'delivered', label: 'Livré' },
];
const STEP_KEYS = STEPS.map((s) => s.k);

const TYPES: { k: Kind; icon: React.ReactNode; label: string; hint: string }[] = [
  { k: 'move', icon: <Sofa className="w-5 h-5" />, label: 'Déménager un truc', hint: 'Meuble, électro, carton…' },
  { k: 'parcel', icon: <Package className="w-5 h-5" />, label: 'Livrer un colis', hint: 'Un point à un autre' },
  { k: 'encombrants', icon: <Trash2 className="w-5 h-5" />, label: 'Aux encombrants', hint: 'Emmener au point de collecte' },
];

const SLOTS = ['Matin', 'Après-midi', 'Soir'];

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WEEKS: { v: string; label: string }[] = [
  { v: '1', label: '1er' }, { v: '2', label: '2e' }, { v: '3', label: '3e' }, { v: '4', label: '4e' }, { v: 'last', label: 'dernier' },
];

interface Schedule { freq: 'weekly' | 'monthly'; weekday: number; week: string; city_label: string }

// Phrase lisible d'une règle de collecte ("le dernier vendredi du mois", "chaque mardi").
function ruleText(s: Schedule): string {
  if (s.freq === 'weekly') return `chaque ${WEEKDAYS[s.weekday]}`;
  const w = WEEKS.find((x) => x.v === s.week)?.label || 'dernier';
  return `le ${w} ${WEEKDAYS[s.weekday]} du mois`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function TransportFeed({ onBack }: { onBack?: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [title, setTitle] = useState('');
  const [fromT, setFromT] = useState('');
  const [toT, setToT] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  // Encombrants : calendrier PAR VILLE (jamais imposé). On regarde si la ville est connue.
  const [city, setCity] = useState('');
  const [sched, setSched] = useState<Schedule | null>(null);
  const [schedNext, setSchedNext] = useState('');
  const [schedLoading, setSchedLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [programming, setProgramming] = useState(false);
  const [pFreq, setPFreq] = useState<'weekly' | 'monthly'>('monthly');
  const [pWeekday, setPWeekday] = useState(5); // vendredi par défaut
  const [pWeek, setPWeek] = useState('last');
  const [savingSched, setSavingSched] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState('');
  // Transporteur : proposer un prix
  const [offerFor, setOfferFor] = useState('');     // id de la demande dont le form d'offre est ouvert
  const [offerPrice, setOfferPrice] = useState('');
  const [offerNote, setOfferNote] = useState('');
  const [offerSending, setOfferSending] = useState(false);
  const [offerErr, setOfferErr] = useState<'' | 'cni' | 'vehicle' | 'other'>('');  // gate « prendre une mission » (4b-3)
  const [sentOffers, setSentOffers] = useState<Record<string, number>>({}); // request_id → prix proposé
  // Demandeur : voir les offres reçues
  const [viewOffersFor, setViewOffersFor] = useState('');
  const [offersList, setOffersList] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [accepting, setAccepting] = useState('');
  // Suivi de course
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseBusy, setCourseBusy] = useState('');
  const [handoffCode, setHandoffCode] = useState(''); // saisie code par le client
  const [nfcMsg, setNfcMsg] = useState('');
  // Fil de course (Talk SMS) : chat livreur ↔ client lié à LA course
  const [chatCourse, setChatCourse] = useState<{ id: string; title: string; peer: string } | null>(null);
  const [chatMsgs, setChatMsgs] = useState<{ id: string; sender_id: string; body: string; sender_name: string | null }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch('/api/transport', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) { setReqs(d.requests || []); setCourses(d.courses || []); if (d.me) setMe(d.me); } }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  // Cherche le calendrier connu de la ville (débounce). Si trouvé → pré-remplit la date.
  useEffect(() => {
    if (kind !== 'encombrants') return;
    const c = city.trim();
    if (!c) { setSched(null); setSchedNext(''); return; }
    setSchedLoading(true);
    const id = setTimeout(() => {
      fetch('/api/encombrants?city=' + encodeURIComponent(c), { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (d?.schedule) { setSched(d.schedule); setSchedNext(d.next || ''); if (d.next) setDate(d.next); }
          else { setSched(null); setSchedNext(''); }
        })
        .catch(() => {})
        .finally(() => setSchedLoading(false));
    }, 450);
    return () => clearTimeout(id);
  }, [city, kind]);

  // Détecte la ville via géoloc → reverse-geocode Nominatim (sans clé).
  const detectCity = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${latitude}&lon=${longitude}`, { headers: { 'Accept-Language': 'fr' } }).then((x) => x.json());
        const a = r?.address || {};
        const c = a.city || a.town || a.village || a.municipality || a.county || '';
        if (c) setCity(c);
      } finally { setGeoLoading(false); }
    }, () => setGeoLoading(false), { enableHighAccuracy: false, timeout: 8000 });
  };

  // Programme (ou corrige) le calendrier encombrants de la ville saisie.
  const saveSchedule = async () => {
    if (!city.trim() || savingSched) return;
    setSavingSched(true);
    try {
      const r = await fetch('/api/encombrants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, freq: pFreq, weekday: pWeekday, week: pWeek }),
      }).then((x) => x.json());
      if (r?.schedule) { setSched(r.schedule); setSchedNext(r.next || ''); if (r.next) setDate(r.next); setProgramming(false); }
    } finally { setSavingSched(false); }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { const fd = new FormData(); fd.append('file', f); const up = await fetch('/api/upload', { method: 'POST', body: fd }).then((r) => r.json()); if (up?.url) setPhoto(up.url); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const reset = () => { setKind(null); setTitle(''); setFromT(''); setToT(''); setDate(''); setSlot(''); setPhoto(null); setCity(''); setSched(null); setSchedNext(''); setProgramming(false); };

  const publish = async () => {
    if (!title.trim() || posting) return;
    setPosting(true);
    try {
      const r = await fetch('/api/transport', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, photo_url: photo, from_text: fromT, to_text: toT, when_text: [fmtDate(date), slot].filter(Boolean).join(' · ') }),
      });
      if (r.ok) { reset(); await load(); }
    } finally { setPosting(false); }
  };

  const eur = (c: number) => formatMoney(c);

  // Board : mes demandes (je vois/accepte les offres) vs demandes des AUTRES à transporter,
  // filtrées par l'onglet sélectionné (déménager/encombrants). On ne se transporte pas soi-même.
  const isMine = (r: Req) => !!(me && r.requester_id === me);
  const myReqs = reqs.filter(isMine);
  const boardReqs = reqs.filter((r) => !isMine(r) && (kind == null || r.kind === kind));

  // Une ligne de demande (réutilisée par « Mes demandes » et « Demandes à transporter »).
  const renderReq = (r: Req) => {
    const mine = me && r.requester_id === me;
    const sent = sentOffers[r.id];
    return (
      <div key={r.id} className="relative rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] p-2.5">
        {r.id && <CardDevButton cardId={r.id} className="absolute right-1.5 top-1.5 z-40" />}
        <div className="flex gap-3">
          {r.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
          ) : (
            <span className="w-16 h-16 rounded-xl bg-[var(--t2m-wash)] grid place-items-center text-[var(--t2m-ink-3)] shrink-0"><Truck className="w-6 h-6" /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-[var(--t2m-ink)] truncate">{r.title}{mine && <span className="ml-1.5 text-[10px] font-medium text-[var(--t2m-ink-3)] align-middle">· ta demande</span>}</p>
            <p className="text-[12px] text-[var(--t2m-ink-3)] truncate">{[r.from_text, r.to_text].filter(Boolean).join(' → ') || '—'}</p>
            <div className="flex items-center gap-2 mt-1">
              {r.when_text && <span className="text-[11px] text-[var(--t2m-ink-3)]">{r.when_text}</span>}
              <span className="text-[11px] text-[var(--t2m-ink-3)]">Prix à proposer</span>
            </div>
          </div>
          {/* Action : voir les offres (mes demandes) OU proposer un prix (les autres) */}
          {mine ? (
            <button onClick={() => toggleReceivedOffers(r.id)} className="self-center px-3 py-2 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink)] text-[12px] font-semibold shrink-0 leading-tight">
              {r.offers_count ? `${r.offers_count} offre${r.offers_count > 1 ? 's' : ''}` : 'Aucune\noffre'}
            </button>
          ) : sent != null ? (
            <span className="self-center px-3 py-2 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] text-[12px] font-semibold shrink-0 leading-tight text-center">Offre<br />{eur(sent)}</span>
          ) : (
            <button onClick={() => { setOfferFor(offerFor === r.id ? '' : r.id); setOfferPrice(''); setOfferNote(''); setOfferErr(''); }} className="self-center px-3 py-2 rounded-xl bg-[var(--t2m-primary)] text-white text-[12px] font-semibold shrink-0 leading-tight">Proposer<br />un prix</button>
          )}
        </div>

        {/* Form transporteur : proposer un prix */}
        {!mine && offerFor === r.id && sent == null && (
          <div className="mt-2.5 pt-2.5 border-t border-[var(--t2m-line)] space-y-2">
            <p className="text-[11px] text-[var(--t2m-ink-3)]">Évalue selon la distance {[r.from_text, r.to_text].filter(Boolean).join(' → ')}. Tu touches ~90 %, 10 % de commission.</p>
            <div className="flex gap-2">
              <input value={offerPrice} onChange={(e) => setOfferPrice(e.target.value.replace(/[^0-9.,]/g, ''))} inputMode="decimal" placeholder="Ton prix €" className="w-28 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[14px] text-[var(--t2m-ink)] outline-none focus:border-sky-400/50" />
              <input value={offerNote} onChange={(e) => setOfferNote(e.target.value)} placeholder="Mot (optionnel)" className="flex-1 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--t2m-ink)] outline-none focus:border-sky-400/50" />
            </div>
            <button onClick={() => submitOffer(r.id)} disabled={!offerPrice || offerSending} className="w-full py-2.5 rounded-xl bg-[var(--t2m-primary)] text-white text-[13px] font-semibold disabled:opacity-40">
              {offerSending ? '…' : 'Envoyer mon offre'}
            </button>
            {/* Gate 4b-3 : prendre une mission = CNI vérifiée + ≥1 véhicule */}
            {offerErr === 'cni' && (
              <button onClick={() => router.push('/profile')} className="w-full text-left rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-[12px] px-3 py-2">
                🪪 Pour prendre une course, vérifie ton identité d’abord — <b>Mon Compte → Vérifier mon identité</b>. Appuie pour y aller.
              </button>
            )}
            {offerErr === 'vehicle' && (
              <button onClick={() => router.push('/drive')} className="w-full text-left rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-[12px] px-3 py-2">
                🚗 Déclare au moins un véhicule pour prendre une course — <b>Drive → Chauffeur → Ma flotte</b>. Appuie pour y aller.
              </button>
            )}
            {offerErr === 'other' && <p className="text-[12px] text-rose-600">Échec de l’envoi, réessaie.</p>}
          </div>
        )}

        {/* Liste demandeur : offres reçues + accepter */}
        {mine && viewOffersFor === r.id && (
          <div className="mt-2.5 pt-2.5 border-t border-[var(--t2m-line)] space-y-2">
            {offersLoading ? (
              <div className="flex justify-center py-3 text-[var(--t2m-ink-3)]"><Loader2 className="w-4 h-4 animate-spin" /></div>
            ) : offersList.length === 0 ? (
              <p className="text-[12px] text-[var(--t2m-ink-3)] text-center py-2">Pas encore d&apos;offre. Les transporteurs proposent leur prix.</p>
            ) : offersList.map((o) => (
              <div key={o.id} className="flex items-center gap-2 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[var(--t2m-ink)]"><b className="text-[var(--t2m-ink)]">{eur(o.price_cents)}</b> · {o.transporter_name || 'Transporteur'}</p>
                  {o.note && <p className="text-[12px] text-[var(--t2m-ink-3)] truncate">« {o.note} »</p>}
                </div>
                <button onClick={() => accept(o.id)} disabled={!!accepting} className="px-3 py-1.5 rounded-lg bg-[var(--t2m-primary)] text-white text-[12px] font-semibold shrink-0 disabled:opacity-40">
                  {accepting === o.id ? '…' : 'Accepter'}
                </button>
              </div>
            ))}
            <p className="text-[10px] text-[var(--t2m-ink-3)]">Accepter bloque le prix dans ton Wallet (escrow), libéré à la livraison.</p>
          </div>
        )}
      </div>
    );
  };

  // Transporteur : envoyer une offre de prix.
  const submitOffer = async (requestId: string) => {
    const cents = Math.round(parseFloat(offerPrice.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents <= 0 || offerSending) return;
    setOfferSending(true);
    try {
      const r = await fetch('/api/transport/offers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, price_cents: cents, note: offerNote }),
      }).then((x) => x.json());
      if (r?.ok) { setSentOffers((s) => ({ ...s, [requestId]: cents })); setOfferFor(''); setOfferPrice(''); setOfferNote(''); setOfferErr(''); await load(); }
      else if (r?.error === 'cni_required') setOfferErr('cni');
      else if (r?.error === 'vehicle_required') setOfferErr('vehicle');
      else setOfferErr('other');
    } finally { setOfferSending(false); }
  };

  // Demandeur : afficher/masquer les offres reçues sur sa demande.
  const toggleReceivedOffers = async (requestId: string) => {
    if (viewOffersFor === requestId) { setViewOffersFor(''); return; }
    setViewOffersFor(requestId); setOffersLoading(true); setOffersList([]);
    try {
      const r = await fetch('/api/transport/offers?request_id=' + encodeURIComponent(requestId), { cache: 'no-store' }).then((x) => x.json());
      if (r?.ok) setOffersList(r.offers || []);
    } finally { setOffersLoading(false); }
  };

  // Demandeur : accepter une offre → bloque l'escrow.
  const accept = async (offerId: string) => {
    if (accepting) return;
    setAccepting(offerId);
    try {
      const r = await fetch('/api/transport/offers/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId }),
      }).then((x) => x.json());
      if (r?.ok) { setViewOffersFor(''); await load(); }
      else if (r?.error === 'insufficient_funds') alert('Solde Wallet insuffisant pour bloquer ce montant.');
    } finally { setAccepting(''); }
  };

  // Transporteur : avancer l'étape. Demandeur : confirmer la réception (libère l'escrow).
  const advance = async (requestId: string, body: { progress?: string; confirm?: boolean }) => {
    if (courseBusy) return;
    setCourseBusy(requestId);
    try {
      const r = await fetch('/api/transport/progress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, ...body }),
      }).then((x) => x.json());
      if (r?.ok) await load();
    } finally { setCourseBusy(''); }
  };

  // Client : confirme la remise avec le CODE (saisi ou lu en NFC) → libère l'escrow.
  const submitHandoff = async (requestId: string, token: string) => {
    if (!token.trim() || courseBusy) return;
    setCourseBusy(requestId);
    try {
      const r = await fetch('/api/transport/progress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, token: token.trim() }),
      }).then((x) => x.json());
      if (r?.ok) { setHandoffCode(''); setNfcMsg(''); await load(); }
      else setNfcMsg(r?.error === 'bad_code' ? 'Code incorrect.' : 'Échec, réessaie.');
    } finally { setCourseBusy(''); }
  };

  // Client : lire le code via NFC (Web NFC — étiquette/appareil compatible).
  const nfcRead = async (requestId: string) => {
    const W = window as unknown as { NDEFReader?: new () => { scan: () => Promise<void>; onreading: ((e: { message: { records: { data?: BufferSource }[] } }) => void) | null } };
    if (!W.NDEFReader) { setNfcMsg("NFC indisponible ici — utilise le code (le tap 2 téléphones arrive avec l'appli Android)."); return; }
    try {
      const ndef = new W.NDEFReader();
      await ndef.scan();
      setNfcMsg('Approche le téléphone du transporteur…');
      ndef.onreading = (e) => {
        for (const rec of e.message.records) {
          if (!rec.data) continue;
          const val = new TextDecoder().decode(rec.data).trim();
          if (val) { submitHandoff(requestId, val); return; }
        }
      };
    } catch { setNfcMsg('NFC refusé ou indisponible — utilise le code.'); }
  };

  // Fil de course (Talk SMS) : charger / envoyer. Polling pendant que le chat est ouvert.
  const loadChat = async (requestId: string) => {
    const r = await fetch('/api/transport/messages?request_id=' + encodeURIComponent(requestId), { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setChatMsgs(r.messages || []);
  };
  useEffect(() => {
    if (!chatCourse) return;
    loadChat(chatCourse.id);
    const iv = setInterval(() => loadChat(chatCourse.id), 4000);
    return () => clearInterval(iv);
  }, [chatCourse]);
  const sendChat = async () => {
    if (!chatInput.trim() || chatSending || !chatCourse) return;
    setChatSending(true);
    try {
      const r = await fetch('/api/transport/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: chatCourse.id, body: chatInput }),
      }).then((x) => x.json());
      if (r?.ok) { setChatInput(''); await loadChat(chatCourse.id); }
    } finally { setChatSending(false); }
  };

  // Talk Phone : get-or-create la conversation de course puis route vers l'appel.
  const startCall = async (kindCall: 'audio' | 'video') => {
    if (!chatCourse) return;
    const r = await fetch('/api/transport/call', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: chatCourse.id }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok && r.conversation_id) router.push(`/c/${r.conversation_id}?call=${kindCall}`);
  };

  // Transporteur : présenter le code en NFC (écriture sur étiquette compatible).
  const nfcPresent = async (token: string) => {
    const W = window as unknown as { NDEFReader?: new () => { write: (m: unknown) => Promise<void> } };
    if (!W.NDEFReader) { setNfcMsg("NFC indisponible ici — donne le code de vive voix ou sur Talk."); return; }
    try {
      const ndef = new W.NDEFReader();
      await ndef.write({ records: [{ recordType: 'text', data: token }] });
      setNfcMsg('Code prêt à transmettre — approche le téléphone du client.');
    } catch { setNfcMsg('Approche une étiquette NFC ou le téléphone du client.'); }
  };

  return (
    <div className="h-full w-full flex flex-col bg-[var(--t2m-paper)]">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-[var(--t2m-line)]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-2)]"><ChevronLeft className="w-6 h-6" /></button>
        <Truck className="w-5 h-5 text-[var(--t2m-ink-3)]" />
        <h1 className="text-[17px] font-semibold text-[var(--t2m-ink)]">Transporteur</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {/* Choix du type */}
        <div>
          <p className="text-[12px] text-[var(--t2m-ink-3)] mb-2 px-1">Tu veux faire transporter quoi ?</p>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button key={t.k} onClick={() => { if (t.k === 'parcel') { router.push('/envoyer-colis'); return; } /* colis = vrai flux escrow + code, PAS le board */ setKind(t.k); if (t.k === 'encombrants' && !title) setTitle('Encombrants à emmener'); }}
                className={'flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center ' + (kind === t.k ? 'border-[var(--t2m-primary)] bg-[var(--t2m-wash)] text-[var(--t2m-ink)]' : 'border-[var(--t2m-line)] bg-white text-[var(--t2m-ink-2)]')}>
                {t.icon}
                <span className="text-[12px] font-medium leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Formulaire de demande */}
        {kind && (
          <div className="rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] p-3 space-y-2.5">
            {kind === 'encombrants' && (
              <p className="text-[12px] text-[var(--t2m-ink-2)] bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2">
                🗑 Chaque ville a <b>son propre calendrier</b> d'encombrants. Indique ta ville : on te propose la prochaine collecte, ou tu la programmes si elle n'est pas encore connue.
              </p>
            )}
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quoi ? (ex : canapé 2 places)" className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[14px] text-[var(--t2m-ink)] outline-none focus:border-sky-400/50" />
            <div className="flex gap-2">
              <input value={fromT} onChange={(e) => setFromT(e.target.value)} placeholder="Depuis…" className="flex-1 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--t2m-ink)] outline-none focus:border-sky-400/50" />
              <input value={toT} onChange={(e) => setToT(e.target.value)} placeholder={kind === 'encombrants' ? 'Point de collecte' : 'Vers…'} className="flex-1 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--t2m-ink)] outline-none focus:border-sky-400/50" />
            </div>

            {/* ENCOMBRANTS : calendrier PAR VILLE (jamais imposé) */}
            {kind === 'encombrants' && (
              <div className="rounded-xl border border-[var(--t2m-line)] bg-white p-2.5 space-y-2">
                <div className="flex gap-2">
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ta ville (ex : Lyon)" className="flex-1 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--t2m-ink)] outline-none focus:border-sky-400/50" />
                  <button onClick={detectCity} className="px-3 py-2 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[12px] text-[var(--t2m-ink-2)] shrink-0">
                    {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ma ville'}
                  </button>
                </div>

                {schedLoading && <p className="text-[12px] text-[var(--t2m-ink-3)]">Recherche du calendrier…</p>}

                {/* Ville connue → on propose la prochaine collecte */}
                {!schedLoading && sched && !programming && (
                  <div className="text-[12px] text-[var(--t2m-ink-2)] bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2">
                    À <b>{sched.city_label}</b>, collecte {ruleText(sched)}.
                    {schedNext && <> Prochaine : <b>{fmtDate(schedNext)}</b>.</>}
                    <button onClick={() => { setPFreq(sched.freq); setPWeekday(sched.weekday); setPWeek(sched.week); setProgramming(true); }} className="ml-1 underline text-[var(--t2m-ink-2)]">Corriger</button>
                  </div>
                )}

                {/* Ville inconnue → proposer de programmer */}
                {!schedLoading && !sched && city.trim() && !programming && (
                  <div className="text-[12px] text-[var(--t2m-ink-3)]">
                    Calendrier inconnu pour « {city.trim()} ».
                    <button onClick={() => setProgramming(true)} className="ml-1 underline text-[var(--t2m-ink-3)]">Programmer la collecte de cette ville</button>
                  </div>
                )}

                {/* Mini-formulaire de programmation */}
                {programming && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[12px] text-[var(--t2m-ink-3)]">À quel rythme passe la collecte à {city.trim() || 'cette ville'} ?</p>
                    <div className="flex gap-1.5">
                      {([['monthly', '1×/mois'], ['weekly', 'Chaque semaine']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setPFreq(v)} className={'flex-1 py-1.5 rounded-lg text-[12px] border ' + (pFreq === v ? 'border-[var(--t2m-primary)] bg-[var(--t2m-wash)] text-[var(--t2m-ink)]' : 'border-[var(--t2m-line)] bg-white text-[var(--t2m-ink-2)]')}>{l}</button>
                      ))}
                    </div>
                    {pFreq === 'monthly' && (
                      <select value={pWeek} onChange={(e) => setPWeek(e.target.value)} className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--t2m-ink)] outline-none">
                        {WEEKS.map((w) => <option key={w.v} value={w.v}>{w.label}</option>)}
                      </select>
                    )}
                    <select value={pWeekday} onChange={(e) => setPWeekday(parseInt(e.target.value, 10))} className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--t2m-ink)] outline-none">
                      {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => setProgramming(false)} className="px-3 py-2 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[12px] text-[var(--t2m-ink-2)]">Annuler</button>
                      <button onClick={saveSchedule} disabled={!city.trim() || savingSched} className="ml-auto px-4 py-2 rounded-xl bg-[var(--t2m-primary)] text-white text-[13px] font-semibold disabled:opacity-40">
                        {savingSched ? '…' : 'Enregistrer le calendrier'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* RENDEZ-VOUS (déménagement/encombrants = planifié, pas instantané) */}
            <div>
              <p className="text-[12px] text-[var(--t2m-ink-3)] mb-1.5">📅 Rendez-vous</p>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[13px] text-[var(--t2m-ink)] outline-none focus:border-sky-400/50" />
              <div className="flex gap-1.5 mt-2">
                {SLOTS.map((s) => (
                  <button key={s} onClick={() => setSlot(slot === s ? '' : s)}
                    className={'flex-1 py-1.5 rounded-lg text-[12px] border ' + (slot === s ? 'border-[var(--t2m-primary)] bg-[var(--t2m-wash)] text-[var(--t2m-ink)]' : 'border-[var(--t2m-line)] bg-white text-[var(--t2m-ink-2)]')}>{s}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[13px] text-[var(--t2m-ink-2)]">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Photo
              </button>
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="w-10 h-10 rounded-lg object-cover" />
              )}
              <button onClick={publish} disabled={!title.trim() || posting} className="ml-auto px-4 py-2.5 rounded-xl bg-[var(--t2m-primary)] text-white text-[14px] font-semibold disabled:opacity-40">
                {posting ? '…' : 'Publier la demande'}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
          </div>
        )}

        {/* MES COURSES (suivi) — demandeur ET transporteur */}
        {courses.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-[var(--t2m-ink)] mb-2 px-1">Mes courses</p>
            <div className="space-y-2.5">
              {courses.map((c) => {
                const iAmTransporter = !!(me && c.transporter_id === me);
                const done = c.status === 'done';
                const curIdx = done ? STEP_KEYS.length : Math.max(0, STEP_KEYS.indexOf(c.progress || 'assigned'));
                const busy = courseBusy === c.id;
                // Prochaine étape transporteur (assigned→enroute→picked→delivered)
                const nextStep = curIdx < STEP_KEYS.length - 1 ? STEP_KEYS[curIdx + 1] : (curIdx === STEP_KEYS.length - 1 ? 'delivered' : null);
                const advanceLabel: Record<string, string> = { enroute: 'Je pars chercher 🚚', picked: "J'ai récupéré ✋", delivered: "J'ai livré 📦" };
                const delivered = (c.progress === 'delivered');
                return (
                  <div key={c.id} className="rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-[var(--t2m-ink)] truncate">{c.title}</p>
                        <p className="text-[12px] text-[var(--t2m-ink-3)] truncate">{[c.from_text, c.to_text].filter(Boolean).join(' → ') || '—'}</p>
                        <p className="text-[12px] text-[var(--t2m-ink-3)] mt-0.5">
                          {iAmTransporter ? `Pour ${c.requester_name || 'client'}` : `Avec ${c.transporter_name || 'transporteur'}`}
                          {c.agreed_price_cents != null && <> · <b className="text-[var(--t2m-ink-3)]">{eur(c.agreed_price_cents)}</b></>}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {done && <span className="text-[12px] font-semibold text-[var(--t2m-ink-2)]">Réglé</span>}
                        <button onClick={() => setChatCourse({ id: c.id, title: c.title, peer: iAmTransporter ? (c.requester_name || 'Client') : (c.transporter_name || 'Transporteur') })} className="px-2.5 py-1.5 rounded-lg bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink)] text-[12px] font-medium">💬 Talk</button>
                      </div>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-1 mt-2.5">
                      {STEPS.map((s, i) => {
                        const reached = i < curIdx || done;
                        const active = i === curIdx && !done;
                        return (
                          <div key={s.k} className="flex-1 flex flex-col items-center gap-1">
                            <div className={'w-full h-1.5 rounded-full ' + (reached ? 'bg-[var(--t2m-primary)]' : active ? 'bg-[var(--t2m-ink-3)]' : 'bg-[var(--t2m-line)]')} />
                            <span className={'text-[10px] ' + (reached ? 'text-[var(--t2m-ink-2)]' : active ? 'text-[var(--t2m-ink-3)]' : 'text-[var(--t2m-ink-3)]')}>{s.label}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div className="mt-2.5">
                      {done ? (
                        <p className="text-[11px] text-[var(--t2m-ink-3)] text-center">Course terminée, paiement libéré.</p>
                      ) : iAmTransporter ? (
                        // Transporteur (remetteur) : à la remise, il SAISIT le code que le receveur lui montre → payé.
                        delivered ? (
                          <div className="space-y-2">
                            <p className="text-[12px] text-[var(--t2m-ink-3)] text-center">Remise : demande son code au client et saisis-le (ou approche les téléphones en NFC). Tu es payé dès qu&apos;il correspond.</p>
                            <button onClick={() => nfcRead(c.id)} className="w-full py-2.5 rounded-xl bg-[var(--t2m-primary)] text-white text-[13px] font-semibold">Approcher le téléphone (NFC)</button>
                            <div className="flex gap-2">
                              <input value={handoffCode} onChange={(e) => setHandoffCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="Code du client (ex : A1B2C3)" className="flex-1 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[15px] tracking-widest text-[var(--t2m-ink)] outline-none focus:border-emerald-400/50" />
                              <button onClick={() => submitHandoff(c.id, handoffCode)} disabled={!handoffCode || busy} className="px-4 py-2.5 rounded-xl bg-[var(--t2m-primary)] text-white text-[13px] font-semibold disabled:opacity-40">{busy ? '…' : 'Confirmer'}</button>
                            </div>
                            {nfcMsg && <p className="text-[11px] text-[var(--t2m-ink-3)] text-center">{nfcMsg}</p>}
                          </div>
                        ) : nextStep ? (
                          <button onClick={() => advance(c.id, { progress: nextStep })} disabled={busy} className="w-full py-2.5 rounded-xl bg-[var(--t2m-primary)] text-white text-[13px] font-semibold disabled:opacity-40">
                            {busy ? '…' : advanceLabel[nextStep]}
                          </button>
                        ) : null
                      ) : (
                        // Demandeur (receveur) : il DÉTIENT le code et le montre au transporteur à la remise.
                        delivered ? (
                          <div className="space-y-2 text-center">
                            <p className="text-[12px] text-[var(--t2m-ink-3)]">Ton code de remise — montre-le au transporteur (tap NFC, de vive voix, ou sur Talk) :</p>
                            <p className="text-[26px] font-bold tracking-[0.35em] text-[var(--t2m-ink)] pl-[0.35em]">{c.handoff_token}</p>
                            <button onClick={() => nfcPresent(c.handoff_token || '')} className="w-full py-2.5 rounded-xl bg-[var(--t2m-primary)] text-white text-[13px] font-semibold">Transmettre par NFC</button>
                            <p className="text-[11px] text-[var(--t2m-ink-2)]">Le transporteur est payé dès qu&apos;il saisit ce code.</p>
                            {nfcMsg && <p className="text-[11px] text-[var(--t2m-ink-3)]">{nfcMsg}</p>}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--t2m-ink-3)] text-center">{c.transporter_name || 'Le transporteur'} s&apos;occupe de ta course. À la livraison, montre-lui ton code.</p>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mes demandes (les miennes) — voir/accepter les offres reçues. Jamais dans « à transporter ». */}
        {myReqs.length > 0 && (
          <div className="mb-4">
            <p className="text-[13px] font-semibold text-[var(--t2m-ink)] mb-2 px-1">Mes demandes</p>
            <div className="space-y-2">{myReqs.map(renderReq)}</div>
          </div>
        )}

        {/* Demandes des AUTRES à transporter — filtrées par l'onglet sélectionné (déménager/encombrants). */}
        <div>
          <p className="text-[13px] font-semibold text-[var(--t2m-ink)] mb-2 px-1">Demandes à transporter</p>
          {loading ? (
            <div className="flex justify-center py-6 text-[var(--t2m-ink-3)]"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : boardReqs.length === 0 ? (
            <p className="text-center text-[var(--t2m-ink-3)] text-[13px] py-6">Aucune demande à transporter pour l’instant.</p>
          ) : (
            <div className="space-y-2">{boardReqs.map(renderReq)}</div>
          )}
        </div>
      </div>

      {/* FIL DE COURSE (Talk SMS) — chat livreur ↔ client lié à la course, pas besoin d'être amis */}
      {chatCourse && (
        <div className="fixed inset-0 z-[80] bg-[var(--t2m-paper)] flex flex-col">
          <header className="shrink-0 flex items-center gap-2 px-3 border-b border-[var(--t2m-line)]" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
            <button onClick={() => { setChatCourse(null); setChatMsgs([]); setChatInput(''); }} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-2)]"><ChevronLeft className="w-6 h-6" /></button>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-[var(--t2m-ink)] truncate leading-tight">{chatCourse.peer}</p>
              <p className="text-[11px] text-[var(--t2m-ink-3)] truncate">À propos de : {chatCourse.title}</p>
            </div>
            <button onClick={() => startCall('audio')} aria-label="Appel audio" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-3)] hover:bg-[var(--t2m-wash)]"><Phone className="w-5 h-5" /></button>
            <button onClick={() => startCall('video')} aria-label="Appel vidéo" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-3)] hover:bg-[var(--t2m-wash)]"><Video className="w-5 h-5" /></button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
            {chatMsgs.length === 0 ? (
              <p className="text-center text-[var(--t2m-ink-3)] text-[12px] py-8">Démarre la conversation pour t&apos;organiser (point de rendez-vous, étage, code…).</p>
            ) : chatMsgs.map((m) => {
              const mine = me && m.sender_id === me;
              return (
                <div key={m.id} className={'flex ' + (mine ? 'justify-end' : 'justify-start')}>
                  <span className={'max-w-[78%] px-3 py-2 rounded-2xl text-[14px] ' + (mine ? 'bg-[var(--t2m-primary)] text-white rounded-br-md' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink)] rounded-bl-md')}>{m.body}</span>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 flex items-center gap-2 p-2.5 border-t border-[var(--t2m-line)]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.625rem)' }}>
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }} placeholder="Message…" className="flex-1 bg-[var(--t2m-wash)] border border-[var(--t2m-line)] rounded-full px-4 py-2.5 text-[14px] text-[var(--t2m-ink)] outline-none focus:border-sky-400/50" />
            <button onClick={sendChat} disabled={!chatInput.trim() || chatSending} className="px-4 py-2.5 rounded-full bg-[var(--t2m-primary)] text-white text-[14px] font-semibold disabled:opacity-40">{chatSending ? '…' : 'Envoyer'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
