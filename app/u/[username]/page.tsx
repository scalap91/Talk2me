'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from '@/lib/icons';
import Talk2MeContactCard, {
  type ContactCardUser,
} from '@/components/contact/Talk2MeContactCard';

interface ProfilePayload {
  user: ContactCardUser & { friends_count?: number };
  is_self: boolean;
  is_friend: boolean;
}

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const username = (params?.username as string) || '';
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
          cache: 'no-store',
        });
        if (res.status === 401) {
          router.replace('/signin');
          return;
        }
        if (res.status === 404) {
          setError('Profil introuvable.');
          return;
        }
        if (!res.ok) {
          setError('Erreur.');
          return;
        }
        const payload = (await res.json()) as ProfilePayload;
        setData(payload);
      } catch {
        setError('Erreur réseau.');
      } finally {
        setLoading(false);
      }
    })();
  }, [username, router]);

  async function handleAdd(user: ContactCardUser) {
    await fetch('/api/friends/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friend_id: user.id }),
    });
    setData((cur) => (cur ? { ...cur, is_friend: true } : cur));
  }

  async function handleRemove(user: ContactCardUser) {
    await fetch('/api/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friend_id: user.id }),
    });
    setData((cur) => (cur ? { ...cur, is_friend: false } : cur));
  }

  async function handleMessage(user: ContactCardUser) {
    // Ouvre la VRAIE conversation P2P avec cet ami (pas le chat IA). Pascal 2026-06-20.
    try {
      const r = await fetch('/api/conversations/create-p2p', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: user.id }),
      });
      const d = await r.json();
      if (r.ok && d?.conversation?.id) { router.push(`/c/${d.conversation.id}`); return; }
      if (d?.error === 'not_friend') { router.push(`/u/${encodeURIComponent(user.username)}`); return; }
    } catch { /* */ }
  }

  return (
    <main className="min-h-[100svh] w-full flex flex-col bg-[var(--t2m-paper)]">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 px-4 backdrop-blur-xl">
        <Link
          href="/home"
          className="text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)] transition-colors inline-flex items-center gap-1.5 text-[13px]"
        >
          <ArrowLeft size={18} />
          Retour
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-[var(--t2m-ink)]">
          Profil
        </h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-5">
          {loading && (
            <div className="text-center text-[var(--t2m-ink-2)] text-[13px] py-12">Chargement…</div>
          )}
          {!loading && error && (
            <div className="text-center text-[var(--t2m-ink-2)] text-[13px] py-12">{error}</div>
          )}
          {!loading && data && (
            <>
              <Talk2MeContactCard
                user={data.user}
                is_friend={data.is_friend}
                is_self={data.is_self}
                onAdd={handleAdd}
                onRemove={handleRemove}
                onMessage={handleMessage}
              />
              {typeof data.user.friends_count === 'number' && (
                <div className="rounded-3xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] p-5">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--t2m-ink-3)] mb-1">
                    Amis
                  </div>
                  <div className="text-[20px] font-medium text-[var(--t2m-ink)]">
                    {data.user.friends_count}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
