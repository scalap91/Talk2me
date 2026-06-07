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
import { saveDraftNow, deleteDraftNow } from '@/lib/use-draft-autosave';
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
  /** Reprise d'un brouillon gabarit. */
  resumeDraftId?: string | null;
  initialVideoUrl?: string | null;
  initialCaption?: string | null;
  initialSon?: UnifiedCard | null;
}

export default function GabaritEditor({
  onClose,
  onPublished,
  aiName = null,
  aiAvatarUrl = null,
  initialFocus = null,
  initialProduct = null,
  resumeDraftId = null,
  initialVideoUrl = null,
  initialCaption = null,
  initialSon = null,
}: Props) {
  const [videoUrl, setVideoUrl] = useState<string | null>(initialVideoUrl);
  const [caption, setCaption] = useState<string | null>(initialCaption);
  const [son, setSon] = useState<UnifiedCard | null>(initialSon);
  const [produit, setProduit] = useState<ProductCardData | null>(initialProduct);
  const [zone, setZone] = useState<Zone | null>(initialFocus);
  const [draftId, setDraftId] = useState<string | null>(resumeDraftId);
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
      if (draftId) await deleteDraftNow(draftId); // brouillon consommé
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setPublishing(false);
    }
  };

  // Brouillon : draft de type 'gabarit' → reprend sur CETTE page de composition
  // (et non sur l'éditeur vidéo). Pascal 2026-06-07.
  const [savingDraft, setSavingDraft] = useState(false);
  const saveDraft = async () => {
    setSavingDraft(true);
    try {
      const id = await saveDraftNow({
        id: draftId,
        type: 'gabarit',
        draftData: { videoUrl, caption, son, produit },
        thumbnailUrl: videoUrl || produit?.image_url || null,
        title: caption || produit?.title || 'Composition',
      });
      if (id) setDraftId(id);
    } finally {
      setSavingDraft(false);
      onClose();
    }
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

      {/* Canvas PLEINE HAUTEUR = proportion réelle du post. Zones = rectangles
          étiquetés (plus parlant). Bas : Son (1/4) + Produit (3/4 droite). */}
      <div className="flex-1 min-h-0 p-3 flex flex-col gap-2.5">
        {/* ZONE VIDÉO (grande, prend la hauteur restante) */}
        <button
          type="button"
          onClick={() => setZone('video')}
          className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/12 bg-white/[0.03] flex flex-col items-center justify-center gap-1.5 text-white/70 active:scale-[0.99] transition"
        >
          {videoUrl && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={videoUrl} muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-90" />
          )}
          <div className="relative z-10 flex flex-col items-center gap-1.5">
            <span className={'w-12 h-12 rounded-full flex items-center justify-center ' + (videoUrl ? 'bg-black/55' : 'bg-white/[0.06]')}>
              {videoUrl ? <Check className="w-6 h-6 text-emerald-300" /> : <VideoIcon className="w-6 h-6 text-white/75" />}
            </span>
            <span className="text-[14px] font-semibold text-white/90">Vidéo</span>
            <span className="text-[11px] text-white/50">
              {videoUrl ? 'ajoutée — tape pour modifier' : 'tape pour ajouter ta vidéo'}
            </span>
          </div>
        </button>

        {/* RANGÉE BAS : Son (1/4) + Produit (3/4 droite) */}
        <div className="flex gap-2.5 h-36 shrink-0">
          {/* SON — 1/4 */}
          <button
            type="button"
            onClick={() => setZone('son')}
            className="basis-1/4 relative rounded-2xl overflow-hidden border border-white/12 bg-white/[0.03] flex flex-col items-center justify-center gap-1 p-1.5 text-center active:scale-[0.98] transition"
          >
            <span className="relative w-11 h-11 rounded-full bg-black/40 border border-white/15 flex items-center justify-center overflow-hidden">
              {son && sonCover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sonCover} alt="" className="w-full h-full object-cover" />
              ) : (
                <Disc3 className="w-6 h-6 text-white/75" />
              )}
            </span>
            <span className="text-[12px] font-semibold text-white/85">Son</span>
            <span className="text-[10px] text-white/45 leading-tight line-clamp-2">
              {son ? son.title : 'fond musical (30%)'}
            </span>
          </button>

          {/* PRODUIT — 3/4 droite */}
          <button
            type="button"
            onClick={() => setZone('produit')}
            className="basis-3/4 relative rounded-2xl overflow-hidden border border-violet-400/25 bg-violet-500/[0.06] flex items-center gap-3 p-3 text-left active:scale-[0.98] transition"
          >
            <span className="relative w-[88px] h-[88px] rounded-xl overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
              {produit?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={produit.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <ShoppingBag className="w-8 h-8 text-violet-300" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-violet-100">Produit</div>
              {produit ? (
                <>
                  <div className="text-[12px] text-white/90 line-clamp-2 mt-0.5">{produit.title}</div>
                  {produit.price_label && (
                    <div className="text-[12px] text-violet-200/90 mt-0.5">{produit.price_label}</div>
                  )}
                </>
              ) : (
                <div className="text-[11px] text-white/50 mt-0.5 leading-tight">
                  Apparaît dans le Shop. Tape pour rechercher un produit ou coller un lien.
                </div>
              )}
            </div>
          </button>
        </div>

        {error && (
          <p className="text-[12px] text-red-300/90 text-center shrink-0">{error}</p>
        )}
      </div>

      {/* Barre Brouillon / Publier */}
      <div className="shrink-0 border-t border-white/8 p-3 flex gap-2 max-w-md mx-auto w-full">
        <button
          type="button"
          onClick={saveDraft}
          disabled={savingDraft}
          className="flex-1 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 font-medium active:scale-[0.98] transition disabled:opacity-50"
        >
          {savingDraft ? 'Enregistrement…' : 'Brouillon'}
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
