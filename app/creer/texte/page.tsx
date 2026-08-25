'use client';

/**
 * Talk2Me — Composer TEXTE/CARD = GabaritEditor (Pascal 2026-08-24, tâche #8).
 * REFONTE : l'ancien composer fond-noir (nuancier retiré) est remplacé par
 * `GabaritEditor` — le composer canonique WYSIWYG à FONDS COLORÉS (surensemble :
 * caméra live + import galerie + texte + son + produit + boutique). Un seul éditeur
 * partout (feed/brouillon/reprise). Le fond noir + les doublons sont dégagés.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import GabaritEditor from '@/components/cards/editors/GabaritEditor';
import { useCardCreationStore } from '@/lib/card-creation-store';

type Zone = 'video' | 'image' | 'son' | 'produit';

export default function CreerPage() {
  const router = useRouter();
  const presetMusic = useCardCreationStore((s) => s.presetMusic);
  // Params lus CÔTÉ CLIENT (au mount) → GabaritEditor s'initialise avec les vraies valeurs.
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useEffect(() => { setParams(new URLSearchParams(window.location.search)); }, []);

  if (!params) return <div className="w-full h-[100svh] bg-[var(--t2m-feed-bg)]" />;

  const start = params.get('start');
  const initialFocus: Zone | null = start === 'photo' ? 'image' : start === 'video' ? 'video' : null;
  const home = () => router.push('/home');

  return (
    <GabaritEditor
      onClose={home}
      onPublished={home}
      initialFocus={initialFocus}
      initialCaption={params.get('text') || null}
      initialTitle={params.get('title') || null}
      initialMediaUrl={params.get('url') || null}
      initialSon={presetMusic}
    />
  );
}
