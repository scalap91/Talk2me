'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Shop · Messages (Pascal 2026-06-27). Conversations COMMERCE
 * (litiges/échanges vendeur↔acheteur) UNIQUEMENT. Séparé de Discussions.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ShieldAlert, Loader2, MessageCircle } from '@/lib/icons';
import ShopNav from '@/components/shop/ShopNav';

interface Conv { id: string; peer: { username: string; display_name: string | null; avatar_url: string | null } | null; last_message_preview: string | null; last_message_at: number | null; unread_count: number }

function when(ts: number | null): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); } catch { return ''; }
}

export default function ShopMessagesPage() {
  const router = useRouter();
  const [list, setList] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/shop/messages', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setList(d.conversations || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] text-[var(--t2m-ink)] flex flex-col">
      <ShopNav />
      <header className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-[var(--t2m-line)]">
        <button onClick={() => router.push('/shop/vous')} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-2)]"><ChevronLeft className="w-6 h-6" /></button>
        <h1 className="text-[16px] font-semibold">Messages — vendeurs</h1>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto pb-24 md:pb-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-[11.5px] text-amber-200/85 bg-amber-500/10 border-y border-amber-400/15 px-4 py-2 leading-snug flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> Messagerie réservée aux échanges et litiges autour d’une commande (acheteur ↔ vendeur).
          </p>
          {loading ? (
            <div className="py-16 grid place-items-center text-[var(--t2m-ink-3)]"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : list.length === 0 ? (
            <div className="py-16 text-center px-6">
              <MessageCircle className="w-8 h-8 text-[var(--t2m-ink-3)] mx-auto mb-3" strokeWidth={1.6} />
              <p className="text-[var(--t2m-ink-3)] text-[14px]">Aucun message vendeur pour l’instant.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--t2m-line)]">
              {list.map((c) => (
                <li key={c.id}>
                  <button onClick={() => router.push(`/c/${c.id}`)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--t2m-wash)] text-left">
                    <span className="w-11 h-11 rounded-full overflow-hidden bg-[var(--t2m-wash)] grid place-items-center text-[var(--t2m-ink-3)] font-bold shrink-0">
                      {c.peer?.avatar_url ? <img src={c.peer.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.peer?.display_name || c.peer?.username || '?')[0]?.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-medium text-[var(--t2m-ink)] truncate">{c.peer?.display_name || c.peer?.username || 'Vendeur'}</div>
                      <div className="text-[12.5px] text-[var(--t2m-ink-3)] truncate">{c.last_message_preview || 'Nouvelle conversation'}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] text-[var(--t2m-ink-3)]">{when(c.last_message_at)}</span>
                      {c.unread_count > 0 && <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-medium grid place-items-center">{c.unread_count}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
