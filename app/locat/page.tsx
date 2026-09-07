'use client';

/**
 * Talk2Me — LOCAT👀 : marketplace de LOCATION de biens (robe de mariée, sono, bétonnière…).
 * RECYCLE le storefront SHEIN (SheinStore) — même grille, même fiche, même lecteur Boutique —
 * branché sur le catalogue des biens à louer (/api/locat/store = shop_products rental=1).
 * Le tarif+unité s'affiche via price_label (« … / jour »). Bouton « Louer » + calendrier : tranches suivantes.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SheinStore from '@/components/shop/SheinStore';
import ShopNav from '@/components/shop/ShopNav';
import { LOCAT_FAMILIES } from '@/lib/locat-taxonomy'; // taxonomie niveau 1 (familles)

export default function LocatPage() {
  const router = useRouter();
  const [family, setFamily] = useState<string>(''); // niveau 1 ; '' = toutes les familles
  // PROXIMITÉ (Pascal 2026-09-06) : LOCAT = location de proximité. On affiche le catalogue tout de
  // suite, puis DÈS que la position est connue on bascule sur « 📍 Autour de moi » (trié du plus
  // proche au plus loin) en changeant l'endpoint → key force le remount+refetch de SheinStore.
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState<number | null>(null); // km ; null = Tout
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
  }, []);
  const famQ = family ? `&family=${encodeURIComponent(family)}` : '';
  const endpoint = pos
    ? `/api/locat/store?lat=${pos.lat}&lng=${pos.lng}${radius ? `&radius=${radius}` : ''}${famQ}`
    : `/api/locat/store${family ? `?family=${encodeURIComponent(family)}` : ''}`;
  return (
    // Aligné sur le natif (AcheterHub annonces.dart) : menu marketplace EN HAUT (ShopNav),
    // AUCUNE barre du bas (le natif = SafeArea(bottom:false), pas de BottomNav sur le hub).
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] flex flex-col">
      <ShopNav locat />
      {/* TAXONOMIE niveau 1 : familles (toujours visible). Une famille → SheinStore affiche ses sous-catégories. */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)] overflow-x-auto">
        <button onClick={() => setFamily('')}
          className={'shrink-0 px-3 py-1 rounded-full text-[12.5px] font-semibold border ' + (family === '' ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink)] border-[var(--t2m-line)]')}>Tout</button>
        {LOCAT_FAMILIES.map((f) => (
          <button key={f.key} onClick={() => setFamily(f.label)}
            className={'shrink-0 px-3 py-1 rounded-full text-[12.5px] font-semibold border ' + (family === f.label ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink)] border-[var(--t2m-line)]')}>
            {f.emoji} {f.label}
          </button>
        ))}
      </div>
      {/* PROXIMITÉ : rayon réglable (visible dès que la position est connue). */}
      {pos && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)] overflow-x-auto">
          <span className="text-[12px] text-[var(--t2m-ink-2)] shrink-0">📍 Autour de moi :</span>
          {[{ l: '5 km', v: 5 }, { l: '10 km', v: 10 }, { l: '50 km', v: 50 }, { l: 'Tout', v: null as number | null }].map((o) => (
            <button key={o.l} onClick={() => setRadius(o.v)}
              className={'shrink-0 px-3 py-1 rounded-full text-[12.5px] font-semibold border ' +
                (radius === o.v ? 'bg-[var(--t2m-primary)] text-white border-[var(--t2m-primary)]' : 'bg-[var(--t2m-wash)] text-[var(--t2m-ink)] border-[var(--t2m-line)]')}>
              {o.l}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 w-full lg:max-w-5xl lg:mx-auto lg:my-4 lg:rounded-2xl lg:border lg:border-[var(--t2m-line)] overflow-y-auto bg-[var(--t2m-paper)]">
        <SheinStore key={endpoint} endpoint={endpoint} rental onBack={() => router.push('/home')} />
      </div>
    </div>
  );
}
