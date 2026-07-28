'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Découvrir / Recherche — FIDÈLE à la maquette Gemini recherche-gemini.png :
 * vue unique empilée → « Résultats Comptes » (cartes + Suivre) · « Résultats Boutiques »
 * (cartes) · « Recherches récentes » (chips). Pas de grille d'images.
 * Données RÉELLES : /api/friends/search (comptes) + /api/friends/add (Suivre) +
 * posts boutique (scope=shop) pour les boutiques. Zéro data inventée.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from '@/lib/icons';
import BottomNav from '@/components/chat/BottomNav';

interface UserHit { id: string; username: string; display_name: string | null; is_friend: boolean; }
interface Shop { id: string; name: string; subtitle?: string | null; href: string; }
type Tab = 'comptes' | 'cards' | 'boutiques';
const TABS: [Tab, string][] = [['cards', 'Cards'], ['comptes', 'Comptes'], ['boutiques', 'Boutiques']];
// L'onglet actif remonte SA section en premier (Pascal 2026-07-03).
const ORDER: Record<Tab, Tab[]> = {
  comptes: ['comptes', 'cards', 'boutiques'],
  cards: ['cards', 'comptes', 'boutiques'],
  boutiques: ['boutiques', 'comptes', 'cards'],
};

export default function DecouvrirPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('cards');
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<UserHit[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [cards, setCards] = useState<{ id: string; media_url: string | null; caption: string | null }[]>([]);
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

  // Recherche RÉELLE — comptes (friends/search) + boutiques (posts scope=shop), débounce.
  useEffect(() => {
    setSearching(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const [u, s, c] = await Promise.all([
          fetch(ql ? `/api/friends/search?q=${encodeURIComponent(ql)}` : '/api/friends/search?browse=1', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
          fetch(ql ? `/api/boutiques/search?q=${encodeURIComponent(ql)}` : '/api/boutiques/search?browse=1', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
          fetch(ql ? `/api/posts?q=${encodeURIComponent(ql)}&limit=30` : `/api/posts?sort=popular&limit=60`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
        ]);
        setUsers(u?.users ?? []);
        type P = { id: string; media_url?: string | null; caption?: string; text?: string; kind?: string; author?: { display_name?: string; username?: string } };
        setShops(s?.boutiques ?? []);
        // Cards : recherche = VRAI moteur FTS5 (?q=, filtré serveur, rang BM25) ; browse = top populaire.
        // Plus de re-filtre client (qui ratait tout ce qui n'était pas dans le top-60 populaire).
        const cardHits = (c?.items ?? []).filter((it: P) => it.kind !== 'boutique' && !!it.media_url).slice(0, 18)
          .map((it: P) => ({ id: it.id, media_url: it.media_url ?? null, caption: it.caption ?? null }));
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
        {cards.length === 0 ? (
          <p className="text-[#9DAAB7] text-[14px]">Aucune card.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {cards.map((c) => (
              <button key={c.id} type="button" onClick={() => openCard(c.id)} className="relative aspect-square rounded-xl overflow-hidden bg-[#EDF0F4] active:opacity-80">
                {c.media_url && <img src={c.media_url} alt={c.caption || ''} className="w-full h-full object-cover" />}
              </button>
            ))}
          </div>
        )}
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
