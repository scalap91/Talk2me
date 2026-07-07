'use client';

/**
 * ServiceEmploiFeed (Pascal 2026-07-05) — annonces LOCALES « listing + action chat ».
 * Service → « Demander un devis », Emploi → « Postuler ». Le shop EST l'annonce
 * (pas de produit à acheter). Le bouton POST /api/simple-shop/contact → ouvre la
 * conversation P2P demandeur↔propriétaire (le devis / la candidature se discute là).
 * PII air-gap : l'API ne renvoie que name/description/catégorie/tarif/lieu + public_key.
 * Réutilisé par AcheterHub (onglets Services / Emploi). Style dark cohérent avec le Hub.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wrench, Briefcase, MapPin, MessageCircle } from '@/lib/icons';
import MarketFilterBar from './MarketFilterBar';

interface Listing { id: string; public_key: string; name: string; description: string | null; category: string | null; tarif: string | null; place: string | null; cover_url: string | null; created_at: number }

export default function ServiceEmploiFeed({ kind, onBack: _onBack }: { kind: 'service' | 'emploi'; embedded?: boolean; onBack?: () => void }) {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacting, setContacting] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(''); // filtre catégorie ('' = toutes)
  // Mode d'affichage lu depuis <html data-d-service="cards|photo"> (défaut cards), réactif t2m:theme.
  const [mode, setMode] = useState<'cards' | 'photo'>('cards');
  useEffect(() => {
    const read = () => setMode(document.documentElement.dataset.dService === 'photo' ? 'photo' : 'cards');
    read();
    window.addEventListener('t2m:theme', read);
    return () => window.removeEventListener('t2m:theme', read);
  }, []);

  // Catégories DISTINCTES réellement présentes dans les listings (l.category).
  const cats = useMemo(
    () => Array.from(new Set(listings.map((l) => l.category).filter((c): c is string => !!c))),
    [listings],
  );
  // Filtrage AVANT rendu : catégorie + recherche (name/description/category/place).
  const shown = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return listings.filter((l) =>
      (active === '' || active === 'Tout' || l.category === active) &&
      (!ql || (`${l.name} ${l.description || ''} ${l.category || ''} ${l.place || ''}`).toLowerCase().includes(ql)),
    );
  }, [listings, active, query]);

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

  if (loading) return <div className="h-full grid place-items-center text-[var(--t2m-ink-3)]"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!listings.length) {
    return (
      <div className="h-full grid place-items-center text-center px-8">
        <div>
          <Icon className="w-8 h-8 mx-auto mb-2" style={{ color: accent }} />
          <p className="text-[var(--t2m-ink-2)] text-[14px]">{isEmploi ? "Aucune offre d'emploi pour l'instant." : 'Aucun service proposé pour l’instant.'}</p>
          <p className="text-[var(--t2m-ink-3)] text-[12px] mt-1">Publie la tienne via le bouton + « Créer ».</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <MarketFilterBar
        placeholder={isEmploi ? 'Rechercher une offre…' : 'Rechercher un service…'}
        query={query} onQuery={setQuery}
        cats={cats} active={active} onActive={setActive}
      />
      {shown.length === 0 ? (
        <p className="text-center text-[var(--t2m-ink-3)] text-[13px] px-8 py-10">Rien trouvé.</p>
      ) : mode === 'photo' ? (
      // MODE PHOTO — mosaïque jointive 2 colonnes, tuiles carrées.
      <div className="flex-1 overflow-y-auto grid grid-cols-2" style={{ gap: 0 }}>
      {shown.map((l) => (
        <div key={l.id} className="relative" style={{ aspectRatio: '1 / 1' }}>
          {l.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
              <Icon className="w-10 h-10 text-white/90" />
            </div>
          )}
          <div
            className="absolute inset-0 flex flex-col justify-end p-2.5"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,0) 55%)' }}
          >
            <div className="text-[13.5px] font-bold text-white line-clamp-2 leading-tight" style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{l.name}</div>
            {l.category && <div className="text-[11px] font-medium text-white mt-0.5 truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{l.category}</div>}
            <button
              onClick={() => contact(l)}
              disabled={contacting === l.id}
              className="mt-2 inline-flex items-center justify-center gap-1.5 h-8 rounded-full text-white text-[11.5px] font-semibold active:scale-95 disabled:opacity-60"
              style={{ background: accent }}
            >
              {contacting === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
              {actionLabel}
            </button>
          </div>
        </div>
      ))}
      </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
      {shown.map((l) => (
        <div key={l.id} className="rounded-2xl border border-[var(--t2m-line)] bg-[var(--t2m-paper)] shadow-[0_2px_10px_rgba(47,52,58,.05)] overflow-hidden">
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
                <div className="text-[14.5px] font-semibold text-[var(--t2m-ink)] truncate">{l.name}</div>
                {l.category && <div className="text-[11.5px] font-medium mt-0.5" style={{ color: accent }}>{l.category}</div>}
              </div>
              {l.tarif && <div className="text-[12px] font-semibold text-[var(--t2m-ink)] shrink-0 text-right max-w-[42%] leading-tight">{l.tarif}</div>}
            </div>
            {l.description && <p className="text-[12.5px] text-[var(--t2m-ink-2)] mt-2 leading-relaxed line-clamp-3">{l.description}</p>}
            <div className="flex items-center gap-2 mt-3">
              {l.place && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--t2m-ink-3)] min-w-0">
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
      )}
    </div>
  );
}
