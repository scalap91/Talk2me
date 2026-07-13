'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Loader2 } from '@/lib/icons';
import Talk2MeContactCard, {
  type ContactCardUser,
} from '@/components/contact/Talk2MeContactCard';

interface SearchUser extends ContactCardUser {
  is_friend: boolean;
}

export default function AddFriendPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/friends/search?q=${encodeURIComponent(query.trim())}`,
          { cache: 'no-store' }
        );
        if (res.status === 401) {
          router.replace('/signin');
          return;
        }
        const data = await res.json();
        setResults(Array.isArray(data.users) ? data.users : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, router]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function handleAdd(user: ContactCardUser) {
    const res = await fetch('/api/friends/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friend_id: user.id }),
    });
    if (res.ok) {
      setResults((cur) =>
        cur.map((u) => (u.id === user.id ? { ...u, is_friend: true } : u))
      );
      showToast(`@${user.username} ajouté`);
    } else {
      showToast('Erreur. Réessaie.');
    }
  }

  async function handleRemove(user: ContactCardUser) {
    const res = await fetch('/api/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friend_id: user.id }),
    });
    if (res.ok) {
      setResults((cur) =>
        cur.map((u) => (u.id === user.id ? { ...u, is_friend: false } : u))
      );
      showToast(`@${user.username} retiré`);
    }
  }

  return (
    <div className="flex flex-col h-[100svh] t2m-narrow bg-[var(--t2m-paper)] overflow-hidden">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 px-4 backdrop-blur-xl">
        <Link
          href="/friends"
          className="text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)] transition-colors inline-flex items-center gap-1.5 text-[13px]"
          aria-label="Retour"
        >
          <ArrowLeft size={18} />
          Amis
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-[var(--t2m-ink)]">
          Ajouter un ami
        </h1>
        <span className="w-12" />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="relative mb-5">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--t2m-ink-3)]"
          />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="@pseudo de ton ami"
            className="w-full h-11 pl-9 pr-3 rounded-2xl border border-[var(--t2m-line)] bg-[var(--t2m-wash)] text-[var(--t2m-ink)] text-[14px] placeholder-[var(--t2m-ink-3)] outline-none focus:border-[var(--t2m-primary)] focus:bg-white transition-colors"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-[var(--t2m-ink-2)] text-[13px] py-8">
            <Loader2 size={14} className="animate-spin" />
            Recherche…
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <div className="text-center text-[var(--t2m-ink-2)] text-[13px] py-10">
            Aucun résultat pour <span className="text-[var(--t2m-ink)]">{query.trim()}</span>.
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            {results.map((u) => (
              <Talk2MeContactCard
                key={u.id}
                user={u}
                is_friend={u.is_friend}
                is_self={false}
                onAdd={handleAdd}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}

        {!query.trim() && (
          <div className="text-center text-[var(--t2m-ink-3)] text-[12px] pt-10 px-6 leading-relaxed">
            Tape un <span className="text-[var(--t2m-ink-2)]">@pseudo</span> partiel ou un{' '}
            <span className="text-[var(--t2m-ink-2)]">Talk2Me ID</span> à 6 chiffres pour
            trouver quelqu&apos;un.
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-50 px-4 py-2 rounded-full bg-[var(--t2m-ink)] border border-transparent text-white text-[12.5px] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          {toast}
        </div>
      )}
    </div>
  );
}
