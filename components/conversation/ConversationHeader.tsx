'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Phone, Video, MoreHorizontal, Sparkles, Trash2 } from 'lucide-react';
import type { ConversationPeer } from './types';

interface ConversationHeaderProps {
  peer: ConversationPeer;
  /** URL de retour. Si absent → pas de bouton back (cas conv IA root). */
  backHref?: string | null;
  onAudioCall?: () => void;
  onVideoCall?: () => void;
  /** Désactive Audio/Video si pas d'API derrière (cas IA). */
  callsEnabled?: boolean;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function gradientFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const hue = Math.abs(h) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55% / 0.85), hsl(${(hue + 40) % 360} 70% 50% / 0.85))`;
}

/**
 * Talk2Me #337 — Header unifié des pages CONVERSATION (IA et P2P).
 *
 * Skeleton IDENTIQUE entre les deux. Seules les data (peer.name, peer.avatar,
 * peer.presence) changent.
 */
const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  peer,
  backHref = '/messages',
  onAudioCall,
  onVideoCall,
  callsEnabled = true,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Supprimer la conversation = la masquer de MA liste (sans toucher celle de l'autre).
  // L'id de conv est lu depuis l'URL /c/[conv_id]. (Pascal 2026-06-17)
  const deleteConversation = async () => {
    setMenuOpen(false);
    if (!window.confirm('Supprimer cette conversation ? Elle disparaîtra de ta liste.')) return;
    const convId = (pathname || '').split('/').filter(Boolean).pop();
    if (!convId) return;
    try { await fetch(`/api/conversations/${convId}/hide`, { method: 'POST' }); } catch { /* */ }
    router.push(backHref || '/messages');
  };
  const isOnline = peer.presence === 'online';
  const isTyping = peer.presence === 'typing';
  const peerGradient = useMemo(() => gradientFromSeed(peer.id), [peer.id]);
  const subtitle =
    isTyping
      ? 'en train d\'écrire…'
      : peer.subtitle ??
        (isOnline ? 'en ligne' : 'hors ligne');

  return (
    <header
      className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0e12]/85 px-3 backdrop-blur-xl"
      data-testid="conversation-header"
    >
      {backHref ? (
        <Link
          href={backHref}
          className="text-white/55 hover:text-white/90 transition-colors p-1.5 -ml-1.5"
          aria-label="Retour"
        >
          <ArrowLeft size={20} />
        </Link>
      ) : (
        <div className="w-8" aria-hidden />
      )}

      <div className="flex items-center gap-2.5 flex-1 min-w-0 px-1">
        <div className="relative shrink-0">
          {peer.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={peer.avatarUrl}
              alt={peer.name}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-medium"
              style={{ background: peerGradient }}
              aria-hidden="true"
            >
              {initialsOf(peer.name)}
            </div>
          )}
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0e0e12]" />
          )}
          {peer.kind === 'ai' && (
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-[#0e0e12] flex items-center justify-center"
              data-testid="header-ai-badge"
              aria-label="Assistant IA"
            >
              <Sparkles size={6} className="text-white" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div
            className="text-[13.5px] font-medium text-white/95 truncate"
            data-testid="conversation-header-name"
          >
            {peer.name}
          </div>
          <div
            className={`text-[11px] truncate ${
              isOnline ? 'text-emerald-400/90' : 'text-white/45'
            }`}
            data-testid="conversation-header-presence"
          >
            {subtitle}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onAudioCall}
          disabled={!callsEnabled || !onAudioCall}
          className="p-1.5 text-white/55 hover:text-white/90 transition-colors disabled:opacity-40"
          aria-label="Appel audio"
          title="Appel audio"
        >
          <Phone size={18} />
        </button>
        <button
          type="button"
          onClick={onVideoCall}
          disabled={!callsEnabled || !onVideoCall}
          className="p-1.5 text-white/55 hover:text-white/90 transition-colors disabled:opacity-40"
          aria-label="Appel vidéo"
          title="Appel vidéo"
        >
          <Video size={18} />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 text-white/55 hover:text-white/90 transition-colors"
            aria-label="Options de la conversation"
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[210px] rounded-xl border border-white/10 bg-[#1a1a22] shadow-xl py-1">
                <button
                  type="button"
                  onClick={deleteConversation}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={16} /> Supprimer la conversation
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default ConversationHeader;
