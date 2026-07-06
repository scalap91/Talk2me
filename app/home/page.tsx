'use client';

import { useState, useEffect, useRef } from 'react';
import BottomNav from '@/components/chat/BottomNav';
import NativePush from '@/components/NativePush';
import PostFeed from '@/components/feed/PostFeed';
import AroundFeed from '@/components/feed/AroundFeed';
import FeedExitGuard from '@/components/system/FeedExitGuard';
import { MagnifyingGlass, Car, Users, ForkKnife, Tag, Storefront, MapPin } from '@phosphor-icons/react';

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
  // « Autour » (Pascal 2026-07-05) : le contenu géolocalisé le plus PROCHE de l'user.
  { k: 'autour', label: 'Autour', scope: 'all', sort: 'recent' },
  // 'Acheter' retiré du Hub (Pascal 2026-06-20) → page /shop (icône du menu du bas).
];

export default function HubPage() {
  const [tab, setTab] = useState('tout');
  const active = TABS.find((t) => t.k === tab) ?? TABS[0];
  // Mode ADMIN : même appli, mais les onglets basculent sur leur version admin
  // (Shop → curation, Eat → gestion des fiches). Visible seulement si admin.
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [perms, setPerms] = useState<string[]>([]);
  // Sections marché ON/OFF (sélecteur admin) : les icônes Eat/Annonces/Shop du header
  // doivent DISPARAÎTRE quand la section est coupée (Pascal 2026-07-05). Sinon elles
  // restaient affichées et retombaient sur Annonces (fallback du hub).
  // Anti-flash (Pascal 2026-07-05) : on initialise depuis le dernier état mémorisé pour
  // que le 1ᵉʳ rendu soit DÉJÀ correct (sinon les icônes coupées réapparaissent puis
  // s'effacent en un quart de seconde — le « fantôme »).
  const [shopSec, setShopSec] = useState<Record<string, boolean>>(() => {
    try { const c = sessionStorage.getItem('t2m_shop_sec'); if (c) return JSON.parse(c); } catch { /* */ }
    return { eat: true, annonces: true, boutique: true };
  });
  useEffect(() => {
    fetch('/api/shop/state', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.sections) { setShopSec((p) => ({ ...p, ...d.sections })); try { sessionStorage.setItem('t2m_shop_sec', JSON.stringify(d.sections)); } catch { /* */ } }
    }).catch(() => {});
  }, []);
  // Drive : icône VERTE 🇲🇬 quand le user est EN LIGNE comme chauffeur (Pascal 2026-07-05).
  const [driveOnline, setDriveOnline] = useState(false);
  useEffect(() => {
    const check = () => { fetch('/api/drive/driver', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((d) => setDriveOnline(!!d?.profile?.is_online)).catch(() => {}); };
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); }; // re-check au retour (toggle fait dans /drive)
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    // Cohérence auth : si la session n'est PAS valide (cookie absent/périmé), /home
    // ne doit plus afficher une coquille « connecté » trompeuse — on renvoie à
    // /signin comme /profile, /wallet, etc. (sinon : « loggé sur une page, pas les
    // autres »). Le 401 = navigateur courant non authentifié (desktop ≠ mobile).
    fetch('/api/auth/me', { cache: 'no-store' }).then(async (r) => {
      if (!r.ok) { window.location.replace('/signin'); return; }
      const d = await r.json();
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
    if (h === 'acheter' || h === 'shop') { window.location.href = '/shop'; return; }
    if (h && TABS.some((t) => t.k === h)) setTab(h);
    // Reprise d'un brouillon Restaurant → la rubrique Acheter vit désormais dans /shop.
    try {
      const raw = sessionStorage.getItem('t2m_open_draft');
      if (raw && JSON.parse(raw)?.type === 'resto') { window.location.href = '/shop'; }
    } catch { /* */ }
  }, []);

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
    <div data-feed-page className="relative flex flex-col h-[100svh] w-full max-w-md mx-auto bg-background overflow-hidden">
      {/* FEED PLEIN ÉCRAN : l'image du post monte jusqu'en haut (sous la barre
          batterie) et descend jusqu'au-dessus de la nav. Le header + onglets
          FLOTTENT par-dessus (transparents). Pour le Shop, on décale le contenu
          sous le header pour ne pas masquer la rangée Boutiques. */}
      <div
        className="flex-1 min-h-0 flex flex-col"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {active.k === 'autour' ? (
          // « Autour » : contenu géolocalisé le plus proche (annonces), pas le PostFeed.
          <AroundFeed />
        ) : (
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

      {/* MENU DU HAUT — posé de Gemini (hub-gemini.html) : logo T2M + 🔍 🔔, puis pills. */}
      <div className="absolute top-0 inset-x-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E7EAF0' }}>
          {/* Le logo T2M EST le feed / la première page (Pascal 2026-07-04) → tap = retour au Hub.
              Accroche « le marché du peuple » juste dessous (Pascal 2026-07-05). */}
          {/* UN SEUL BLOC (T2M + accroche) : tout gris, tout ORANGE quand le Hub est sélectionné (Pascal 2026-07-05). */}
          <button type="button" onClick={() => setTab('tout')} aria-label="Accueil / Feed" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, color: tab === 'tout' ? '#FF7F11' : '#6A7585', transition: 'color .15s' }}>
            <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 16, lineHeight: 1, color: 'inherit' }}>T2M</span>
            <span style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 0.1, marginTop: 2, lineHeight: 1.15, textAlign: 'center', whiteSpace: 'nowrap', color: 'inherit', opacity: 0.8 }}>LE MARCHÉ<br />du peuple</span>
          </button>
          {/* Icônes AVEC label sous chacune (Pascal 2026-07-05) : Amis · Eat · Annonces · Shop · Recherche · Drive. */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
            {(() => {
              const btn = (color: string): React.CSSProperties => ({ background: 'none', border: 'none', color, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 0, width: 44 });
              const lbl: React.CSSProperties = { fontSize: 8.5, fontWeight: 600, letterSpacing: 0, lineHeight: 1, whiteSpace: 'nowrap' };
              const goShop = (section: string) => { try { sessionStorage.setItem('t2m_shop_section', section); } catch {} window.location.href = '/shop'; };
              return (
                <>
                  <button type="button" onClick={() => setTab('amis')} aria-label="Amis" style={btn(tab === 'amis' ? '#FF7F11' : '#6A7585')}><Users size={22} weight="duotone" /><span style={lbl}>Amis</span></button>
                  <button type="button" onClick={() => setTab('autour')} aria-label="Autour" style={btn(tab === 'autour' ? '#FF7F11' : '#6A7585')}><MapPin size={22} weight="duotone" /><span style={lbl}>Autour</span></button>
                  {shopSec.eat && <button type="button" onClick={() => goShop('plats')} aria-label="Eat" style={btn('#6A7585')}><ForkKnife size={22} weight="duotone" /><span style={lbl}>Eat</span></button>}
                  {shopSec.annonces && <button type="button" onClick={() => goShop('annonces')} aria-label="Annonces" style={btn('#6A7585')}><Tag size={22} weight="duotone" /><span style={lbl}>Annonces</span></button>}
                  {shopSec.boutique && <button type="button" onClick={() => goShop('boutiques')} aria-label="Shop" style={btn('#6A7585')}><Storefront size={22} weight="duotone" /><span style={lbl}>Shop</span></button>}
                  <button type="button" onClick={() => { window.location.href = '/decouvrir'; }} aria-label="Rechercher" style={btn('#6A7585')}><MagnifyingGlass size={22} weight="duotone" /><span style={lbl}>Recherche</span></button>
                  <button type="button" onClick={() => { window.location.href = '/drive'; }} aria-label="Talk N Drive" style={btn(driveOnline ? '#007E3A' : '#6A7585')}><Car size={22} weight="duotone" /><span style={lbl}>Drive</span></button>
                </>
              );
            })()}
          </div>
        </header>
      </div>

      {/* Règle d'or : on sort par le feed → double-tap pour quitter (façon TikTok). */}
      <FeedExitGuard />
      <BottomNav />
      {/* Bandeau « Active les notifications » RETIRÉ (Pascal 2026-07-05) — trop intrusif.
          Le push natif (APK) reste géré par <NativePush />. */}
      <NativePush />

    </div>
  );
}
