'use client';

import { useState, useEffect } from 'react';
import BottomNav from '@/components/chat/BottomNav';
import NativePush from '@/components/NativePush';
import PostFeed from '@/components/feed/PostFeed';
import FeedExitGuard from '@/components/system/FeedExitGuard';
import { MagnifyingGlass, Car, ForkKnife, Tag, Storefront } from '@phosphor-icons/react';

/**
 * Talk2Me — Hub (Pascal 2026-06-07).
 * Le Hub = flux principal, avec des SOUS-ONGLETS de tri :
 *   Tout (date) · Amis (posts de mes amis) · Populaire (engagement).
 * Plus d'onglet "Cercle" séparé : le filtre amis vit ici. Le feed lui-même est
 * <PostFeed scope/sort> (composant partagé).
 */

export default function HubPage() {
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
  // Feed UNIQUE (Pascal 2026-07-06) : plus d'onglets Tout/Amis/Autour. Le système sert
  // un seul flux mixé et pose un BADGE d'origine (Amis / Autour / Tout) sur chaque post.
  // On récupère la position pour le badge "Autour" (silencieux si déjà autorisée).
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  // Style d'affichage (Cartes vs Long) — piloté par <html data-feed>. En Long, le menu
  // devient transparent, posé SUR la photo, icônes blanches (comme PostFeed lit le flag).
  const [feedStyle, setFeedStyle] = useState<'cards' | 'long'>('cards');
  useEffect(() => {
    const read = () => { const f = document.documentElement.dataset.feed; setFeedStyle(f === 'photo' || f === 'long' ? 'long' : 'cards'); };
    read();
    window.addEventListener('t2m:theme', read);
    return () => window.removeEventListener('t2m:theme', read);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
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
    // Reprise d'un brouillon Restaurant → la rubrique Acheter vit désormais dans /shop.
    try {
      const raw = sessionStorage.getItem('t2m_open_draft');
      if (raw && JSON.parse(raw)?.type === 'resto') { window.location.href = '/shop'; }
    } catch { /* */ }
  }, []);

  return (
    <div data-feed-page className="relative flex flex-col h-[100svh] w-full max-w-md mx-auto overflow-hidden" style={{ background: 'var(--t2m-feed-bg)' }}>
      {/* FEED PLEIN ÉCRAN : l'image du post monte jusqu'en haut (sous la barre
          batterie) et descend jusqu'au-dessus de la nav. Le header + onglets
          FLOTTENT par-dessus (transparents). Pour le Shop, on décale le contenu
          sous le header pour ne pas masquer la rangée Boutiques. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* FEED UNIQUE (Pascal 2026-07-06) : le système mixe amis + proximité + tendance
            et pose un badge d'origine sur chaque post. Plus d'onglets. */}
        <PostFeed topPad={68} lat={pos?.lat ?? null} lng={pos?.lng ?? null} />
      </div>

      {/* MENU DU HAUT — posé de Gemini (hub-gemini.html) : logo T2M + 🔍 🔔, puis pills. */}
      <div className="absolute top-0 inset-x-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <header style={feedStyle === 'long'
          // Long : transparent, posé SUR la photo + léger dégradé sombre pour lisibilité.
          // Bande noire tramée VISIBLE à travers TOUT le menu (icônes + labels), pas un simple liseré :
          // on tient le noir ~68% jusqu'aux labels puis on fond. (Pascal 2026-07-12 : « on ne la voyait pas »)
          ? { padding: '10px 16px 36px', backgroundColor: 'transparent', borderBottom: 'none', background: 'linear-gradient(to bottom, rgba(0,0,0,.92) 0%, rgba(0,0,0,.68) 50%, rgba(0,0,0,.34) 80%, rgba(0,0,0,0) 100%)' }
          // Cartes : barre blanche solide (actuel).
          : { padding: '10px 16px 8px', backgroundColor: 'var(--t2m-header-bg)', borderBottom: '1px solid var(--t2m-header-line)' }}>
          {(() => {
            const goShop = (section: string) => { try { sessionStorage.setItem('t2m_shop_section', section); } catch {} window.location.href = '/shop'; };
            const long = feedStyle === 'long';
            const idle = long ? '#fff' : 'var(--t2m-nav-idle)';
            const ico = (color: string): React.CSSProperties => ({ background: 'none', border: 'none', color, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: 0, flex: 1, ...(long ? { textShadow: '0 1px 4px rgba(0,0,0,.55)' } : {}) });
            const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: 0, lineHeight: 1, whiteSpace: 'nowrap', ...(long ? { color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.55)' } : {}) };
            return (
              // Header SANS logo : 5 icônes réparties À ÉGALITÉ sur toute la largeur (colonnes égales, comme la barre du bas). Recherche tout à droite. (Pascal 2026-07-06)
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {shopSec.annonces && <button type="button" onClick={() => goShop('annonces')} aria-label="Annonces" style={ico(idle)}><Tag weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Annonces</span></button>}
                {shopSec.eat && <button type="button" onClick={() => goShop('plats')} aria-label="Eat" style={ico(idle)}><ForkKnife weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Eat</span></button>}
                {shopSec.boutique && <button type="button" onClick={() => goShop('boutiques')} aria-label="Shop" style={ico(idle)}><Storefront weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Shop</span></button>}
                <button type="button" onClick={() => { window.location.href = '/drive'; }} aria-label="Talk N Drive" style={ico(driveOnline ? '#007E3A' : idle)}><Car weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Drive</span></button>
                <button type="button" onClick={() => { window.location.href = '/decouvrir'; }} aria-label="Rechercher" style={ico(idle)}><MagnifyingGlass weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Recherche</span></button>
              </div>
            );
          })()}
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
