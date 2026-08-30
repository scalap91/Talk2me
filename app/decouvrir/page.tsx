'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Découvrir / Recherche. Onglets (l'actif remonte sa section) :
 *   Cards · Comptes · Boutiques · Annonces · Eat · Vidéo · Musique.
 * Sources RÉELLES, zéro data inventée :
 *   • Cards / Vidéo / Musique → /api/posts?q= (moteur FTS5 : description + hashtags + auteur) ;
 *     rendus par le LECTEUR UNIQUE (FeedMini→AlignedPostCard). Vidéo/Musique = facettes des cards.
 *   • Comptes → /api/friends/search  • Boutiques → /api/boutiques/search
 *   • Annonces + Eat → /api/simple-shop/discover (familles commerce, hors index cards).
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from '@/lib/icons';
import BottomNav from '@/components/chat/BottomNav';
import CardDevButton from '@/components/dev/CardDevButton';
import FeedMini, { type CardItem } from '@/components/feed/FeedMini';

interface UserHit { id: string; username: string; display_name: string | null; is_friend: boolean; }
interface Shop { id: string; name: string; subtitle?: string | null; href: string; }
interface Hit { id: string; title: string; subtitle: string | null; image: string | null; href: string | null }
type Tab = 'cards' | 'comptes' | 'boutiques' | 'annonces' | 'eat' | 'video' | 'musique';
const TABS: [Tab, string][] = [['cards', 'Cards'], ['comptes', 'Comptes'], ['boutiques', 'Boutiques'], ['annonces', 'Annonces'], ['eat', 'Eat'], ['video', 'Vidéo'], ['musique', 'Musique']];
const ALL_TABS: Tab[] = TABS.map(([k]) => k);
// L'onglet actif remonte SA section en premier, le reste suit dans l'ordre (Pascal 2026-07-03).
const ORDER = Object.fromEntries(ALL_TABS.map((t) => [t, [t, ...ALL_TABS.filter((x) => x !== t)]])) as Record<Tab, Tab[]>;

export default function DecouvrirPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('cards');
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<UserHit[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [extra, setExtra] = useState<{ annonces: Hit[]; eat: Hit[] }>({ annonces: [], eat: [] });
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);

  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { try { setRecent(JSON.parse(localStorage.getItem('t2m_recent_search') || '[]')); } catch { /* */ } }, []);
  const saveRecent = (term: string) => {
    const t = term.trim(); if (!t) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
      try { localStorage.setItem('t2m_recent_search', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  };

  const ql = q.trim();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recherche RÉELLE, débouncée — comptes + boutiques + cards (FTS5) + annonces/eat (discover).
  useEffect(() => {
    setSearching(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const [u, s, c, x] = await Promise.all([
          fetch(ql ? `/api/friends/search?q=${encodeURIComponent(ql)}` : '/api/friends/search?browse=1', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
          fetch(ql ? `/api/boutiques/search?q=${encodeURIComponent(ql)}` : '/api/boutiques/search?browse=1', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
          fetch(ql ? `/api/posts?q=${encodeURIComponent(ql)}&limit=40` : `/api/posts?sort=popular&limit=60`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
          fetch(ql ? `/api/simple-shop/discover?q=${encodeURIComponent(ql)}` : `/api/simple-shop/discover`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
        ]);
        setUsers(u?.users ?? []);
        setShops(s?.boutiques ?? []);
        setExtra({ annonces: x?.annonces ?? [], eat: x?.eat ?? [] });
        // Cards : recherche = VRAI moteur FTS5 (?q=, filtré serveur sur description+hashtags+auteur,
        // rang BM25) ; browse = top populaire. On garde l'ITEM FEED COMPLET et on le rend via le
        // LECTEUR UNIQUE (FeedMini→AlignedPostCard) — donc une card TEXTE / sans image (trouvée par
        // sa description ou son hashtag) apparaît enfin. On exclut juste les vitrines boutique
        // (elles ont leur propre onglet). Pascal 2026-08-30.
        const cardHits = ((c?.items ?? []) as CardItem[])
          .filter((it) => (it as { kind?: string }).kind !== 'boutique')
          .slice(0, 24);
        setCards(cardHits);
      } catch { setUsers([]); setShops([]); setCards([]); }
      setSearching(false);
    }, ql ? 350 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [ql]);

  async function follow(u: UserHit) {
    if (followed.has(u.id) || u.is_friend) return;
    setFollowed((s) => new Set(s).add(u.id));
    try { await fetch('/api/friends/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_id: u.id }) }); } catch { /* */ }
  }

  const openCard = (id: string) => { saveRecent(q); try { sessionStorage.setItem('t2m_feed_focus', id); } catch { /* */ } router.push('/home', { scroll: false }); };

  // Vidéo & Musique = FACETTES des cards déjà trouvées (mêmes .card, même lecteur unique) :
  // vidéo = type 'video' ; musique = card qui porte un audio attaché (disque musique).
  const videoCards = cards.filter((c) => (c as { type?: string }).type === 'video');
  const musicCards = cards.filter((c) => !!(c as { attached_audio_json?: unknown }).attached_audio_json);

  // Grille de cards via le LECTEUR UNIQUE (FeedMini) — commun à Cards/Vidéo/Musique.
  const cardGrid = (list: CardItem[], empty: string) => list.length === 0
    ? <p className="text-[#9DAAB7] text-[14px]">{empty}</p>
    : (
      <div className="grid grid-cols-2 gap-2.5 items-start">
        {list.map((c) => {
          const id = (c as { id: string }).id;
          return (
            <div key={id} className="relative">
              <button type="button" onClick={() => openCard(id)} className="block w-full text-left rounded-2xl overflow-hidden border border-[#E7EAF0] bg-white active:opacity-90">
                <FeedMini item={c} />
              </button>
              {id && <CardDevButton cardId={id} className="absolute right-1.5 top-1.5 z-40" />}
            </div>
          );
        })}
      </div>
    );

  // Lignes fiche (annonces / eat) — lien vers la vraie fiche /b/<key>. Pas un renderer de card.
  const hitRows = (list: Hit[], empty: string, icon: string) => list.length === 0
    ? <p className="text-[#9DAAB7] text-[14px]">{empty}</p>
    : <>{list.map((h) => (
        <button key={h.id} type="button" onClick={() => { saveRecent(q); if (h.href) router.push(h.href); }}
          className="w-full flex items-center bg-white rounded-[18px] shadow-[0_4px_16px_rgba(47,52,58,0.06)] p-3 mb-3 text-left">
          {h.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={h.image} alt="" className="w-[50px] h-[50px] rounded-xl mr-3.5 object-cover shrink-0 bg-[#EDF0F4]" />
            : <div className="w-[50px] h-[50px] rounded-xl mr-3.5 grid place-items-center text-[22px] shrink-0 bg-[#EDF0F4]">{icon}</div>}
          <div className="min-w-0">
            <div className="text-[16px] font-semibold text-[#2F343A] truncate">{h.title}</div>
            {h.subtitle && <div className="text-[14px] text-[#6A7585] truncate">{h.subtitle}</div>}
          </div>
        </button>
      ))}</>;

  const sections: Record<Tab, React.ReactNode> = {
    comptes: (
      <section className="mb-6">
        <h2 className="text-[18px] font-bold text-[#2F343A] mb-3.5" style={{ fontFamily: "'Outfit', sans-serif" }}>Résultats Comptes</h2>
        {searching && users.length === 0 ? (
          <p className="text-[#9DAAB7] text-[14px]">Recherche…</p>
        ) : users.length === 0 ? (
          <p className="text-[#9DAAB7] text-[14px]">Aucun compte.</p>
        ) : users.map((u) => {
          const name = u.display_name || u.username;
          const isF = u.is_friend || followed.has(u.id);
          return (
            <div key={u.id} className="flex items-center bg-white rounded-[18px] shadow-[0_4px_16px_rgba(47,52,58,0.06)] p-3.5 mb-3.5">
              <div className="w-[50px] h-[50px] rounded-full mr-3.5 grid place-items-center text-white text-[20px] font-bold shrink-0" style={{ background: 'radial-gradient(circle at 50% 35%,#FFB86B,#FF7F11)', fontFamily: "'Outfit',sans-serif" }}>{name.charAt(0).toUpperCase()}</div>
              <button type="button" onClick={() => router.push('/u/' + u.username)} className="flex-1 min-w-0 text-left">
                <div className="text-[16px] font-semibold text-[#2F343A] truncate">{name}</div>
                <div className="text-[14px] text-[#6A7585] truncate">@{u.username}</div>
              </button>
              <button type="button" onClick={() => follow(u)} disabled={isF}
                className={`shrink-0 text-[14px] font-semibold px-4 py-2 rounded-full transition ${isF ? 'bg-[#F5F6F8] text-[#9DAAB7]' : 'bg-[#FF7F11] text-white active:scale-95'}`}>{isF ? 'Suivi' : 'Suivre'}</button>
            </div>
          );
        })}
      </section>
    ),
    cards: (
      <section className="mb-6">
        <h2 className="text-[18px] font-bold text-[#2F343A] mb-3.5" style={{ fontFamily: "'Outfit', sans-serif" }}>Résultats Cards</h2>
        {cardGrid(cards, 'Aucune card.')}
      </section>
    ),
    boutiques: (
      <section className="mb-6">
        <h2 className="text-[18px] font-bold text-[#2F343A] mb-3.5" style={{ fontFamily: "'Outfit', sans-serif" }}>Résultats Boutiques</h2>
        {shops.length === 0 ? (
          <p className="text-[#9DAAB7] text-[14px]">Aucune boutique.</p>
        ) : shops.map((s) => (
          <button key={s.id} type="button" onClick={() => { saveRecent(q); router.push(s.href); }}
            className="w-full flex items-center bg-white rounded-[18px] shadow-[0_4px_16px_rgba(47,52,58,0.06)] p-3.5 mb-3.5 text-left">
            <div className="w-[50px] h-[50px] rounded-xl mr-3.5 grid place-items-center text-[24px] shrink-0 bg-[#EDF0F4]">🛍️</div>
            <div className="min-w-0">
              <div className="text-[16px] font-semibold text-[#2F343A] truncate">{s.name}</div>
              {s.subtitle && <div className="text-[14px] text-[#6A7585] truncate">{s.subtitle}</div>}
            </div>
          </button>
        ))}
      </section>
    ),
    annonces: (
      <section className="mb-6">
        <h2 className="text-[18px] font-bold text-[#2F343A] mb-3.5" style={{ fontFamily: "'Outfit', sans-serif" }}>Résultats Annonces</h2>
        {hitRows(extra.annonces, 'Aucune annonce.', '🏷️')}
      </section>
    ),
    eat: (
      <section className="mb-6">
        <h2 className="text-[18px] font-bold text-[#2F343A] mb-3.5" style={{ fontFamily: "'Outfit', sans-serif" }}>Résultats Eat</h2>
        {hitRows(extra.eat, 'Aucun resto ni plat.', '🍽️')}
      </section>
    ),
    video: (
      <section className="mb-6">
        <h2 className="text-[18px] font-bold text-[#2F343A] mb-3.5" style={{ fontFamily: "'Outfit', sans-serif" }}>Résultats Vidéo</h2>
        {cardGrid(videoCards, 'Aucune vidéo.')}
      </section>
    ),
    musique: (
      <section className="mb-6">
        <h2 className="text-[18px] font-bold text-[#2F343A] mb-3.5" style={{ fontFamily: "'Outfit', sans-serif" }}>Résultats Musique</h2>
        {cardGrid(musicCards, 'Aucune musique.')}
      </section>
    ),
  };

  return (
    <main className="fixed inset-0 bg-[#F5F6F8] flex flex-col">
      {/* Header — barre de recherche PLEINE LARGEUR (maquette : pas de flèche retour). */}
      <header className="shrink-0 bg-white border-b border-[#E7EAF0] px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4">
        <div className="flex items-center gap-2.5 bg-[#F5F6F8] rounded-full px-4 h-12">
          <Search className="w-5 h-5 text-[#9DAAB7]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveRecent(q); }} placeholder="Rechercher..." className="flex-1 bg-transparent outline-none text-[16px] text-[#2F343A] placeholder-[#9DAAB7]" />
        </div>
      </header>
      {/* Onglets sur le fond gris, sous le header (maquette). */}
      <div className="shrink-0 flex gap-2.5 px-5 py-4 overflow-x-auto no-scrollbar">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`shrink-0 px-4 py-2 rounded-full text-[14px] font-medium transition ${tab === k ? 'bg-[#FF7F11] text-white' : 'text-[#6A7585]'}`}>{label}</button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-8">
        {/* Sections de résultats — TOUJOURS affichées (vide = tout, lettre = filtré), réordonnées par onglet. */}
        {ORDER[tab].map((k) => <div key={k}>{sections[k]}</div>)}

        {/* RECHERCHES RÉCENTES */}
        {recent.length > 0 && (
          <section>
            <h2 className="text-[18px] font-bold text-[#2F343A] mb-3.5" style={{ fontFamily: "'Outfit', sans-serif" }}>Recherches récentes</h2>
            <div className="flex flex-wrap gap-2.5">
              {recent.map((term) => (
                <button key={term} type="button" onClick={() => setQ(term)} className="bg-[#F5F6F8] text-[#6A7585] text-[14px] font-medium px-4 py-2 rounded-full active:scale-95 transition">{term}</button>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Barre de navigation du bas (maquette). */}
      <BottomNav />
    </main>
  );
}
