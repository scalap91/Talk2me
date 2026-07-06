'use client';

/**
 * Talk2Me — Commentaires du feed (Pascal 2026-06-24).
 *  - DESKTOP : colonne commentaires FIXE à droite, TOUJOURS visible, qui suit le post
 *    affiché (écoute ttm:feed:active). Le feed est décalé à gauche. Post à gauche,
 *    commentaires à droite, en permanence.
 *  - MOBILE : on ouvre au clic sur 💬 (ttm:comments:open) → le post rétrécit (38vh),
 *    panneau commentaires en bas (62vh), style TikTok.
 * Monté une seule fois (layout).
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Send, Trash2, Loader2 } from '@/lib/icons';

interface CItem {
  id: string; body: string; created_at: number; is_mine: boolean;
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}
type Target = { kind: 'direct_card' | 'post'; id: string };

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "à l'instant";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h`;
  return `${Math.floor(d / 86_400_000)} j`;
}

export default function CommentsHost() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [items, setItems] = useState<CItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Détection desktop (lg ≥ 1024px) + suivi resize.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const upd = () => setIsDesktop(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  const load = useCallback(async (t: Target) => {
    setLoading(true);
    try {
      const d = await fetch(`/api/cards/${encodeURIComponent(t.id)}/comments?kind=${t.kind}`, { cache: 'no-store' }).then((r) => r.json());
      if (d?.ok) setItems(d.comments || []);
    } catch { /* */ }
    setLoading(false);
  }, []);

  // Clic sur 💬 (mobile : ouvre la feuille ; desktop : recale la colonne sur cette card).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const det = (e as CustomEvent).detail as Target;
      if (!det?.id || !det?.kind) return;
      setTarget(det); setItems([]); load(det);
      if (!window.matchMedia('(min-width: 1024px)').matches) setMobileOpen(true);
    };
    window.addEventListener('ttm:comments:open', onOpen as EventListener);
    return () => window.removeEventListener('ttm:comments:open', onOpen as EventListener);
  }, [load]);

  // Desktop : la colonne suit la card active du feed (scroll). Mobile : ignore.
  useEffect(() => {
    const onActive = (e: Event) => {
      if (!window.matchMedia('(min-width: 1024px)').matches) return;
      const det = (e as CustomEvent).detail as Target;
      if (!det?.id || !det?.kind) return;
      setTarget((prev) => (prev && prev.id === det.id && prev.kind === det.kind ? prev : det));
      setItems([]); load(det);
    };
    const onInactive = () => { if (window.matchMedia('(min-width: 1024px)').matches) { setTarget(null); setItems([]); } };
    window.addEventListener('ttm:feed:active', onActive as EventListener);
    window.addEventListener('ttm:feed:inactive', onInactive as EventListener);
    return () => {
      window.removeEventListener('ttm:feed:active', onActive as EventListener);
      window.removeEventListener('ttm:feed:inactive', onInactive as EventListener);
    };
  }, [load]);

  // Rétrécit / décale le feed. Desktop : décalage gauche permanent tant que la colonne
  // est là. Mobile : 38vh seulement quand la feuille est ouverte.
  useEffect(() => {
    if (isDesktop && target) {
      // Desktop : on CENTRE le bloc (feed + commentaires) ensemble, et on COLLE le
      // panneau commentaires juste à droite du feed → plus de vide au milieu.
      const page = document.querySelector('[data-feed-page]') as HTMLElement | null;
      const rail = document.querySelector('[data-comments-rail]') as HTMLElement | null;
      if (!page) return;
      const sidebar = 240; // largeur sidebar (w-60)
      const railW = window.matchMedia('(min-width:1536px)').matches ? 680
        : window.matchMedia('(min-width:1280px)').matches ? 560 : 440;
      const feedW = page.offsetWidth || 448;
      const avail = window.innerWidth - sidebar;
      const tx = railW / 2;                              // décale le feed à gauche
      const feedLeft = sidebar + (avail - feedW) / 2 - tx;
      const feedRight = feedLeft + feedW;                // bord droit du feed
      const prevP = page.getAttribute('style') || '';
      page.style.marginLeft = 'auto'; page.style.marginRight = 'auto';
      page.style.transform = `translateX(-${tx}px)`;
      page.style.transition = 'transform .2s ease';
      let prevR = '';
      if (rail) {
        prevR = rail.getAttribute('style') || '';
        rail.style.left = `${Math.max(sidebar, feedRight)}px`; // collé au feed
        rail.style.right = 'auto';
      }
      return () => { page.setAttribute('style', prevP); if (rail) rail.setAttribute('style', prevR); };
    }
    if (!isDesktop && mobileOpen) {
      // Mobile : le post rétrécit en haut (38vh), commentaires en bas.
      const el = document.querySelector('[data-feed-scroller]') as HTMLElement | null;
      if (!el) return;
      const prev = el.getAttribute('style') || '';
      el.style.height = '38vh';
      el.style.flex = 'none';
      el.style.transition = 'height .25s ease';
      return () => { el.setAttribute('style', prev); };
    }
  }, [isDesktop, target, mobileOpen]);

  const closeMobile = () => { setMobileOpen(false); setText(''); };

  const send = async () => {
    const t = target; const body = text.trim();
    if (!t || !body || sending) return;
    setSending(true);
    try {
      const d = await fetch(`/api/cards/${encodeURIComponent(t.id)}/comments?kind=${t.kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      }).then((r) => r.json());
      if (d?.ok) {
        setText('');
        await load(t);
        window.dispatchEvent(new CustomEvent('ttm:comments:count', { detail: { kind: t.kind, id: t.id, count: d.count } }));
      } else if (d?.error === 'unauthorized') {
        alert('Connecte-toi pour commenter.');
      }
    } catch { /* */ }
    setSending(false);
  };

  const del = async (id: string) => {
    const t = target; if (!t) return;
    try {
      const d = await fetch(`/api/cards/${encodeURIComponent(t.id)}/comments?comment=${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => r.json());
      if (d?.ok) {
        setItems((prev) => prev.filter((c) => c.id !== id));
        window.dispatchEvent(new CustomEvent('ttm:comments:count', { detail: { kind: t.kind, id: t.id, count: d.count } }));
      }
    } catch { /* */ }
  };

  // Contenu commun (header + liste + champ).
  const panel = (
    <>
      <header className="relative flex items-center justify-center h-14 border-b border-[#E7EAF0] shrink-0">
        <span className="inline-flex items-baseline gap-1.5 text-[17px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>
          Commentaires <span className="text-[14px] font-semibold text-[#9DAAB7]">{items.length}</span>
        </span>
        {!isDesktop && (
          <button onClick={closeMobile} aria-label="Fermer" className="absolute right-3 w-8 h-8 grid place-items-center text-[#6A7585]"><X size={20} /></button>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-8 text-[#9DAAB7]"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-[#9DAAB7] text-[13.5px] py-10">Aucun commentaire. Sois le premier 💬</p>
        ) : (
          items.map((c) => (
            <div key={c.id} className="flex gap-2.5 py-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden shrink-0" style={{ background: 'linear-gradient(135deg,#FFB347,#FF7F11)' }}>
                {c.user.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.user.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <span className="w-full h-full grid place-items-center text-white text-[13px] font-bold">{(c.user.display_name || c.user.username || '?')[0]?.toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>{c.user.display_name || c.user.username}</div>
                <div className="text-[14.5px] text-[#2F343A] break-words">{c.body}</div>
                <div className="flex items-center gap-3 mt-0.5 text-[12px] text-[#9DAAB7]">
                  <span>{timeAgo(c.created_at)}</span>
                  {c.is_mine && (
                    <button onClick={() => del(c.id)} className="inline-flex items-center gap-1 hover:text-red-500">
                      <Trash2 size={13} /> Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-[#E7EAF0] p-2.5 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Ajoute un commentaire…"
          className="flex-1 h-10 px-4 rounded-full bg-[#F5F6F8] border border-[#E7EAF0] text-[14px] text-[#2F343A] placeholder-[#9DAAB7] outline-none"
        />
        <button onClick={send} disabled={!text.trim() || sending} className="w-10 h-10 rounded-full bg-[#FF7F11] text-white grid place-items-center disabled:opacity-40">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </>
  );

  // DESKTOP : colonne fixe à droite, permanente (dès qu'une card est active).
  if (isDesktop) {
    if (!target) return null;
    return (
      <aside data-comments-rail className="hidden lg:flex fixed right-0 top-0 bottom-0 w-[440px] xl:w-[560px] 2xl:w-[680px] z-[80] bg-white text-[#2F343A] border-l border-[#E7EAF0] flex-col shadow-xl">
        {panel}
      </aside>
    );
  }

  // MOBILE : feuille en bas, post rétréci, ouverte au clic 💬.
  if (!mobileOpen || !target) return null;
  return (
    <div className="fixed inset-0 z-[125] pointer-events-none lg:hidden">
      <button aria-label="Fermer les commentaires" onClick={closeMobile} className="absolute inset-0 pointer-events-auto bg-transparent" />
      <motion.section initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} className="pointer-events-auto absolute left-0 right-0 bottom-0 h-[62vh] bg-white text-[#2F343A] flex flex-col rounded-t-[24px] shadow-2xl">
        <div className="w-9 h-1 rounded-full bg-[#E7EAF0] mx-auto mt-2 -mb-1" />
        {panel}
      </motion.section>
    </div>
  );
}
