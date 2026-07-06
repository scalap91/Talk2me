'use client';

/**
 * Talk2Me — hook client pour lire l'état des fonctionnalités globales ON/OFF
 * (ex. pièces 3D). UN seul fetch partagé (cache module) quel que soit le nombre
 * de composants montés (PostShell est rendu par item). Pascal 2026-06-21.
 */
import { useEffect, useState } from 'react';

type Features = { piece3d: boolean; unified_feed: boolean; cardos: boolean };
const FEATURES_OFF: Features = { piece3d: false, unified_feed: false, cardos: false };
let cache: Features | null = null;
let inflight: Promise<Features> | null = null;

function load(): Promise<Features> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch('/api/features/state', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d) => { cache = (d?.features as Features) || FEATURES_OFF; return cache; })
    .catch(() => { cache = FEATURES_OFF; return cache; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** true/false une fois chargé ; false tant que pas connu (sûr par défaut). */
export function useFeature(name: keyof Features): boolean {
  const [on, setOn] = useState<boolean>(cache ? cache[name] : false);
  useEffect(() => { let alive = true; load().then((f) => { if (alive) setOn(!!f[name]); }); return () => { alive = false; }; }, [name]);
  return on;
}

/** Tri-état pour gater une page entière sans flash : 'loading' | 'on' | 'off'. */
export function useFeatureGate(name: keyof Features): 'loading' | 'on' | 'off' {
  const [gate, setGate] = useState<'loading' | 'on' | 'off'>(cache ? (cache[name] ? 'on' : 'off') : 'loading');
  useEffect(() => { let alive = true; load().then((f) => { if (alive) setGate(f[name] ? 'on' : 'off'); }); return () => { alive = false; }; }, [name]);
  return gate;
}
