'use client';

/**
 * Talk2Me #426 — GabaritEditor (Pascal 2026-06-07).
 *
 * LA page de composition où on REVIENT voir le résultat. Un gabarit à zones :
 *   - grand rectangle en haut = VIDÉO
 *   - deux petites zones en bas = SON (fond musical) + PRODUIT (→ Shop)
 * On tape une zone → on entre dans l'éditeur propre à cette zone → on revient
 * sur le gabarit → on voit le résultat dans la zone → on publie ou brouillon.
 *
 * La vidéo garde son son ; le son attaché est un FOND musical par-dessus
 * (mix géré à l'affichage). Le produit fait aller la card dans le Shop.
 */

import { useState } from 'react';
import { X, Video as VideoIcon, Disc3, ShoppingBag, Check } from 'lucide-react';
import VideoCardEditor from '@/components/cards/editors/VideoCardEditor';
import SonPicker from '@/components/cards/editors/SonPicker';
import ProductPicker from '@/components/cards/editors/ProductPicker';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';

type Zone = 'video' | 'son' | 'produit';

interface Props {
  onClose: () => void;
  onPublished: () => void;
  aiName?: string | null;
  aiAvatarUrl?: string | null;
  /** Ouvre direct l'éditeur d'une zone au montage (entrée depuis une zone). */
  initialFocus?: Zone | null;
  /** Produit pré-attaché (chemin "via Léa"). */
  initialProduct?: ProductCardData | null;
}

export default function GabaritEditor({
  onClose,
  onPublished,
  aiName = null,
  aiAvatarUrl = null,
  initialFocus = null,
  initialProduct = null,
}: Props) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [son, setSon] = useState<UnifiedCard | null>(null);
  const [produit, setProduit] = useState<ProductCardData | null>(initialProduct);
  const [zone, setZone] = useState<Zone | null>(initialFocus);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sonVideoId = (son?.meta as { youtube_video_id?: string } | undefined)?.youtube_video_id;
  const sonCover = son?.thumbnail_url || (sonVideoId ? `https://i.ytimg.com/vi/${sonVideoId}/hqdefault.jpg` : null);

  const publish = async () => {
    if (!videoUrl) {
      setError('Ajoute une vidéo dans la zone du haut.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch('/api/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          media_url: videoUrl,
          caption: caption || null,
          attached_audio: son ?? null,
          attached_product: produit ?? null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Publication échouée');
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setPublishing(false);
    }
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(
        'talktome:gabarit-draft',
        JSON.stringify({ videoUrl, caption, son, produit, ts: Date.now() })
      );
    } catch {
      /* noop */
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0d] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/8">
        <button type="button" onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/80">
          <X className="w-4 h-4" />
        </button>
        <span className="text-[15px] font-semibold text-white/95">Composer ta card</span>
        <div className="w-9" />
      </div>

      {/* Canvas gabarit */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-[12.5px] text-white/50 mb-3 max-w-md mx-auto">
          Tape une zone pour la remplir, reviens ici pour voir le résultat.
        </p>
        <div className="max-w-md mx-auto space-y-2.5">
          {/* Zone VIDÉO (grand rectangle) */}
          <button
            type="button"
            onClick={() => setZone('video')}
            className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden border border-white/12 bg-white/[0.03] flex items-center justify-center active:scale-[0.99] transition"
          >
            {videoUrl ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={videoUrl} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/60 text-white flex items-center gap-1">
                  <Check className="w-3 h-3" /> Modifier la vidéo
                </span>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/55">
                <VideoIcon className="w-8 h-8" />
                <span className="text-[13px]">Ajouter ta vidéo</span>
              </div>
            )}
          </button>

          {/* Deux petites zones : SON + PRODUIT */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setZone('son')}
              className="relative aspect-square rounded-2xl overflow-hidden border border-white/12 bg-white/[0.03] flex flex-col items-center justify-center gap-1.5 p-2 active:scale-[0.98] transition"
            >
              {son ? (
                <>
                  {sonCover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sonCover} alt="" className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <Disc3 className="w-10 h-10 text-white/70" />
                  )}
                  <span className="text-[11px] text-white/85 text-center line-clamp-1 px-1">{son.title}</span>
                  <span className="text-[10px] text-violet-200/80">Changer le son</span>
                </>
              ) : (
                <>
                  <Disc3 className="w-8 h-8 text-white/55" />
                  <span className="text-[12px] text-white/55">Ajouter un son</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setZone('produit')}
              className="relative aspect-square rounded-2xl overflow-hidden border border-white/12 bg-white/[0.03] flex flex-col items-center justify-center gap-1.5 p-2 active:scale-[0.98] transition"
            >
              {produit ? (
                <>
                  {produit.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={produit.image_url} alt="" className="w-14 h-14 rounded-lg object-cover" />
                  ) : (
                    <ShoppingBag className="w-10 h-10 text-violet-300" />
                  )}
                  <span className="text-[11px] text-white/85 text-center line-clamp-1 px-1">{produit.title}</span>
                  {produit.price_label && <span className="text-[10px] text-violet-200/90">{produit.price_label}</span>}
                </>
              ) : (
                <>
                  <ShoppingBag className="w-8 h-8 text-violet-300/80" />
                  <span className="text-[12px] text-violet-200/90">Ajouter un produit</span>
                </>
              )}
            </button>
          </div>

          {error && <p className="text-[12px] text-red-300/90">{error}</p>}
        </div>
      </div>

      {/* Barre Brouillon / Publier */}
      <div className="shrink-0 border-t border-white/8 p-3 flex gap-2 max-w-md mx-auto w-full">
        <button
          type="button"
          onClick={saveDraft}
          className="flex-1 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 font-medium active:scale-[0.98] transition"
        >
          Brouillon
        </button>
        <button
          type="button"
          onClick={publish}
          disabled={publishing || !videoUrl}
          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-red-700 text-white font-semibold disabled:opacity-40 active:scale-[0.98] transition"
        >
          {publishing ? 'Publication…' : 'Publier'}
        </button>
      </div>

      {/* Sous-éditeurs en surcouche → reviennent au gabarit */}
      {zone === 'video' && (
        <VideoCardEditor
          onClose={() => setZone(null)}
          onPublished={() => setZone(null)}
          aiName={aiName}
          aiAvatarUrl={aiAvatarUrl}
          returnMode
          onResult={({ videoUrl: v, caption: c }) => {
            setVideoUrl(v);
            if (c) setCaption(c);
            setZone(null);
          }}
        />
      )}
      {zone === 'son' && (
        <SonPicker
          onPick={(m) => {
            setSon(m);
            setZone(null);
          }}
          onClose={() => setZone(null)}
        />
      )}
      {zone === 'produit' && (
        <ProductPicker
          onPick={(p) => {
            setProduit(p);
            setZone(null);
          }}
          onClose={() => setZone(null)}
        />
      )}
    </div>
  );
}
