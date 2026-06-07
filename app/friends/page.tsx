'use client';

/**
 * Talk2Me #334 (Pascal 2026-06-04) — /friends devient le HUB conv :
 *  - Ligne 1 PINNED TOUJOURS : conv IA solo "T2M de <user>" en haut,
 *    peu importe l'activité.
 *  - Lignes suivantes : conversations P2P triées par last_message_at DESC.
 *  - FAB "+" en haut-droite → ajouter un ami / nouvelle conv (/friends/add).
 *  - BottomNav central + → CardCreationSheet (géré globalement).
 *
 * Doctrine [[talk2me-ia-personnelle-integree]] : l'IA solo a sa propre conv
 * (kind='agent') qui sert de "discussion avec moi-même + mon assistant".
 * Elle est PINNED pour montrer "Moi & l'IA toujours au top".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus, Sparkles } from 'lucide-react';
import BottomNav from '@/components/chat/BottomNav';

interface PeerDto {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  presence: { last_seen: number; status: string } | null;
}

interface ConvDto {
  id: string;
  kind: 'agent' | 'p2p' | 'group';
  created_at: number;
  last_message_preview: string | null;
  last_message_at: number | null;
  unread_count: number;
  peer: PeerDto | null;
}

interface MeDto {
  id: string;
  display_name: string | null;
  username: string;
  ai_name: string | null;
  ai_avatar_url: string | null;
}

function formatRelative(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'à l’instant';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function PeerAvatar({ peer }: { peer: PeerDto }) {
  const initial = (peer.display_name || peer.username || '?').charAt(0).toUpperCase();
  if (peer.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={peer.avatar_url}
        alt={peer.display_name || peer.username}
        className="w-12 h-12 rounded-full object-cover border border-white/10"
      />
    );
  }
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-medium border border-white/10"
      style={{
        background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)',
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function AiAvatar({ me }: { me: MeDto }) {
  if (me.ai_avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={me.ai_avatar_url}
        alt={me.ai_name || 'Mon IA'}
        className="w-12 h-12 rounded-full object-cover border border-white/15"
      />
    );
  }
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[15px] font-medium border border-white/15"
      style={{
        background:
          'radial-gradient(circle at 30% 30%, #ff8d99 0%, #ff3344 45%, #e6253a 75%, #7a1623 100%)',
      }}
      aria-hidden="true"
    >
      <Sparkles className="w-4 h-4" />
    </div>
  );
}

export default function FriendsHubPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeDto | null>(null);
  const [convs, setConvs] = useState<ConvDto[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [meRes, convRes] = await Promise.all([
        fetch('/api/auth/me', { cache: 'no-store' }),
        fetch('/api/conversations/list', { cache: 'no-store' }),
      ]);
      if (meRes.status === 401 || convRes.status === 401) {
        router.replace('/signin');
        return;
      }
      if (meRes.ok) {
        const d = await meRes.json();
        if (d?.user) {
          setMe({
            id: d.user.id,
            display_name: d.user.display_name ?? null,
            username: d.user.username,
            ai_name: d.user.ai_name ?? null,
            ai_avatar_url: d.user.ai_avatar_url ?? null,
          });
        }
      }
      if (convRes.ok) {
        const d = await convRes.json();
        if (Array.isArray(d?.conversations)) setConvs(d.conversations);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // Sort : agent first PINNED, puis P2P par last_message_at DESC
  const { agent, p2p } = useMemo(() => {
    const agent = convs.find((c) => c.kind === 'agent') || null;
    const p2p = convs
      .filter((c) => c.kind === 'p2p')
      .sort((a, b) => {
        const aT = a.last_message_at ?? a.created_at;
        const bT = b.last_message_at ?? b.created_at;
        return bT - aT;
      });
    return { agent, p2p };
  }, [convs]);

  const aiDisplayName = me?.ai_name?.trim() || 'Mon IA';

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#0e0e12] overflow-hidden">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0e12]/85 px-4 backdrop-blur-xl">
        <h1 className="text-[17px] font-medium tracking-tight text-white/95">
          Amis
        </h1>
        <Link
          href="/friends/add"
          aria-label="Ajouter un ami"
          data-testid="friends-add"
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/85 hover:text-white bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] transition-colors"
        >
          <UserPlus size={16} />
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {loading && (
          <div className="text-center text-white/55 text-[13px] py-12">Chargement…</div>
        )}

        {!loading && me && (
          <ul className="divide-y divide-white/5">
            {/* === IA solo PINNED en haut === */}
            {agent && (
              <li>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  data-testid="friends-hub-agent"
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
                >
                  <AiAvatar me={me} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-medium text-white/95 truncate">
                        {aiDisplayName}
                      </span>
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-400/30 text-red-200 flex-shrink-0"
                        title="Conversation épinglée — moi et mon IA"
                      >
                        Moi & l’IA
                      </span>
                    </div>
                    <p className="text-[12.5px] text-white/55 truncate mt-0.5">
                      {agent.last_message_preview
                        ? agent.last_message_preview
                        : 'Pose-moi une question 💬'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[11px] text-white/40">
                      {formatRelative(agent.last_message_at)}
                    </span>
                    {agent.unread_count > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
                        {agent.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )}

            {/* === P2P sortées DESC === */}
            {p2p.length === 0 && (
              <li className="px-6 py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-white/[0.04] border border-white/8 flex items-center justify-center mx-auto mb-3">
                  <UserPlus className="text-white/45" size={22} />
                </div>
                <div className="text-[14px] text-white/85 font-medium mb-1">
                  Pas encore d&apos;amis
                </div>
                <p className="text-[12.5px] text-white/55 leading-relaxed max-w-xs mx-auto">
                  Tape sur <span className="text-white/85 font-medium">+</span>{' '}
                  en haut pour ajouter un ami via son @pseudo ou son Talk2Me ID.
                </p>
              </li>
            )}

            {p2p.map((c) => {
              if (!c.peer) return null;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/c/${c.id}`)}
                    data-testid={`friends-hub-p2p-${c.peer.id}`}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
                  >
                    <div className="relative">
                      <PeerAvatar peer={c.peer} />
                      {c.peer.presence?.status === 'online' && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0e0e12]"
                          aria-label="En ligne"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[14.5px] font-medium text-white/95 truncate block">
                        {c.peer.display_name || c.peer.username}
                      </span>
                      <p className="text-[12.5px] text-white/55 truncate mt-0.5">
                        {c.last_message_preview || 'Aucun message pour le moment'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[11px] text-white/40">
                        {formatRelative(c.last_message_at)}
                      </span>
                      {c.unread_count > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
