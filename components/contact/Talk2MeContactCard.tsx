'use client';

import { useState } from 'react';
import { UserPlus, Check, MessageCircle, Share2, Loader2 } from '@/lib/icons';

export interface ContactCardUser {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  /** Alias historique, équivalent à avatar_url. */
  avatar?: string | null;
  /** Champ canonique persisté en DB. */
  avatar_url?: string | null;
  /** Phase 3 présence — last_seen ms. null si user jamais vu. */
  presence?: { last_seen: number; status: string } | null;
}

interface Talk2MeContactCardProps {
  user: ContactCardUser;
  is_friend: boolean;
  is_self: boolean;
  onAdd?: (user: ContactCardUser) => void | Promise<void>;
  onRemove?: (user: ContactCardUser) => void | Promise<void>;
  onMessage?: (user: ContactCardUser) => void;
  onShare?: (user: ContactCardUser) => void;
}

const PRESENCE_ONLINE_WINDOW_MS = 5 * 60 * 1000;

function formatPresence(p: ContactCardUser['presence']): { online: boolean; label: string } {
  if (!p) return { online: false, label: '' };
  const diff = Date.now() - p.last_seen;
  if (diff < PRESENCE_ONLINE_WINDOW_MS) return { online: true, label: 'en ligne maintenant' };
  if (diff < 3600_000) return { online: false, label: `vu il y a ${Math.floor(diff / 60_000)} min` };
  if (diff < 86400_000) return { online: false, label: `vu il y a ${Math.floor(diff / 3600_000)} h` };
  return { online: false, label: `vu il y a ${Math.floor(diff / 86400_000)} j` };
}

function initialsOf(name: string | null | undefined, fallback: string): string {
  const src = (name && name.trim()) || fallback;
  const parts = src.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Gradient déterministe depuis un seed (user id ou username).
 * Reprend le pattern ChatHeader (purple→blue) en le variant légèrement par user.
 */
function gradientFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const hue = Math.abs(h) % 360;
  const hue2 = (hue + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55% / 0.85), hsl(${hue2} 70% 50% / 0.85))`;
}

export default function Talk2MeContactCard({
  user,
  is_friend,
  is_self,
  onAdd,
  onRemove,
  onMessage,
  onShare,
}: Talk2MeContactCardProps) {
  const [busy, setBusy] = useState(false);
  const [friendState, setFriendState] = useState(is_friend);
  const initials = initialsOf(user.display_name, user.username);
  const gradient = gradientFromSeed(user.id || user.username || user.talk2me_id);
  const presence = formatPresence(user.presence ?? null);
  // Avatar : préfère `avatar` (legacy) sinon `avatar_url` (canonique).
  const avatarSrc = user.avatar || user.avatar_url || null;

  async function handleAddRemove() {
    if (busy) return;
    setBusy(true);
    try {
      if (friendState) {
        await onRemove?.(user);
        setFriendState(false);
      } else {
        await onAdd?.(user);
        setFriendState(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleShare() {
    if (onShare) {
      onShare(user);
      return;
    }
    // Fallback : copie un deep-link vers le profil public
    if (typeof window !== 'undefined' && navigator.clipboard) {
      const url = `${window.location.origin}/u/${user.username}`;
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={user.display_name || user.username}
              className="w-14 h-14 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-[16px] font-medium shadow-[0_4px_14px_rgba(255,51,68,0.18)]"
              style={{ background: gradient }}
              aria-hidden="true"
            >
              {initials}
            </div>
          )}
          {presence.online && (
            <span
              className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0e0e12]"
              aria-label="en ligne"
              title="en ligne"
            />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="text-[15px] font-medium text-white/95 truncate">
            {user.display_name || `@${user.username}`}
          </div>
          <div className="text-[12px] text-white/55 font-mono truncate">
            @{user.username}
          </div>
          {presence.label && (
            <div className={`text-[11px] pt-0.5 ${presence.online ? 'text-emerald-400/90' : 'text-white/40'}`}>
              {presence.label}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {!is_self && (
          <button
            type="button"
            onClick={handleAddRemove}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-medium border transition-colors disabled:opacity-50 ${
              friendState
                ? 'border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-200/90 hover:bg-emerald-500/[0.12]'
                : 'border-white/12 bg-white/[0.06] text-white/90 hover:bg-white/[0.12]'
            }`}
            aria-label={friendState ? 'Retirer des amis' : 'Ajouter en ami'}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : friendState ? (
              <Check size={14} />
            ) : (
              <UserPlus size={14} />
            )}
            {friendState ? 'Ami' : 'Ajouter'}
          </button>
        )}

        {!is_self && (
          <button
            type="button"
            onClick={() => onMessage?.(user)}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-medium border border-white/12 bg-white/[0.06] text-white/90 hover:bg-white/[0.12] transition-colors"
            aria-label="Message"
          >
            <MessageCircle size={14} />
            Message
          </button>
        )}

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-medium border border-white/12 bg-white/[0.06] text-white/90 hover:bg-white/[0.12] transition-colors"
          aria-label="Partager le profil"
        >
          <Share2 size={14} />
          Partager
        </button>
      </div>
    </article>
  );
}
