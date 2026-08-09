'use client';
/**
 * « Envoyer un colis » (P2P) — un particulier confie un colis à une AGENCE (prix fixe déclaré par
 * l'agence). MVP relais : je pose ma position → je choisis une agence → je paie → le destinataire
 * retire à l'agence avec le CODE que je lui relaie. Réutilise le moteur d'acheminement (Système B).
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { MapPin, Loader2, Package } from '@/lib/icons';
import DriveMap from '@/components/drive/DriveMap';

interface Agency { uid: string; name: string; depot_lat: number; depot_lng: number; depot_label: string | null; base_cents: number; per_km_cents: number; dist_km: number | null }

export default function EnvoyerColis() {
  const router = useRouter();
  const preAgency = useSearchParams().get('agency');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [sel, setSel] = useState<string>(preAgency || '');
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const locate = () => {
    if (!navigator.geolocation) { setMsg('Géolocalisation indisponible.'); return; }
    setMsg('Localisation…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setMsg(null); },
      () => setMsg('Autorise la localisation.'), { enableHighAccuracy: true, timeout: 12000 });
  };
  useEffect(() => { locate(); }, []);

  // Charge les agences proches quand la position est connue.
  useEffect(() => {
    if (!pos) return;
    setLoading(true);
    fetch(`/api/parcels/agencies?lat=${pos.lat}&lng=${pos.lng}`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setAgencies(d?.agencies || [])).catch(() => setAgencies([]))
      .finally(() => setLoading(false));
  }, [pos]);

  const agency = agencies.find((a) => a.uid === sel) || null;

  // Devis dès qu'une agence est choisie (destination = dépôt de l'agence : retrait sur place).
  useEffect(() => {
    setPrice(null);
    if (!pos || !agency) return;
    fetch('/api/parcels/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agency_uid: agency.uid, o: pos, d: { lat: agency.depot_lat, lng: agency.depot_lng } }) })
      .then((r) => r.json()).then((d) => { if (d?.ok) setPrice(d.price_cents); }).catch(() => {});
  }, [pos, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!pos || !agency) { setMsg('Choisis une agence.'); return; }
    setPaying(true); setMsg(null);
    try {
      const d = await fetch('/api/parcels/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_uid: agency.uid, o: pos, d: { lat: agency.depot_lat, lng: agency.depot_lng, label: agency.depot_label } }) }).then((r) => r.json());
      if (d?.checkout_url) { window.location.href = d.checkout_url; return; }
      if (d?.ok) { setMsg('📲 Paiement lancé — confirme sur ton téléphone. Ton code de retrait apparaîtra dans « Mes colis ».'); setPaying(false); return; }
      setMsg('Échec, réessaie.'); setPaying(false);
    } catch { setMsg('Erreur réseau.'); setPaying(false); }
  };

  const fmt = (c: number) => `${c.toLocaleString('fr-FR')} Ar`;

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#2F343A] px-4 py-6 t2m-page">
      <button onClick={() => smartBack(router, '/profile')} className="text-[#8A8F99] text-sm mb-4">← Retour</button>
      <div className="flex items-center gap-2 mb-1"><Package className="w-5 h-5 text-amber-600" /><h1 className="text-xl font-bold">Envoyer un colis</h1></div>
      <p className="text-[13px] text-[#6A7585] mb-5">Confie ton colis à une agence près de toi. Le destinataire le retire à l’agence avec le code que tu lui envoies. Paiement protégé : l’agence n’est payée qu’au retrait.</p>

      <button onClick={locate} className={'w-full mb-4 rounded-xl border px-3 py-3 text-[14px] flex items-center justify-center gap-2 ' + (pos ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-[#EAECEF] bg-[#F5F6F8] text-[#4A4E57]')}>
        <MapPin className="w-4 h-4" />{pos ? 'Position posée' : 'Ma position'}
      </button>

      {loading && <div className="flex items-center gap-2 text-[#8A8F99] text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /> Recherche d’agences…</div>}
      {!loading && pos && agencies.length === 0 && <p className="text-[13px] text-[#8A8F99]">Aucune agence acceptant les colis près de toi pour l’instant.</p>}

      <div className="space-y-2 mb-5">
        {agencies.map((a) => {
          const on = sel === a.uid;
          return (
            <button key={a.uid} onClick={() => setSel(a.uid)} className={'w-full text-left rounded-xl border px-3 py-3 ' + (on ? 'border-amber-400/60 bg-amber-500/10' : 'border-[#EAECEF] bg-[#F5F6F8]')}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[14px]">{a.name}</span>
                {a.dist_km != null && <span className="text-[11px] text-[#9DAAB7]">{a.dist_km.toFixed(1)} km</span>}
              </div>
              <div className="text-[12px] text-[#8A8F99] mt-0.5">{a.depot_label || 'Dépôt'} · base {fmt(a.base_cents)} + {fmt(a.per_km_cents)}/km</div>
            </button>
          );
        })}
      </div>

      {agency && (
        <div className="rounded-2xl border border-[#EAECEF] bg-[#F5F6F8] p-4 mb-4">
          {/* Carte : ta position + le point de retrait (dépôt de l'agence). */}
          <div className="relative h-44 rounded-xl overflow-hidden mb-3 border border-[#EAECEF]">
            <DriveMap
              center={{ lat: agency.depot_lat, lng: agency.depot_lng }}
              markers={[
                ...(pos ? [{ id: 'me', lat: pos.lat, lng: pos.lng, kind: 'me' as const, label: 'Toi' }] : []),
                { id: 'pickup', lat: agency.depot_lat, lng: agency.depot_lng, kind: 'pickup' as const, label: `📦 ${agency.name}` },
              ]}
              className="absolute inset-0" />
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[#6A7585] mb-2">
            <MapPin className="w-3.5 h-3.5 text-amber-600" /> Point de retrait : {agency.depot_label || agency.name}
          </div>
          <div className="flex items-center justify-between text-[14px]">
            <span className="text-[#4A4E57]">Prix (payé à l’agence au retrait)</span>
            <span className="font-bold text-amber-700">{price != null ? fmt(price) : '…'}</span>
          </div>
          <p className="text-[11px] text-[#9DAAB7] mt-2">Le destinataire retire le colis à {agency.name} en présentant le code que tu recevras dans « Mes colis ».</p>
        </div>
      )}

      <button onClick={send} disabled={!agency || price == null || paying} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-black font-semibold disabled:opacity-50">
        {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} {price != null ? `Payer ${fmt(price)}` : 'Envoyer le colis'}
      </button>
      {msg && <p className="text-[13px] text-amber-700 mt-3">{msg}</p>}
    </div>
  );
}
