'use client';

/**
 * Talk2Me — Shop · Vous (Pascal 2026-06-27, façon Temu). Hub compte côté Shop :
 * commandes, messages, historique, adresses, suivi. Réutilise les pages Shop
 * existantes. (On vérifiera plus tard les doublons éventuels avec le Profil.)
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Package, MessageCircle, Star, Clock, MapPin, Truck, ChevronRight } from '@/lib/icons';
import ShopNav from '@/components/shop/ShopNav';

export default function ShopVousPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ display_name?: string | null; username?: string; avatar_url?: string | null } | null>(null);
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user || null)).catch(() => {});
  }, []);

  const Row = ({ icon: Icon, label, sub, onClick }: { icon: typeof Package; label: string; sub?: string; onClick: () => void }) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] text-left">
      <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-400/25 grid place-items-center text-red-300"><Icon className="w-5 h-5" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] text-white/95 font-medium">{label}</div>
        {sub && <div className="text-[12px] text-white/50">{sub}</div>}
      </div>
      <ChevronRight className="w-5 h-5 text-white/35" />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-[#0e0e12] text-white flex flex-col">
      <ShopNav />
      <header className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-white/8">
        <button onClick={() => router.push('/shop')} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold">Vous</h1>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto pb-24 md:pb-6">
        <div className="max-w-2xl mx-auto">
          {/* Profil mini */}
          <div className="flex items-center gap-3 p-4">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-white/10 grid place-items-center text-white/60 text-[20px] font-bold">
              {me?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
                : (me?.display_name || me?.username || '?')[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-semibold truncate">{me?.display_name || me?.username || 'Mon compte'}</div>
              {me?.username && <div className="text-[12.5px] text-white/50">@{me.username}</div>}
            </div>
          </div>

          <div className="mt-1 divide-y divide-white/5 border-y border-white/8">
            <Row icon={Package} label="Vos commandes" sub="Achats protégés en cours et passés" onClick={() => router.push('/shop/historique')} />
            <Row icon={MessageCircle} label="Messages" sub="Échanges & litiges avec les vendeurs" onClick={() => router.push('/shop/messages')} />
            <Row icon={Star} label="Avis" sub="Tes évaluations" onClick={() => router.push('/shop/historique')} />
          </div>

          <div className="mt-4 divide-y divide-white/5 border-y border-white/8">
            <Row icon={Clock} label="Historique" onClick={() => router.push('/shop/historique')} />
            <Row icon={MapPin} label="Adresses" onClick={() => router.push('/shop/adresse')} />
            <Row icon={Truck} label="Suivi de livraison (démo)" sub="Voir le déroulé d'une livraison" onClick={() => router.push('/shop/demo-livraison')} />
          </div>
        </div>
      </div>
    </div>
  );
}
