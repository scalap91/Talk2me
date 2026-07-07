'use client';

/**
 * AroundFeed (Pascal 2026-07-05) — onglet « Autour ». C'est EXACTEMENT le feed général
 * (PostFeed), juste FILTRÉ aux alentours (~5 km). Zéro page à part, zéro cercle, zéro
 * fond noir : on géolocalise puis on rend <PostFeed scope="around">. Le serveur renvoie
 * les cards géolocalisées proches au format feed → même rendu que tout le reste.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from '@/lib/icons';
import PostFeed from './PostFeed';

export default function AroundFeed({ topPad }: { topPad?: number }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) { setDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setDenied(true),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  if (denied) {
    return (
      <div className="h-full grid place-items-center text-center px-8">
        <div>
          <p className="text-[#6A7585] text-[14px] font-medium">Autorise ta position pour voir ce qui est autour de toi.</p>
          <button onClick={() => window.location.reload()} className="mt-3 px-4 py-2 rounded-full bg-[#F0F2F5] text-[#2F343A] text-[13px] font-semibold active:scale-95">Réessayer</button>
        </div>
      </div>
    );
  }
  if (!pos) return <div className="h-full grid place-items-center text-[#9DAAB7]"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return <PostFeed scope="around" lat={pos.lat} lng={pos.lng} topPad={topPad} emptyText={<>Rien autour de toi pour l&apos;instant.<br />Les annonces près de chez toi apparaîtront ici.</>} />;
}
