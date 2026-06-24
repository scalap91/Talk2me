'use client';

/**
 * Talk2Me — CommentsHost (Pascal 2026-06-24). Style TikTok : à l'ouverture, le post
 * RÉTRÉCIT (classe body t2m-comments-open → CSS sur [data-feed-scroller]) et le panneau
 * commentaires prend le BAS sur mobile (~62vh) / la GAUCHE sur desktop (400px).
 * Monté une seule fois (layout). Écoute l'évènement `ttm:comments:open` {kind,id}.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Send, Trash2, Loader2 } from 'lucide-react';

interface CItem {
  id: string; body: string; created_at: number; is_mine: boolean;
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}
type OpenDetail = { kind: 'direct_card' | 'post'; id: string };

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "à l'instant";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h`;
  return `${Math.floor(d / 86_400_000)} j`;
}

export default function CommentsHost() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<OpenDetail | null>(null);
  const [items, setItems] = useState<CItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async (t: OpenDetail) => {
    setLoading(true);
    try {
      const d = await fetch(`/api/cards/${encodeURIComponent(t.id)}/comments?kind=${t.kind}`, { cache: 'no-store' }).then((r) => r.json());
      if (d?.ok) setItems(d.comments || []);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const det = (e as CustomEvent).detail as OpenDetail;
      if (!det?.id || !det?.kind) return;
      setTarget(det); setOpen(true); setItems([]); load(det);
    };
    window.addEventListener('ttm:comments:open', onOpen as EventListener);
    return () => window.removeEventListener('ttm:comments:open', onOpen as EventListener);
  }, [load]);

  // Rétrécit le post à l'ouverture (style TikTok), en JS pour être fiable :
  //  - mobile : le feed passe à 38vh (le post remonte, panneau en bas 62vh)
  //  - desktop : on libère 400px à DROITE (marge droite) pour le panneau fixe
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector('[data-feed-scroller]') as HTMLElement | null;
    if (!el) return;
    const prev = el.getAttribute('style') || '';
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) {
      el.style.marginRight = '400px';
      el.style.transition = 'margin-right .25s ease';
    } else {
      el.style.height = '38vh';
      el.style.flex = 'none';
      el.style.transition = 'height .25s ease';
    }
    return () => { el.setAttribute('style', prev); };
  }, [open]);

  const close = () => { setOpen(false); setTarget(null); setText(''); };

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[125] pointer-events-none">
      {/* Zone restante (post rétréci) : tap pour fermer. */}
      <button aria-label="Fermer les commentaires" onClick={close} className="absolute inset-0 pointer-events-auto bg-transparent" />

      <section
        className="pointer-events-auto absolute bg-white text-neutral-900 flex flex-col
                   left-0 right-0 bottom-0 h-[62vh] rounded-t-2xl shadow-2xl
                   lg:right-0 lg:left-auto lg:top-0 lg:bottom-0 lg:h-full lg:w-[400px] lg:rounded-none lg:border-l lg:border-black/10"
      >
        <header className="relative flex items-center justify-center h-12 border-b border-black/10 shrink-0">
          <span className="text-[14px] font-semibold">{items.length} commentaire{items.length > 1 ? 's' : ''}</span>
          <button onClick={close} aria-label="Fermer" className="absolute right-3 w-8 h-8 grid place-items-center text-neutral-500"><X size={20} /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-8 text-neutral-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-center text-neutral-400 text-[13.5px] py-10">Aucun commentaire. Sois le premier 💬</p>
          ) : (
            items.map((c) => (
              <div key={c.id} className="flex gap-2.5 py-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-neutral-200 shrink-0">
                  {c.user.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.user.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="w-full h-full grid place-items-center text-neutral-500 text-[13px] font-bold">{(c.user.display_name || c.user.username || '?')[0]?.toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-neutral-500">{c.user.display_name || c.user.username}</div>
                  <div className="text-[14.5px] text-neutral-900 break-words">{c.body}</div>
                  <div className="flex items-center gap-3 mt-0.5 text-[12px] text-neutral-400">
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

        <div className="shrink-0 border-t border-black/10 p-2.5 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Ajouter un commentaire…"
            className="flex-1 h-10 px-4 rounded-full bg-neutral-100 text-[14px] text-neutral-900 placeholder-neutral-400 outline-none"
          />
          <button onClick={send} disabled={!text.trim() || sending} className="w-10 h-10 rounded-full bg-red-500 text-white grid place-items-center disabled:opacity-40">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </section>
    </div>
  );
}
