'use client';

/**
 * Talk2Me — Cible de PARTAGE (Web Share Target API, Pascal 2026-06-10).
 * Quand T2M est INSTALLÉ (écran d'accueil), il apparaît dans le menu « Partager »
 * d'Android (déclaré dans manifest.json → share_target). Le lien/texte partagé
 * arrive ici (GET ?title&text&url), puis l'user CHOISIT la destination :
 *   - le COMPOSER (publication / story)
 *   - la MESSAGERIE (envoyer à un ami, type WhatsApp)
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Link2, Megaphone, MessageCircle, X, Send } from 'lucide-react';

function firstUrl(s: string): string {
  const m = (s || '').match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : '';
}

interface Conv { id: string; kind: string; peer?: { display_name?: string | null; username?: string } | null }

export default function SharePage() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [auth, setAuth] = useState<'checking' | 'yes' | 'no'>('checking');
  const [view, setView] = useState<'choose' | 'friends'>('choose');
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [sendingTo, setSendingTo] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const url = (q.get('url') || '').trim();
    const t = (q.get('text') || '').trim();
    const ttl = (q.get('title') || '').trim();
    setLink(url || firstUrl(t));
    setText(t);
    setTitle(ttl);
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => setAuth(r.ok ? 'yes' : 'no')).catch(() => setAuth('no'));
  }, []);

  const payloadQS = () => {
    const p = new URLSearchParams();
    if (link) p.set('url', link);
    if (text && text !== link) p.set('text', text);
    if (title) p.set('title', title);
    return p.toString();
  };

  // Destination 1 : le composer (publication / story), prérempli avec le lien.
  const toComposer = () => router.replace(`/creer/texte?${payloadQS()}`);

  // Destination 2 : envoyer à un ami → choisir la conversation.
  const openFriends = () => {
    setView('friends'); setLoadingConvs(true);
    fetch('/api/conversations/list', { cache: 'no-store' }).then((r) => r.json())
      .then((d) => setConvs((d.conversations || []).filter((c: Conv) => c.kind === 'p2p' && c.peer)))
      .catch(() => {}).finally(() => setLoadingConvs(false));
  };
  const sendTo = async (c: Conv) => {
    if (sendingTo) return;
    setSendingTo(c.id);
    const body = [text && text !== link ? text : '', link].filter(Boolean).join('\n') || title || text;
    try {
      const r = await fetch(`/api/conversations/${c.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: body }),
      });
      if (r.ok) router.replace(`/c/${c.id}`);
      else setSendingTo('');
    } catch { setSendingTo(''); }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a14] text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="flex items-center gap-2 px-4 h-14 border-b border-white/8">
        <button onClick={() => (view === 'friends' ? setView('choose') : router.replace('/home'))} aria-label="Fermer" className="w-9 h-9 rounded-full grid place-items-center text-white/80"><X className="w-5 h-5" /></button>
        <h1 className="text-[16px] font-semibold">{view === 'friends' ? 'Envoyer à…' : 'Partager sur Talk2Me'}</h1>
      </header>

      <div className="flex-1 p-4 space-y-4">
        {auth === 'checking' ? (
          <div className="flex justify-center py-10 text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : auth === 'no' ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-white/70 text-[14px]">Connecte-toi pour partager.</p>
            <button onClick={() => router.replace('/signin')} className="px-5 py-2.5 rounded-xl bg-red-600 font-semibold">Se connecter</button>
          </div>
        ) : (
          <>
            {/* Aperçu de ce qui est partagé */}
            {(link || text) && (
              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <span className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-400/30 grid place-items-center text-red-200 shrink-0"><Link2 className="w-4 h-4" /></span>
                <div className="min-w-0">
                  {title && <p className="text-[14px] font-semibold text-white/95 line-clamp-2">{title}</p>}
                  <p className="text-[12px] text-sky-300 break-all line-clamp-2">{link || text}</p>
                </div>
              </div>
            )}

            {view === 'choose' ? (
              <div className="space-y-2.5">
                <p className="text-[13px] text-white/55 px-1">Où veux-tu l&apos;envoyer ?</p>
                <button onClick={toComposer} className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-left active:scale-[0.99]">
                  <span className="w-11 h-11 rounded-full bg-red-500/15 border border-red-400/30 grid place-items-center text-red-200 shrink-0"><Megaphone className="w-5 h-5" /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white/95">Publier / Story</span>
                    <span className="block text-[12px] text-white/55">Ouvre le composer — publication dans ton Hub ou story</span>
                  </span>
                </button>
                <button onClick={openFriends} className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-left active:scale-[0.99]">
                  <span className="w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-400/30 grid place-items-center text-emerald-200 shrink-0"><MessageCircle className="w-5 h-5" /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-white/95">Envoyer à un ami</span>
                    <span className="block text-[12px] text-white/55">Dans ta messagerie, comme un message</span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {loadingConvs ? (
                  <div className="flex justify-center py-8 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : convs.length === 0 ? (
                  <p className="text-center text-white/40 text-[13px] py-8">Aucune conversation. Ajoute des amis d&apos;abord.</p>
                ) : convs.map((c) => (
                  <button key={c.id} onClick={() => sendTo(c)} disabled={!!sendingTo} className="w-full flex items-center gap-3 p-2.5 rounded-2xl border border-white/8 bg-white/[0.03] hover:bg-white/[0.07] text-left active:scale-[0.99] disabled:opacity-50">
                    <span className="w-10 h-10 rounded-full bg-white/10 grid place-items-center text-white/70 shrink-0 text-[15px] font-semibold">{(c.peer?.display_name || c.peer?.username || '?').charAt(0).toUpperCase()}</span>
                    <span className="flex-1 text-[14px] font-medium text-white/95 truncate">{c.peer?.display_name || c.peer?.username}</span>
                    {sendingTo === c.id ? <Loader2 className="w-4 h-4 animate-spin text-white/50" /> : <Send className="w-4 h-4 text-white/40" />}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
