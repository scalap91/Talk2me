'use client';

/**
 * Talk2Me #331 (Pascal 2026-06-04) — Page /saved-cards : bibliothèque
 * personnelle des cards bookmarkées par l'user.
 * Doctrine [[talktome-conversation-avant-recherche]] : les cards sont des
 * objets réutilisables, pas éphémères.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Send, Bookmark } from 'lucide-react';
import YouTubeEmbed from '@/components/embeds/YouTubeEmbed';
import PlaceCard from '@/components/cards/PlaceCard';
import RecipeCard from '@/components/cards/RecipeCard';
import ProductCard from '@/components/cards/ProductCard';
import WikipediaCard from '@/components/cards/WikipediaCard';
import WeatherCard from '@/components/cards/WeatherCard';
import SearchResultCard from '@/components/cards/SearchResultCard';
import CardActionsMenu, { type CardKind } from '@/components/cards/CardActionsMenu';
import type {
  YouTubeCardData,
  PlaceCardData,
  RecipeCardData,
  ProductCardData,
  WebSearchData,
} from '@/lib/chat-types';
import type { WikipediaCardData } from '@/lib/wikipedia-search';
import type { WeatherCardData } from '@/lib/weather';

interface SavedCard {
  id: string;
  card_kind: CardKind;
  card_data: unknown;
  title: string | null;
  note: string | null;
  saved_at: number;
  source_message_id: string | null;
  source_conv_id: string | null;
}

function formatDate(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function CardPreview({ card }: { card: SavedCard }) {
  const data = card.card_data;
  switch (card.card_kind) {
    case 'youtube': {
      const yt = data as YouTubeCardData;
      if (!yt?.video_id) return <FallbackPreview kind={card.card_kind} />;
      return (
        <YouTubeEmbed
          videoId={yt.video_id}
          originalUrl={`https://www.youtube.com/watch?v=${yt.video_id}`}
          rich={{
            title: yt.title,
            channel: yt.channel,
            description: yt.description,
          }}
        />
      );
    }
    case 'recipe':
      return <RecipeCard recipe={data as RecipeCardData} />;
    case 'wikipedia':
      return <WikipediaCard page={data as WikipediaCardData} />;
    case 'weather':
      return <WeatherCard weather={data as WeatherCardData} />;
    case 'web_search':
      return <SearchResultCard data={data as WebSearchData} />;
    case 'place': {
      const arr = Array.isArray(data)
        ? (data as PlaceCardData[])
        : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).places)
          ? ((data as Record<string, unknown>).places as PlaceCardData[])
          : [];
      if (arr.length === 0) return <FallbackPreview kind={card.card_kind} />;
      return <PlaceCard places={arr} />;
    }
    case 'product': {
      const arr = Array.isArray(data)
        ? (data as ProductCardData[])
        : [data as ProductCardData];
      return <ProductCard products={arr} />;
    }
    default:
      return <FallbackPreview kind={card.card_kind} />;
  }
}

function FallbackPreview({ kind }: { kind: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[13px] text-white/55">
      Card de type <span className="text-white/85 font-mono">{kind}</span>
    </div>
  );
}

export default function SavedCardsPage() {
  const router = useRouter();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [forwardingFor, setForwardingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/cards/saved', { cache: 'no-store' });
      if (r.status === 401) {
        router.replace('/signin');
        return;
      }
      const d = await r.json();
      if (Array.isArray(d?.cards)) setCards(d.cards);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette card ?')) return;
    try {
      const r = await fetch(`/api/cards/saved/${id}`, { method: 'DELETE' });
      if (r.ok) setCards((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-[100svh] w-full flex flex-col bg-[#0e0e12]">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0e12]/85 px-4 backdrop-blur-xl">
        <Link
          href="/profile"
          className="text-white/55 hover:text-white/90 transition-colors inline-flex items-center gap-1.5 text-[13px]"
        >
          <ArrowLeft size={18} />
          Retour
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-white/95">
          Mes cards
        </h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 flex justify-center px-4 py-6">
        <div className="w-full max-w-md space-y-4">
          {loading ? (
            <div className="text-center text-white/55 text-[13px] py-12">
              Chargement…
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center text-center py-16 gap-3">
              <Bookmark size={28} className="text-white/35" />
              <div className="text-[14px] text-white/65">
                Aucune card enregistrée pour le moment.
              </div>
              <div className="text-[12px] text-white/45 max-w-xs">
                Tape ⋯ sur une card dans une conversation pour l&apos;ajouter ici.
              </div>
            </div>
          ) : (
            cards.map((card) => (
              <div
                key={card.id}
                data-testid={`saved-card-${card.id}`}
                className="relative space-y-2"
              >
                <div className="text-[11px] uppercase tracking-wider text-white/45 flex items-center gap-2">
                  <span>{card.card_kind.replace('_', ' ')}</span>
                  <span className="opacity-50">·</span>
                  <span>{formatDate(card.saved_at)}</span>
                </div>
                <div className="relative">
                  <CardPreview card={card} />
                </div>
                {card.note && (
                  <p className="text-[12.5px] text-white/65 italic px-2">
                    {card.note}
                  </p>
                )}
                <div className="flex items-center gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => setForwardingFor(forwardingFor === card.id ? null : card.id)}
                    data-testid={`saved-card-forward-${card.id}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/[0.06] border border-white/10 text-white/85 text-[12px] hover:bg-white/[0.1] transition-colors"
                  >
                    <Send size={12} /> Envoyer
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(card.id)}
                    data-testid={`saved-card-delete-${card.id}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/[0.06] border border-white/10 text-red-300/85 text-[12px] hover:bg-red-500/10 hover:border-red-400/30 transition-colors"
                  >
                    <Trash2 size={12} /> Supprimer
                  </button>
                </div>
                {forwardingFor === card.id && (
                  <ForwardInline
                    cardId={card.id}
                    onDone={() => setForwardingFor(null)}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

function ForwardInline({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  const [friends, setFriends] = useState<
    Array<{ id: string; username: string; display_name: string | null }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/friends/list', { cache: 'no-store' });
        const d = await r.json();
        if (Array.isArray(d?.friends)) setFriends(d.friends);
      } catch {
        // ignore
      }
    })();
  }, []);

  async function handleSend() {
    if (!selectedId || sending) return;
    setSending(true);
    try {
      const convRes = await fetch('/api/conversations/create-p2p', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: selectedId }),
      });
      const convData = await convRes.json();
      if (!convRes.ok || !convData.conversation?.id) {
        setToast(convData.error || 'Erreur conv');
        return;
      }
      const r = await fetch('/api/cards/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          to_conv_id: convData.conversation.id,
          comment: comment.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        setToast('Envoyé');
        setTimeout(() => onDone(), 800);
      } else {
        setToast(d.error || 'Échec');
      }
    } catch {
      setToast('Erreur réseau');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2 p-3 rounded-2xl border border-white/10 bg-white/[0.04] space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-white/45">Envoyer à</div>
      <div className="flex flex-wrap gap-2">
        {friends.map((f) => {
          const active = selectedId === f.id;
          return (
            <button
              type="button"
              key={f.id}
              onClick={() => setSelectedId(f.id)}
              className={
                'inline-flex items-center gap-2 h-8 px-3 rounded-full text-[12px] transition-colors ' +
                (active
                  ? 'bg-red-500/20 border border-red-400/40 text-white'
                  : 'bg-white/[0.04] border border-white/10 text-white/75 hover:bg-white/[0.08]')
              }
            >
              {f.display_name || f.username}
            </button>
          );
        })}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Commentaire (optionnel)"
        className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[13px] text-white/95 placeholder-white/35 outline-none focus:border-red-400/60 resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={!selectedId || sending}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-red-500/85 text-white text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={12} />
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-8 px-3 rounded-full bg-white/[0.06] border border-white/10 text-white/75 text-[12px]"
        >
          Annuler
        </button>
        {toast && <span className="text-[11.5px] text-red-200/90">{toast}</span>}
      </div>
    </div>
  );
}
