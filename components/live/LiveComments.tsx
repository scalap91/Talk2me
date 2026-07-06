'use client';

/**
 * Talk2Me — Overlay commentaires LIVE (Pascal 2026-07-04).
 *
 * S'accroche à une vue Live (diffuseur InlineCamera OU spectateur pièce 3D).
 * Réutilise EXACTEMENT le mécanisme temps réel du chat : un EventSource sur
 * `/api/live/{liveId}` (canal bus `live:{liveId}`), les mêmes events SSE que la
 * signalisation WebRTC transitent déjà par ce canal. On écoute :
 *   - 'live_comment' → { author, text, ts }
 *   - 'live_join'    → { author, ts }  (message système « X a rejoint »)
 *
 * Style TikTok/Insta Live : les commentaires défilent en bas, léger fondu en
 * haut, champ de saisie discret. Le diffuseur ET les spectateurs voient le même
 * flux en temps réel.
 *
 * Doctrine [[talk2me-pii-air-gap]] : n'affiche que username/display_name.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface LiveAuthor {
  username: string;
  display_name?: string | null;
}
interface LiveCommentItem {
  key: string;
  author: LiveAuthor;
  text: string;
  system?: boolean;
  ts: number;
}

interface Props {
  /** id du diffuseur (= canal `live:{liveId}`). */
  liveId: string;
  /** Afficher le champ de saisie (true pour diffuseur ET spectateur). */
  canComment?: boolean;
  /** Annoncer « X a rejoint » à l'ouverture (spectateur uniquement). */
  announceJoin?: boolean;
  /** Décalage bas (px) pour ne pas recouvrir un déclencheur (ex: shutter live). */
  insetBottom?: number;
}

function label(a: LiveAuthor): string {
  return (a.display_name && a.display_name.trim()) || a.username;
}

const MAX_VISIBLE = 40;

export default function LiveComments({ liveId, canComment = true, announceJoin = false, insetBottom = 0 }: Props) {
  const [items, setItems] = useState<LiveCommentItem[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [needLogin, setNeedLogin] = useState(false); // POST 401 → inviter à se connecter
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // Répondre à quelqu'un : tap sur son pseudo → préremplit « @pseudo » + focus (comme un chat).
  const mention = useCallback((a: LiveAuthor) => {
    setText((t) => `${t.trim() ? t.trim() + ' ' : ''}@${a.username} `);
    setNeedLogin(false);
    inputRef.current?.focus();
  }, []);

  const push = useCallback((it: Omit<LiveCommentItem, 'key'>) => {
    setItems((prev) => {
      const next = [...prev, { ...it, key: `${it.ts}-${seq.current++}` }];
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
    });
  }, []);

  // Snapshot initial + annonce d'arrivée + flux temps réel (SSE, comme le chat).
  useEffect(() => {
    if (!liveId) return;
    let closed = false;

    (async () => {
      try {
        const r = await fetch(`/api/live/${liveId}/comment`, { cache: 'no-store' });
        if (r.ok && !closed) {
          const j = await r.json();
          if (Array.isArray(j.comments)) {
            setItems(
              j.comments.map((c: LiveCommentItem, i: number) => ({
                key: `snap-${i}`,
                author: c.author,
                text: c.text,
                system: c.system,
                ts: c.ts,
              }))
            );
          }
        }
      } catch {
        /* ignore */
      }
      if (announceJoin && !closed) {
        try {
          await fetch(`/api/live/${liveId}/join`, { method: 'POST' });
        } catch {
          /* ignore */
        }
      }
    })();

    const es = new EventSource(`/api/live/${liveId}`);
    es.addEventListener('live_comment', (evt) => {
      try {
        const d = JSON.parse((evt as MessageEvent).data);
        if (!d?.author) return;
        // system=true → message système au texte porté (ex. « 🛒 X vient d'acheter … »).
        push({ author: d.author, text: d.text || '', system: !!d.system, ts: d.ts || Date.now() });
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('live_join', (evt) => {
      try {
        const d = JSON.parse((evt as MessageEvent).data);
        if (!d?.author) return;
        push({ author: d.author, text: '', system: true, ts: d.ts || Date.now() });
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      /* reconnexion auto par le navigateur */
    };

    return () => {
      closed = true;
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);

  // Auto-scroll vers le dernier commentaire — SEULEMENT si on est déjà en bas
  // (sinon on ne yank pas l'utilisateur pendant qu'il remonte lire l'historique).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [items]);

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/live/${liveId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      if (r.status === 401) { setNeedLogin(true); return; } // pas connecté → invite à se connecter
      setText('');
      // Pas d'écho local : le commentaire revient via SSE (source unique de vérité).
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  }, [text, sending, liveId]);

  return (
    <div
      className="absolute inset-x-0 z-40 pointer-events-none flex flex-col justify-end"
      style={{ bottom: insetBottom }}
    >
      {/* Flux défilant — fondu en haut, façon TikTok/Insta Live */}
      <div
        ref={listRef}
        className="px-3 pb-2 max-h-[50%] overflow-y-auto no-scrollbar space-y-1.5 pointer-events-auto overscroll-contain"
        style={{
          maskImage: 'linear-gradient(to top, black 68%, transparent)',
          WebkitMaskImage: 'linear-gradient(to top, black 68%, transparent)',
        }}
      >
        {items.map((it) =>
          it.system ? (
            <div key={it.key} className="text-[12px] text-white/75 italic [text-shadow:0_1px_3px_rgba(0,0,0,.7)]">
              {/* texte porté (achat/annonce) sinon « a rejoint » par défaut */}
              {it.text ? it.text : `${label(it.author)} a rejoint`}
            </div>
          ) : (
            <div key={it.key} className="text-[13px] leading-snug [text-shadow:0_1px_3px_rgba(0,0,0,.8)]">
              {/* Tap le pseudo → répondre en @taguant la personne (comme un chat). */}
              <button type="button" onClick={() => mention(it.author)} className="font-semibold text-white/90 active:opacity-70">{label(it.author)}</button>{' '}
              <span className="text-white">{it.text}</span>
            </div>
          )
        )}
      </div>

      {/* Champ de saisie discret */}
      {canComment && (
        <div className="px-3 pb-3 pt-1 pointer-events-auto" style={{ marginBottom: 'env(safe-area-inset-bottom,0px)' }}>
          {needLogin ? (
            <a
              href={`/signin?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
              className="flex items-center justify-center h-10 rounded-full bg-white/90 text-black text-[13px] font-semibold active:scale-95"
            >
              🔒 Connecte-toi pour commenter
            </a>
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void send();
                  }
                }}
                maxLength={500}
                placeholder="Ajoute un commentaire…"
                className="flex-1 h-10 rounded-full bg-black/45 backdrop-blur border border-white/20 px-4 text-[13px] text-white placeholder-white/55 outline-none focus:border-white/45"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !text.trim()}
                className="h-10 px-4 rounded-full bg-white/90 text-black text-[13px] font-semibold disabled:opacity-40 active:scale-95"
              >
                Envoyer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
