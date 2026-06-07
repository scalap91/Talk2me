'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, UserPlus } from 'lucide-react';
import Talk2MeContactCard, {
  type ContactCardUser,
} from '@/components/contact/Talk2MeContactCard';
import BottomNav from '@/components/chat/BottomNav';

// Talk2Me #333 v2 (Pascal 2026-06-04) — Sub-page "Carnet d'amis".
// L'ancien /friends (carnet sec Contact Cards) est déplacé ici. Le nouveau
// /friends est désormais le HUB UNIQUE de conversations (IA solo + P2P).
// Cf doctrine [[talk2me-ia-personnelle-integree]].

interface FriendDto {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  presence?: { last_seen: number; status: string } | null;
}

export default function FriendsContactsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await fetch('/api/friends/list', { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/signin');
        return;
      }
      if (!res.ok) {
        setFriends([]);
        return;
      }
      const data = await res.json();
      setFriends(Array.isArray(data.friends) ? data.friends : []);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  async function handleRemove(user: ContactCardUser) {
    await fetch('/api/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friend_id: user.id }),
    });
    setFriends((cur) => cur.filter((f) => f.id !== user.id));
  }

  async function handleMessage(user: ContactCardUser) {
    try {
      const res = await fetch('/api/conversations/create-p2p', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: user.id }),
      });
      const data = await res.json();
      if (res.ok && data?.conversation?.id) {
        router.push(`/c/${data.conversation.id}`);
        return;
      }
    } catch {
      // fallback hub
    }
    router.push('/friends');
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#0e0e12] overflow-hidden">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0e12]/85 px-4 backdrop-blur-xl">
        <Link
          href="/friends"
          className="text-white/55 hover:text-white/90 transition-colors inline-flex items-center gap-1.5 text-[13px]"
          aria-label="Retour aux conversations"
        >
          <ArrowLeft size={18} />
          Amis
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-white/95">
          Carnet d&apos;amis
        </h1>
        <span className="w-12" />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 relative">
        {loading && (
          <div className="text-center text-white/55 text-[13px] py-12">Chargement…</div>
        )}

        {!loading && friends.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center pt-20 px-6 gap-3">
            <div className="w-16 h-16 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center mb-2">
              <UserPlus className="text-white/45" size={26} />
            </div>
            <div className="text-[15px] font-medium text-white/90">Pas encore d&apos;amis</div>
            <p className="text-[13px] text-white/55 leading-relaxed max-w-xs">
              Tape sur <span className="text-white/85 font-medium">+</span> pour
              ajouter ton premier ami via son <span className="text-white/85">@pseudo</span>
              {' '}ou son <span className="text-white/85">Talk2Me ID</span>.
            </p>
          </div>
        )}

        {!loading && friends.length > 0 && (
          <div className="space-y-3 pb-24">
            {friends.map((f) => (
              <Talk2MeContactCard
                key={f.id}
                user={f}
                is_friend
                is_self={false}
                onRemove={handleRemove}
                onMessage={handleMessage}
              />
            ))}
          </div>
        )}

        <Link
          href="/friends/add"
          aria-label="Ajouter un ami"
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-[0_8px_24px_rgba(255,51,68,0.35)] border border-white/10 transition-transform hover:scale-[1.04] active:scale-95"
          style={{
            background:
              'linear-gradient(135deg, #ef4444 0%, #dc2626 60%, #60a5fa 100%)',
          }}
        >
          <Plus size={24} />
        </Link>
      </main>

      <BottomNav />
    </div>
  );
}
