'use client';
/**
 * useHasStory (Pascal 2026-08-30) — dit si un utilisateur a une STORY FRAÎCHE (active), pour dessiner
 * le LISERÉ autour de sa bulle PARTOUT (feed, commentaires, recherche, discussions…). Un SEUL fetch
 * `/api/status` partagé par toutes les bulles (cache module + useSyncExternalStore), pas un appel par
 * avatar. Se rafraîchit sur événement `ttm:stories:refresh` (ex. après avoir posté/vu une story).
 */
import { useSyncExternalStore } from 'react';

export interface StoryGroup { ownerId: string; username: string; name: string; avatar: string | null }

let usernames = new Set<string>();
let groupByUser = new Map<string, StoryGroup>();
let loaded = false;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

interface RawGroup { owner_id: string; username: string; display_name?: string | null; avatar_url?: string | null; mine?: boolean }

async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    const d = await r.json();
    if (d?.ok) {
      // Un groupe = un user AVEC une story active (≤24h) → « fraîche ». On exclut la mienne.
      const others: RawGroup[] = (d.groups || []).filter((g: RawGroup) => !g.mine);
      usernames = new Set<string>(others.map((g) => g.username));
      groupByUser = new Map<string, StoryGroup>(others.map((g) => [g.username, { ownerId: g.owner_id, username: g.username, name: g.display_name || g.username, avatar: g.avatar_url ?? null }]));
      loaded = true;
      emit();
    }
  } catch { /* anon / erreur → aucun liseré */ } finally { loading = false; }
}

/** Groupe story d'un pseudo (owner_id + nom + avatar), lu dans le cache partagé — pour ouvrir la story
 *  depuis n'importe quelle bulle sans refetch. null si pas de story fraîche. */
export function getStoryGroup(username?: string | null): StoryGroup | null {
  return username ? (groupByUser.get(username) ?? null) : null;
}

// Rafraîchissement externe (après post/vue de story).
if (typeof window !== 'undefined') {
  window.addEventListener('ttm:stories:refresh', () => { loaded = false; load(); });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!loaded && !loading) load();
  return () => { listeners.delete(cb); };
}

export function useHasStory(username?: string | null): boolean {
  const snapshot = () => (username ? usernames.has(username) : false);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
