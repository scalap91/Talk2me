'use client';

import { useState, useEffect, useRef } from 'react';
import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';
import PushPrompt from '@/components/PushPrompt';
import NativePush from '@/components/NativePush';
import PostFeed from '@/components/feed/PostFeed';
import AnnoncesFeed from '@/components/feed/AnnoncesFeed';
import EatFeed from '@/components/feed/EatFeed';
import SheinStore from '@/components/shop/SheinStore';
import AdminEatPage from '@/app/admin/eat/page';
import CurationPage from '@/app/admin/curation/page';
import { useCardCreationStore } from '@/lib/card-creation-store';

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
  scope: 'all' | 'friends' | 'shop' | 'annonces' | 'eat';
  sort: 'recent' | 'popular';
};

const TABS: HubTab[] = [
  { k: 'tout', label: 'Hub', scope: 'all', sort: 'recent' },
  { k: 'amis', label: 'Amis', scope: 'friends', sort: 'recent' },
  { k: 'annonces', label: 'Annonces', scope: 'annonces', sort: 'popular' },
  { k: 'eat', label: 'Eat', scope: 'eat', sort: 'popular' },
  { k: 'shop', label: 'Shop', scope: 'shop', sort: 'popular' },
];

export default function HubPage() {
  const [tab, setTab] = useState('tout');
  const active = TABS.find((t) => t.k === tab) ?? TABS[0];
  const setShopMode = useCardCreationStore((s) => s.setShopMode);
  // Mode ADMIN : même appli, mais les onglets basculent sur leur version admin
  // (Shop → curation, Eat → gestion des fiches). Visible seulement si admin.
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [perms, setPerms] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (d?.user?.is_admin_capable) {
        setIsAdmin(true);
        setPerms(Array.isArray(d.user.permissions) ? d.user.permissions : []);
        if (typeof window !== 'undefined' && localStorage.getItem('t2m_admin_mode') === '1') setAdminMode(true);
      }
    }).catch(() => {});
  }, []);

  // Le toggle du mode admin vit dans le PROFIL (pas dans le header, pour ne pas
  // décaler le menu). On relit le flag au retour au premier plan.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && isAdmin) { try { setAdminMode(localStorage.getItem('t2m_admin_mode') === '1'); } catch { /* */ } } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isAdmin]);

  // Talk2Me #425 — deep-link depuis un aperçu produit du Hub : /home?hub=shop
  // ouvre directement le sous-onglet Shop (puis PostFeed scrolle sur #card-id).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = new URLSearchParams(window.location.search).get('hub');
    if (h && TABS.some((t) => t.k === h)) setTab(h);
  }, []);

  // Talk2Me — activer le mode Shop contextuel pour le bouton +
  useEffect(() => {
    setShopMode(active.scope === 'shop');
    return () => setShopMode(false);
  }, [active.scope, setShopMode]);

  // Swipe HORIZONTAL entre onglets (Tout → Amis → Populaire → Shop). On
  // distingue l'horizontal du scroll vertical du feed.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.6) return; // pas horizontal
    const idx = TABS.findIndex((x) => x.k === tab);
    const next = dx < 0 ? idx + 1 : idx - 1; // swipe gauche → onglet suivant
    if (next >= 0 && next < TABS.length) setTab(TABS[next].k);
  };

  return (
    <div className="relative flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-background overflow-hidden">
      {/* FEED PLEIN ÉCRAN : l'image du post monte jusqu'en haut (sous la barre
          batterie) et descend jusqu'au-dessus de la nav. Le header + onglets
          FLOTTENT par-dessus (transparents). Pour le Shop, on décale le contenu
          sous le header pour ne pas masquer la rangée Boutiques. */}
      <div
        className="flex-1 min-h-0 flex flex-col"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {active.scope !== 'shop' && active.scope !== 'annonces' && active.scope !== 'eat' && (
          <PostFeed
            key={active.k}
            scope={active.scope as 'all' | 'friends'}
            sort={active.sort}
            emptyText={
              active.scope === 'friends' ? (
                <>
                  Ton fil d&apos;amis est calme pour l&apos;instant.<br />
                  Les posts publiés par tes amis apparaîtront ici.<br />
                  Ajoute des amis depuis l&apos;onglet « Amis ».
                </>
              ) : undefined
            }
          />
        )}
      </div>

      {/* Header + onglets FLOTTANTS par-dessus le feed (transparents → l'image
          se voit dessous, du haut de l'écran). */}
      <div className="absolute top-0 inset-x-0 z-30 pointer-events-none bg-gradient-to-b from-black/65 via-black/35 to-transparent">
        <div className="pointer-events-auto">
          {/* Onglets DANS le header (même ligne que l'icône Drive), plus de titre. */}
          <ChatHeader
            transparent
            center={
              <div className="flex items-center gap-4">
                {TABS.map((t) => (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => setTab(t.k)}
                    className={
                      'shrink-0 py-1 text-[15px] font-semibold transition-colors drop-shadow whitespace-nowrap ' +
                      (tab === t.k ? 'text-red-300' : 'text-white/70 hover:text-white')
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            }
          />
        </div>
      </div>

      <BottomNav />
      <PushPrompt />
      <NativePush />

      {/* Boutique SHEIN en PLEIN ÉCRAN : couvre header + nav (z au-dessus de tout),
          fond blanc, du haut (sous la batterie) jusqu'en bas. Retour via le chevron. */}
      {active.scope === 'shop' && (
        adminMode && (perms.includes('boutique') || perms.includes('curation')) ? (
          <div className="fixed inset-0 z-[60] bg-[#0a0a14] overflow-y-auto overscroll-contain">
            <CurationPage onBack={() => setTab('tout')} />
          </div>
        ) : (
          <div className="fixed inset-0 z-[60] bg-white overflow-y-auto overscroll-contain">
            <SheinStore onBack={() => setTab('tout')} />
          </div>
        )
      )}

      {/* ANNONCES en PLEIN ÉCRAN (comme Shop) : couvre header + nav, bouton retour. */}
      {active.scope === 'annonces' && (
        <div className="fixed inset-0 z-[60] bg-[#0e0e12]">
          <AnnoncesFeed onBack={() => setTab('tout')} />
        </div>
      )}

      {/* EAT — normal (Uber Eats) ou, en mode admin, gestion des fiches. */}
      {active.scope === 'eat' && (
        <div className="fixed inset-0 z-[60] bg-[#0e0e12]">
          {adminMode && perms.includes('eat') ? <AdminEatPage onBack={() => setTab('tout')} /> : <EatFeed onBack={() => setTab('tout')} />}
        </div>
      )}

    </div>
  );
}
