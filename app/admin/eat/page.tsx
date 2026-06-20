'use client';

/**
 * Talk2Me — ADMIN : fiches Eat « à revendiquer » (Pascal 2026-06-10).
 * Voir les fiches (à revendiquer / fermées / revendiquées) + EFFACER à la main.
 * Une fiche disparue d'OSM n'est JAMAIS effacée auto — elle passe « fermée » et
 * on alerte ; ici l'admin décide d'effacer. Réservé admin (isAiOpsAdmin).
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trash2, Loader2, MapPin } from 'lucide-react';

interface Listing { osm_id: string; name: string; cuisine: string | null; emoji: string | null; address: string | null; lat: number; lng: number; photo_url: string | null; status: string; area_key: string }
const TABS = [
  { k: 'unclaimed', label: 'À revendiquer' },
  { k: 'gone', label: 'Fermés' },
  { k: 'claimed', label: 'Revendiqués' },
];

export default function AdminEatPage({ onBack }: { onBack?: () => void } = {}) {
  const router = useRouter();
  const back = () => (onBack ? onBack() : router.push('/admin'));
  const [tab, setTab] = useState('unclaimed');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [deleting, setDeleting] = useState('');

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/eat?status=' + status, { cache: 'no-store' });
      if (r.status === 403) { setForbidden(true); return; }
      const d = await r.json();
      if (d?.ok) { setRows(d.listings || []); setCounts(d.counts || {}); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const del = async (osmId: string) => {
    if (deleting) return;
    setDeleting(osmId);
    try {
      const r = await fetch('/api/admin/eat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', osm_id: osmId }),
      }).then((x) => x.json());
      if (r?.ok) setRows((prev) => prev.filter((x) => x.osm_id !== osmId));
    } finally { setDeleting(''); }
  };

  if (forbidden) {
    return <div className="min-h-[100svh] bg-[#0a0a14] text-white grid place-items-center p-6 text-center"><p className="text-white/70">Accès admin requis.</p></div>;
  }

  return (
    <div className="min-h-[100svh] bg-[#0a0a14] text-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-4 h-14 border-b border-white/8 bg-[#0a0a14]/90 backdrop-blur">
        <button onClick={back} className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[17px] font-semibold">Fiches Eat</h1>
      </header>

      <div className="flex gap-2 p-3 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={'shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium border ' + (tab === t.k ? 'bg-red-600 border-red-500 text-white' : 'border-white/12 text-white/70')}>
            {t.label}{counts[t.k] != null ? ` · ${counts[t.k]}` : ''}
          </button>
        ))}
      </div>

      <div className="px-3 pb-10 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-white/40 text-[13px] py-10">Aucune fiche.</p>
        ) : rows.map((l) => (
          <div key={l.osm_id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <span className="w-10 h-10 rounded-lg bg-white/5 grid place-items-center overflow-hidden shrink-0">
              {l.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.photo_url} alt="" className="w-full h-full object-cover" />
              ) : <span className="text-[18px]">{l.emoji || '🍽️'}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-white/90 truncate">{l.name}</p>
              <p className="text-[11px] text-white/45 truncate flex items-center gap-1"><MapPin className="w-3 h-3" />{[l.cuisine?.replace(/_/g, ' '), l.address, l.area_key].filter(Boolean).join(' · ')}</p>
            </div>
            {l.status === 'gone' && <span className="text-[10px] text-red-300 shrink-0">fermé</span>}
            {l.status === 'claimed' && <span className="text-[10px] text-emerald-300 shrink-0">revendiqué</span>}
            <button onClick={() => del(l.osm_id)} disabled={!!deleting} className="w-9 h-9 rounded-lg grid place-items-center text-red-300 hover:bg-red-500/10 shrink-0 disabled:opacity-40">
              {deleting === l.osm_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
