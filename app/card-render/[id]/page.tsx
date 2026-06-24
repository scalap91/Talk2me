'use client';

/**
 * Talk2Me — page de RENDU d'une card seule (LOT 2, Pascal 2026-06-23), taille fixe 600×800.
 * Affiche la card AVEC LES MÊMES composants que le feed → le screenshot de cette page (via
 * /api/card-preview) est l'aperçu EXACT du post pour la recherche. Pas de nav, pas de chrome.
 * Quand prête, pose un marqueur #render-ready pour que la capture attende le rendu.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ImageCardDisplay from '@/components/feed/ImageCardDisplay';
import VideoCardDisplay from '@/components/feed/VideoCardDisplay';
import TexteCardDisplay from '@/components/feed/TexteCardDisplay';

export default function CardRender() {
  const params = useParams();
  const id = String(params?.id || '');
  const [card, setCard] = useState<Record<string, unknown> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch('/api/cards/render-data?id=' + encodeURIComponent(id), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.card) setCard(d.card); setTimeout(() => setReady(true), 600); })
      .catch(() => setReady(true));
  }, [id]);

  const kind = card?.kind as string | undefined;

  return (
    <div id={ready ? 'render-ready' : 'render-loading'} style={{ width: 600, height: 800, position: 'relative', overflow: 'hidden', background: '#0b0b0d' }}>
      {card && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {kind === 'video_card' && <VideoCardDisplay card={card as never} cardKind="direct_card" fullScreen />}
          {kind === 'image_card' && <ImageCardDisplay card={card as never} cardKind="direct_card" fullScreen />}
          {kind === 'texte_card' && <TexteCardDisplay card={card as never} cardKind="direct_card" fullScreen />}
        </div>
      )}
    </div>
  );
}
