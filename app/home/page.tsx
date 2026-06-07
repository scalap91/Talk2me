'use client';

import { useState } from 'react';
import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';
import PostFeed from '@/components/feed/PostFeed';

/**
 * Talk2Me — Hub (Pascal 2026-06-07).
 * Le Hub = flux principal, avec des SOUS-ONGLETS de tri :
 *   Tout (date) · Amis (posts de mes amis) · Populaire (engagement).
 * Plus d'onglet "Cercle" séparé : le filtre amis vit ici. Le feed lui-même est
 * <PostFeed scope/sort> (composant partagé).
 */

type HubTab = {
  k: string;
  label: string;
  scope: 'all' | 'friends' | 'shop';
  sort: 'recent' | 'popular';
};

const TABS: HubTab[] = [
  { k: 'tout', label: 'Tout', scope: 'all', sort: 'recent' },
  { k: 'amis', label: 'Amis', scope: 'friends', sort: 'recent' },
  { k: 'populaire', label: 'Populaire', scope: 'all', sort: 'popular' },
  { k: 'shop', label: 'Shop', scope: 'shop', sort: 'popular' },
];

export default function HubPage() {
  const [tab, setTab] = useState('tout');
  const active = TABS.find((t) => t.k === tab) ?? TABS[0];

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-background overflow-hidden">
      <ChatHeader />

      {/* Sous-onglets de tri du Hub */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-white/8 bg-[#0e0e12]/70 backdrop-blur-xl overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={
              'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ' +
              (tab === t.k
                ? 'bg-violet-500/15 border-violet-400/30 text-violet-100'
                : 'bg-transparent border-white/8 text-white/55 hover:text-white/80')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* key=active.k → remonte le feed proprement au changement de tri */}
      <PostFeed
        key={active.k}
        scope={active.scope}
        sort={active.sort}
        emptyText={
          active.scope === 'friends' ? (
            <>
              Ton fil d&apos;amis est calme pour l&apos;instant.<br />
              Les posts publiés par tes amis apparaîtront ici.<br />
              Ajoute des amis depuis l&apos;onglet « Amis ».
            </>
          ) : active.scope === 'shop' ? (
            <>
              Le Shop se remplit.<br />
              Les produits tendance poussés par T2M Officiel apparaîtront ici.
            </>
          ) : undefined
        }
      />

      <BottomNav />
    </div>
  );
}
