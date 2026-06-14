'use client';

/* eslint-disable @next/next/no-img-element */

/**
 * Talk2Me — LE PONT public → privé (Pascal 2026-06-08).
 * Quand on tape la photo/le nom d'un posteur dans le Hub PUBLIC, ce sheet
 * propose les 3 cercles : 📞 Appeler · 💬 SMS · ➕ Ajouter en ami.
 * Monté globalement (layout) ; ouvert via CustomEvent 'ttm:connect:open'
 * { detail: author }. Doctrine [[project_talk_ecosystem_architecture]].
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, MessageSquare, UserPlus, X } from 'lucide-react';

interface Author {
  id: string;
  talk2me_id?: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
}

export default function AuthorConnectSheet() {
  const router = useRouter();
  const [author, setAuthor] = useState<Author | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const a = (e as CustomEvent).detail as Author | undefined;
      if (a && a.id) {
        setAuthor(a);
        setToast(null);
      }
    };
    window.addEventListener('ttm:connect:open', onOpen as EventListener);
    return () => window.removeEventListener('ttm:connect:open', onOpen as EventListener);
  }, []);

  const close = useCallback(() => setAuthor(null), []);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  const onCall = useCallback(async (kind: 'audio' | 'video') => {
    if (!author) return;
    setBusy('call');
    try {
      const res = await fetch('/api/calls/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callee_id: author.id, kind, layer: 'comm' }),
      });
      const j = await res.json();
      if (res.ok && j?.ok && j.call_id && j.callee) {
        window.dispatchEvent(new CustomEvent('ttm:call:start', { detail: { call_id: j.call_id, kind, callee: j.callee } }));
        close();
      } else {
        flash(j?.error === 'blocked' ? 'Tu es bloqué' : j?.error === 'callee_busy' ? 'Occupé' : 'Appel impossible');
      }
    } catch {
      flash('Réseau');
    } finally {
      setBusy(null);
    }
  }, [author, close]);

  const onSms = useCallback(() => {
    if (!author) return;
    router.push(`/sms?to=${encodeURIComponent(author.talk2me_id || author.username)}`);
    close();
  }, [author, router, close]);

  const onAddFriend = useCallback(async () => {
    if (!author) return;
    setBusy('friend');
    try {
      const res = await fetch('/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: author.id }),
      });
      const j = await res.json();
      if (res.ok && j?.ok) flash('Demande envoyée ✓');
      else flash(j?.error === 'already_friends' ? 'Déjà ami' : 'Échec');
    } catch {
      flash('Réseau');
    } finally {
      setBusy(null);
    }
  }, [author]);

  if (!author) return null;
  const name = author.display_name?.trim() || author.username;
  const initial = (name.charAt(0) || '?').toUpperCase();

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 backdrop-blur-sm" onClick={close}>
      <div
        className="w-full max-w-md bg-[#15151c] border-t border-white/10 rounded-t-3xl px-5 pt-3 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-3"><div className="w-10 h-1 rounded-full bg-white/15" /></div>
        <button type="button" onClick={close} aria-label="Fermer" className="absolute right-5 top-4 w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/70">
          <X className="w-4 h-4" />
        </button>

        {/* Identité */}
        <div className="flex items-center gap-3 mb-1">
          {author.avatar_url ? (
            <img src={author.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover border border-white/10" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500/80 to-red-700/80 flex items-center justify-center text-white text-xl font-bold">{initial}</div>
          )}
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-white truncate">{name}</div>
            <div className="text-[12px] text-white/45">@{author.username}{author.talk2me_id ? ` · ${author.talk2me_id}` : ''}</div>
          </div>
        </div>
        <p className="text-[12px] text-white/45 mb-4">Se connecter — du public au privé, comme tu veux.</p>

        {/* Les 3 cercles */}
        <div className="grid grid-cols-3 gap-3">
          <button type="button" onClick={() => onCall('audio')} disabled={busy === 'call'} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/[0.05] border border-white/10 active:scale-95 transition disabled:opacity-50">
            <Phone className="w-6 h-6 text-emerald-300" strokeWidth={2.2} />
            <span className="text-[12px] text-white/85">Appeler</span>
          </button>
          <button type="button" onClick={onSms} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/[0.05] border border-white/10 active:scale-95 transition">
            <MessageSquare className="w-6 h-6 text-sky-300" strokeWidth={2.2} />
            <span className="text-[12px] text-white/85">SMS</span>
          </button>
          <button type="button" onClick={onAddFriend} disabled={busy === 'friend'} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-red-500/15 border border-red-400/30 active:scale-95 transition disabled:opacity-50">
            <UserPlus className="w-6 h-6 text-red-200" strokeWidth={2.2} />
            <span className="text-[12px] text-red-100">Ajouter</span>
          </button>
        </div>

        <button type="button" onClick={() => { router.push(`/u/${author.username}`); close(); }} className="mt-3 w-full py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white/70 text-[13px]">
          Voir le profil
        </button>

        {toast && <div className="mt-3 text-center text-[12px] text-white/80">{toast}</div>}
      </div>
    </div>
  );
}
