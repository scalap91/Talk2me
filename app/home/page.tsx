'use client';

import { useState, useEffect } from 'react';
import BottomNav from '@/components/chat/BottomNav';
import NativePush from '@/components/NativePush';
import PostFeed from '@/components/feed/PostFeed';
import FeedExitGuard from '@/components/system/FeedExitGuard';
import { MagnifyingGlass, Car, ForkKnife, Tag, Storefront, List } from '@phosphor-icons/react';

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
  // Barre du haut = MÊME que le natif : ☰ Achat (Annonces·Eat·Shop·Drive) · Tout/Amis/Autour · Recherche.
  const [scope, setScope] = useState<'all' | 'friends' | 'around'>('all'); // Tout · Amis · Autour
  const [achatOpen, setAchatOpen] = useState(false); // menu ☰ Achat (sections commerce)
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
        <PostFeed scope={scope} topPad={68} lat={pos?.lat ?? null} lng={pos?.lng ?? null} />
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
            const long = feedStyle === 'long';
            const idle = long ? '#fff' : 'var(--t2m-nav-idle)';
            const fg = long ? '#fff' : 'var(--t2m-ink, #2F343A)';
            const sh = long ? '0 1px 4px rgba(0,0,0,.55)' : undefined;
            const ico: React.CSSProperties = { background: 'none', border: 'none', color: idle, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: 0, ...(sh ? { textShadow: sh } : {}) };
            const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', ...(long ? { color: '#fff', textShadow: sh } : {}) };
            const tab = (key: 'all' | 'friends' | 'around', label: string) => {
              const on = scope === key;
              return (
                <button type="button" onClick={() => setScope(key)} style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0 11px' }}>
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: on ? 800 : 500, color: on ? fg : (long ? 'rgba(255,255,255,.62)' : 'var(--t2m-nav-idle)'), ...(sh ? { textShadow: sh } : {}) }}>{label}</span>
                  <span style={{ width: 16, height: 2.5, borderRadius: 2, background: on ? fg : 'transparent' }} />
                </button>
              );
            };
            // MÊME barre que le natif : ☰ Achat (gauche) · Tout/Amis/Autour (centre) · Recherche (droite).
            return (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button type="button" onClick={() => setAchatOpen(true)} aria-label="Achat" style={ico}>
                  <List weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Achat</span>
                </button>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  {tab('all', 'Tout')}{tab('friends', 'Amis')}{tab('around', 'Autour')}
                </div>
                <button type="button" onClick={() => { window.location.href = '/decouvrir'; }} aria-label="Rechercher" style={ico}>
                  <MagnifyingGlass weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Recherche</span>
                </button>
              </div>
            );
          })()}
        </header>
      </div>

      {/* Menu ☰ ACHAT — sections commerce regroupées (comme le natif). L'admin ON/OFF (shopSec)
          contrôle TOUJOURS quelles sections apparaissent : Annonces/Eat/Shop coupées → cachées ici. */}
      {achatOpen && (
        <div onClick={() => setAchatOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 448, margin: '0 auto', background: '#fff', borderRadius: '28px 28px 0 0', padding: '18px 0 calc(env(safe-area-inset-bottom) + 12px)' }}>
            <div style={{ padding: '0 20px 8px', fontFamily: "'Outfit',sans-serif", fontSize: 20, fontWeight: 800, color: '#2F343A' }}>Achat</div>
            {(() => {
              const goShop = (section: string) => { try { sessionStorage.setItem('t2m_shop_section', section); } catch {} setAchatOpen(false); window.location.href = '/shop'; };
              const items: { show: boolean; icon: React.ReactNode; label: string; sub: string; onClick: () => void }[] = [
                { show: shopSec.annonces !== false, icon: <Tag weight="duotone" style={{ width: 22, height: 22, color: '#FF7F11' }} />, label: 'Annonces', sub: 'Petites annonces', onClick: () => goShop('annonces') },
                { show: shopSec.eat !== false, icon: <ForkKnife weight="duotone" style={{ width: 22, height: 22, color: '#FF7F11' }} />, label: 'Eat', sub: 'Manger · livraison', onClick: () => goShop('plats') },
                { show: shopSec.boutique !== false, icon: <Storefront weight="duotone" style={{ width: 22, height: 22, color: '#FF7F11' }} />, label: 'Shop', sub: 'Boutiques', onClick: () => goShop('boutiques') },
                { show: true, icon: <Car weight="duotone" style={{ width: 22, height: 22, color: driveOnline ? '#007E3A' : '#FF7F11' }} />, label: 'Drive', sub: driveOnline ? 'Transport · tu es en ligne' : 'Transport', onClick: () => { setAchatOpen(false); window.location.href = '/drive'; } },
              ];
              return items.filter((i) => i.show).map((i) => (
                <button key={i.label} type="button" onClick={i.onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 0, cursor: 'pointer', padding: '10px 20px', textAlign: 'left' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,127,17,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i.icon}</div>
                  <div>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15, color: '#2F343A' }}>{i.label}</div>
                    <div style={{ fontSize: 12, color: '#6A7585' }}>{i.sub}</div>
                  </div>
                </button>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Règle d'or : on sort par le feed → double-tap pour quitter (façon TikTok). */}
      <FeedExitGuard />
      <BottomNav />
      {/* Bandeau « Active les notifications » RETIRÉ (Pascal 2026-07-05) — trop intrusif.
          Le push natif (APK) reste géré par <NativePush />. */}
      <NativePush />

    </div>
  );
}
