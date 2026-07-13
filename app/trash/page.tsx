'use client';

/**
 * /trash — Corbeille des cards soft-deleted (30 jours).
 *
 * Talk2Me Lot A (Pascal 2026-06-04). Doctrine [[talk2me-card-vivante]] +
 * master prompt point 14 ("restaurer une Card supprimée récemment").
 *
 * Actions :
 *   - Restaurer        → POST /api/cards/[id]/restore?kind=...
 *   - Supprimer défin. → DELETE /api/cards/[id]?kind=...&hard=1 (avec confirm)
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Image as ImageIcon,
  Video as VideoIcon,
  Type as TypeIconLucide,
  MessageSquare,
  RotateCcw,
  Trash2,
  Layers,
} from '@/lib/icons';
import DeleteCardConfirm from '@/components/cards/DeleteCardConfirm';

interface TrashCardDto {
  card_kind: 'direct_card' | 'post';
  id: string;
  type: 'image' | 'video' | 'texte' | 'conv_clip';
  thumbnail_url: string | null;
  title: string | null;
  preview_text: string | null;
  deleted_at: number;
  expires_at: number;
  like_count: number;
  view_count: number;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'à l’instant';
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  return `il y a ${Math.floor(diff / 86_400_000)} j`;
}

function formatRemaining(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'expirée';
  const days = Math.ceil(diff / 86_400_000);
  return `expire dans ${days} j`;
}

function TypeIcon({ type }: { type: TrashCardDto['type'] }) {
  const cls = 'w-4 h-4';
  if (type === 'image') return <ImageIcon className={cls} />;
  if (type === 'video') return <VideoIcon className={cls} />;
  if (type === 'conv_clip') return <MessageSquare className={cls} />;
  return <TypeIconLucide className={cls} />;
}

function typeLabel(type: TrashCardDto['type']): string {
  if (type === 'image') return 'Photo';
  if (type === 'video') return 'Vidéo';
  if (type === 'conv_clip') return 'Conv';
  return 'Texte';
}

function Thumb({ c }: { c: TrashCardDto }) {
  if (c.thumbnail_url) {
    if (c.type === 'video') {
      return (
        <video
          src={c.thumbnail_url}
          muted
          playsInline
          preload="metadata"
          className="w-16 h-16 object-cover rounded-xl border border-[var(--t2m-line)] bg-black"
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={c.thumbnail_url}
        alt={c.title || 'Card'}
        className="w-16 h-16 object-cover rounded-xl border border-[var(--t2m-line)] bg-black"
      />
    );
  }
  const bg =
    c.type === 'texte'
      ? 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)'
      : c.type === 'conv_clip'
        ? 'linear-gradient(135deg, #18233a 0%, #213254 100%)'
        : 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)';
  return (
    <div
      className="w-16 h-16 rounded-xl border border-[var(--t2m-line)] flex items-center justify-center text-[var(--t2m-ink-3)]"
      style={{ background: bg }}
    >
      <TypeIcon type={c.type} />
    </div>
  );
}

export default function TrashPage() {
  const router = useRouter();
  const [cards, setCards] = useState<TrashCardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    cardKind: 'direct_card' | 'post';
    cardId: string;
  } | null>(null);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      // scope=admin : si super-admin → corbeille de MODÉRATION (tous les posts
      // supprimés via la croix admin) ; sinon le serveur l'ignore et renvoie la
      // corbeille perso. Permet Restaurer / Supprimer définitivement.
      const r = await fetch('/api/cards/trash?scope=admin', { cache: 'no-store' });
      if (r.status === 401) {
        router.replace('/signin');
        return;
      }
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d?.cards)) setCards(d.cards);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  const onRestore = useCallback(
    async (c: TrashCardDto) => {
      setBusy(c.id);
      try {
        const r = await fetch(
          `/api/cards/${encodeURIComponent(c.id)}/restore?kind=${c.card_kind}`,
          { method: 'POST', credentials: 'include' }
        );
        if (r.ok) {
          setCards((prev) => prev.filter((x) => x.id !== c.id));
        }
      } finally {
        setBusy(null);
      }
    },
    []
  );

  return (
    <main className="min-h-[100svh] w-full flex flex-col bg-[var(--t2m-paper)]">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 px-4 backdrop-blur-xl">
        <Link
          href="/profile"
          className="text-[var(--t2m-ink-3)] hover:text-[var(--t2m-ink)] transition-colors inline-flex items-center gap-1.5 text-[13px]"
        >
          <ArrowLeft size={18} />
          Profil
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-[var(--t2m-ink)]">
          Corbeille
        </h1>
        <span className="text-[11px] text-[var(--t2m-ink-3)] w-12 text-right">
          {cards.length}
        </span>
      </header>

      <div className="flex-1 flex justify-center px-4 py-6">
        <div className="t2m-page space-y-3">
          <p className="text-[12.5px] text-[var(--t2m-ink-3)] leading-snug">
            Les cards supprimées restent 30 jours dans la corbeille puis sont
            effacées définitivement. Tu peux les restaurer en un tap.
          </p>

          {loading && (
            <div className="text-center text-[var(--t2m-ink-3)] text-[13px] py-12">
              Chargement…
            </div>
          )}

          {!loading && cards.length === 0 && (
            <div
              className="flex flex-col items-center text-center pt-16 px-6 gap-3"
              data-testid="trash-empty"
            >
              <div className="w-16 h-16 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] flex items-center justify-center mb-1">
                <Layers className="text-[var(--t2m-ink-3)]" size={24} />
              </div>
              <div className="text-[14.5px] font-medium text-[var(--t2m-ink)]">
                Corbeille vide
              </div>
              <p className="text-[12.5px] text-[var(--t2m-ink-3)] leading-relaxed max-w-xs">
                Tu n&apos;as supprimé aucune card récemment.
              </p>
            </div>
          )}

          {!loading && cards.length > 0 && (
            <ul className="divide-y divide-[var(--t2m-line)] rounded-2xl border border-[var(--t2m-line)] bg-white shadow-[0_2px_10px_rgba(47,52,58,.05)] overflow-hidden">
              {cards.map((c) => (
                <li
                  key={`${c.card_kind}-${c.id}`}
                  data-testid={`trash-item-${c.id}`}
                  className="flex items-center gap-3 px-3 py-3"
                >
                  <Thumb c={c} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-3)] inline-flex items-center gap-1">
                        <TypeIcon type={c.type} />
                        {typeLabel(c.type)}
                      </span>
                    </div>
                    <div className="text-[14px] font-medium text-[var(--t2m-ink)] truncate mt-1">
                      {c.title?.trim() ||
                        c.preview_text?.trim() ||
                        'Sans titre'}
                    </div>
                    <div className="flex items-center gap-3 text-[11.5px] text-[var(--t2m-ink-3)] mt-0.5">
                      <span>{formatRelative(c.deleted_at)}</span>
                      <span className="text-amber-200/70">
                        {formatRemaining(c.expires_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRestore(c)}
                      disabled={busy === c.id}
                      data-testid={`trash-restore-${c.id}`}
                      aria-label="Restaurer la card"
                      className="w-9 h-9 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-red-500 flex items-center justify-center hover:bg-red-500/10 hover:border-red-400/30 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({ cardKind: c.card_kind, cardId: c.id })
                      }
                      data-testid={`trash-hard-delete-${c.id}`}
                      aria-label="Supprimer définitivement"
                      className="w-9 h-9 rounded-full bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-red-500 flex items-center justify-center hover:bg-red-500/10 hover:border-red-400/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirm && (
        <DeleteCardConfirm
          cardKind={confirm.cardKind}
          cardId={confirm.cardId}
          hard
          onCancel={() => setConfirm(null)}
          onDeleted={() => {
            setCards((prev) => prev.filter((x) => x.id !== confirm.cardId));
            setConfirm(null);
          }}
        />
      )}
    </main>
  );
}
