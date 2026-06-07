'use client';

/**
 * Talk2Me #338 — Page debug user : visualiser et purger les habitudes apprises.
 *
 * Doctrine [[talk2me-roadmap-6-phases]] Phase 1 + [[talktome-ia-persistance-isolation]].
 * Permet à l'user de :
 *   - Voir ce que son IA a appris (par catégorie)
 *   - Supprimer une habit incorrecte
 *   - Tout effacer (reset complet, avec confirmation)
 *
 * Isolation : l'API renvoie UNIQUEMENT les habits du user courant.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Loader2, Brain, RefreshCcw, AlertTriangle } from 'lucide-react';

type HabitKind =
  | 'music_artist'
  | 'music_genre'
  | 'food_pref'
  | 'place_visited'
  | 'topic'
  | 'contact'
  | 'search_pattern';

interface HabitItem {
  id: string;
  kind: HabitKind;
  value: string;
  score: number;
  occurrences: number;
  first_seen_at: number;
  last_seen_at: number;
  source: string | null;
}

interface HabitsResponse {
  ok: boolean;
  total: number;
  groups: Array<{ kind: HabitKind; habits: HabitItem[] }>;
}

const KIND_LABELS: Record<HabitKind, { label: string; emoji: string }> = {
  music_artist: { label: 'Artistes musique', emoji: '🎤' },
  music_genre: { label: 'Genres musique', emoji: '🎵' },
  food_pref: { label: 'Cuisine / Nourriture', emoji: '🍽️' },
  place_visited: { label: 'Lieux fréquents', emoji: '📍' },
  topic: { label: 'Sujets fréquents', emoji: '💡' },
  contact: { label: 'Contacts mentionnés', emoji: '👤' },
  search_pattern: { label: 'Patterns de recherche', emoji: '🔍' },
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'à l\'instant';
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d}j`;
  const mo = Math.floor(d / 30);
  return `il y a ${mo}mo`;
}

export default function HabitsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HabitsResponse | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/me/habits', { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/signin');
        return;
      }
      const json = (await res.json()) as HabitsResponse;
      setData(json);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDeleteOne(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/me/habits/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // Optimistic update
        if (data) {
          setData({
            ...data,
            total: Math.max(0, data.total - 1),
            groups: data.groups.map((g) => ({
              ...g,
              habits: g.habits.filter((h) => h.id !== id),
            })),
          });
        }
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  async function onPurgeAll() {
    if (purging) return;
    setPurging(true);
    try {
      const res = await fetch('/api/me/habits/all', { method: 'DELETE' });
      if (res.ok) {
        setData({ ok: true, total: 0, groups: [] });
        setConfirmAll(false);
      }
    } catch {
      // ignore
    } finally {
      setPurging(false);
    }
  }

  const totalCount = data?.total ?? 0;
  const nonEmptyGroups = (data?.groups || []).filter((g) => g.habits.length > 0);

  return (
    <main className="min-h-[100dvh] w-full flex flex-col bg-[#0e0e12]">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/8 bg-[#0e0e12]/85 px-4 backdrop-blur-xl">
        <Link
          href="/profile"
          className="text-white/55 hover:text-white/90 transition-colors inline-flex items-center gap-1.5 text-[13px]"
        >
          <ArrowLeft size={18} />
          Profil
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-white/95">
          Habitudes apprises
        </h1>
        <button
          onClick={() => load()}
          className="text-white/55 hover:text-white/90 transition-colors"
          aria-label="Rafraîchir"
        >
          <RefreshCcw size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* Intro */}
          <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-500/15 p-2 text-red-300">
                <Brain size={20} />
              </div>
              <div>
                <h2 className="text-[15px] font-medium text-white/95">
                  Ce que ton IA a appris de toi
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-white/55">
                  Talk2Me observe tes interactions pour personnaliser ses
                  réponses (musique, cuisine, lieux, sujets…). Tu peux supprimer
                  ce que tu veux. Ces données sont strictement privées et
                  isolées à ton compte.
                </p>
                <p className="mt-2 text-[12px] text-white/40">
                  Total : <span className="text-white/70 font-medium">{totalCount}</span>{' '}
                  {totalCount > 1 ? 'habitudes' : 'habitude'}
                </p>
              </div>
            </div>
          </section>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-10 text-white/40">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {!loading && totalCount === 0 && (
            <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
              <p className="text-[14px] text-white/55">
                Aucune habitude apprise pour l&apos;instant.
              </p>
              <p className="mt-1 text-[12px] text-white/35">
                Discute avec ton IA pour qu&apos;elle commence à te connaître.
              </p>
            </section>
          )}

          {/* Erreur */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-300">
              {error}
            </div>
          )}

          {/* Groupes */}
          {!loading &&
            nonEmptyGroups.map((g) => (
              <section
                key={g.kind}
                className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden"
              >
                <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <h3 className="flex items-center gap-2 text-[14px] font-medium text-white/90">
                    <span>{KIND_LABELS[g.kind].emoji}</span>
                    <span>{KIND_LABELS[g.kind].label}</span>
                  </h3>
                  <span className="text-[11px] text-white/40">
                    {g.habits.length}
                  </span>
                </header>
                <ul>
                  {g.habits.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] text-white/90">
                          {h.value}
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/40">
                          score {h.score} · ×{h.occurrences} ·{' '}
                          {relativeTime(h.last_seen_at)}
                          {h.source ? ` · ${h.source}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => onDeleteOne(h.id)}
                        disabled={deletingId === h.id}
                        className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-red-300 transition-colors disabled:opacity-40"
                        aria-label="Supprimer"
                      >
                        {deletingId === h.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          {/* Tout effacer */}
          {totalCount > 0 && (
            <section className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 text-red-400" />
                <div className="flex-1">
                  <h3 className="text-[14px] font-medium text-red-200">
                    Tout effacer
                  </h3>
                  <p className="mt-1 text-[12px] text-red-200/60">
                    Supprime toutes les habitudes apprises. Ton IA recommencera
                    à apprendre de zéro.
                  </p>
                  {!confirmAll ? (
                    <button
                      onClick={() => setConfirmAll(true)}
                      className="mt-3 rounded-lg border border-red-500/30 px-3 py-1.5 text-[12px] font-medium text-red-200 hover:bg-red-500/10 transition-colors"
                    >
                      Tout effacer…
                    </button>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={onPurgeAll}
                        disabled={purging}
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {purging ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            Effacement…
                          </span>
                        ) : (
                          'Confirmer'
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmAll(false)}
                        disabled={purging}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/5 transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
