'use client';

/**
 * ServiceEmploiFeed (Pascal 2026-07-05) — annonces LOCALES « listing + action chat ».
 * Service → « Demander un devis », Emploi → « Postuler ». Le shop EST l'annonce
 * (pas de produit à acheter). Le bouton POST /api/simple-shop/contact → ouvre la
 * conversation P2P demandeur↔propriétaire (le devis / la candidature se discute là).
 * PII air-gap : l'API ne renvoie que name/description/catégorie/tarif/lieu + public_key.
 * Réutilisé par AcheterHub (onglets Services / Emploi). Style dark cohérent avec le Hub.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wrench, Briefcase, MapPin, MessageCircle } from '@/lib/icons';

interface Listing { id: string; public_key: string; name: string; description: string | null; category: string | null; tarif: string | null; place: string | null; cover_url: string | null; created_at: number }

export default function ServiceEmploiFeed({ kind, onBack: _onBack }: { kind: 'service' | 'emploi'; embedded?: boolean; onBack?: () => void }) {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacting, setContacting] = useState<string | null>(null);

  const isEmploi = kind === 'emploi';
  const Icon = isEmploi ? Briefcase : Wrench;
  const accent = isEmploi ? '#EF4444' : '#0EA5E9';
  const actionLabel = isEmploi ? 'Postuler' : 'Demander un devis';

  useEffect(() => {
    setLoading(true);
    fetch(`/api/simple-shop/listings?kind=${kind}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setListings(d.listings || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kind]);

  const contact = async (l: Listing) => {
    if (contacting) return;
    setContacting(l.id);
    try {
      const r = await fetch('/api/simple-shop/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: l.public_key }),
      });
      const d = await r.json();
      if (r.ok && d.conversationId) { router.push(`/c/${d.conversationId}`); return; }
      setContacting(null);
    } catch { setContacting(null); }
  };

  if (loading) return <div className="h-full grid place-items-center text-white/30"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!listings.length) {
    return (
      <div className="h-full grid place-items-center text-center px-8">
        <div>
          <Icon className="w-8 h-8 mx-auto mb-2" style={{ color: accent }} />
          <p className="text-white/50 text-[14px]">{isEmploi ? "Aucune offre d'emploi pour l'instant." : 'Aucun service proposé pour l’instant.'}</p>
          <p className="text-white/30 text-[12px] mt-1">Publie la tienne via le bouton + « Créer ».</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2.5">
      {listings.map((l) => (
        <div key={l.id} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
          {l.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.cover_url} alt="" className="w-full h-32 object-cover" />
          )}
          <div className="p-3">
            <div className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: `${accent}22` }}>
                <Icon className="w-4 h-4" style={{ color: accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-semibold text-white truncate">{l.name}</div>
                {l.category && <div className="text-[11.5px] font-medium mt-0.5" style={{ color: accent }}>{l.category}</div>}
              </div>
              {l.tarif && <div className="text-[12px] font-semibold text-white/85 shrink-0 text-right max-w-[42%] leading-tight">{l.tarif}</div>}
            </div>
            {l.description && <p className="text-[12.5px] text-white/60 mt-2 leading-relaxed line-clamp-3">{l.description}</p>}
            <div className="flex items-center gap-2 mt-3">
              {l.place && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-white/45 min-w-0">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{l.place}</span>
                </span>
              )}
              <span className="flex-1" />
              <button
                onClick={() => contact(l)}
                disabled={contacting === l.id}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-white text-[12.5px] font-semibold active:scale-95 disabled:opacity-60"
                style={{ background: accent }}
              >
                {contacting === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                {actionLabel}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
