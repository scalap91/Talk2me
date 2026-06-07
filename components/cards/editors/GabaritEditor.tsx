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

import { useState, useEffect, useRef } from 'react';
import { X, Video as VideoIcon, Image as ImageIcon, Disc3, ShoppingBag, Check } from 'lucide-react';
import InlineCamera from '@/components/cards/editors/InlineCamera';
import SonPicker from '@/components/cards/editors/SonPicker';
import ProductPicker from '@/components/cards/editors/ProductPicker';
import { saveDraftNow, deleteDraftNow } from '@/lib/use-draft-autosave';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';

type Zone = 'video' | 'image' | 'son' | 'produit';

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
  initialMediaUrl?: string | null;
  initialMediaType?: 'image' | 'video' | null;
  initialCaption?: string | null;
  initialTitle?: string | null;
  initialDescription?: string | null;
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
  initialMediaUrl = null,
  initialMediaType = null,
  initialCaption = null,
  initialTitle = null,
  initialDescription = null,
  initialSon = null,
}: Props) {
  // Talk2Me #428 — média = photo OU vidéo (le composer ouvre le bon éditeur).
  const [mediaUrl, setMediaUrl] = useState<string | null>(initialMediaUrl ?? initialVideoUrl);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(
    initialMediaType ?? (initialVideoUrl ? 'video' : null)
  );
  // Talk2Me #428 — zone titre + description du composer (tout part de là).
  const [title, setTitle] = useState<string>(initialTitle ?? initialCaption ?? '');
  const [description, setDescription] = useState<string>(initialDescription ?? '');
  const [son, setSon] = useState<UnifiedCard | null>(initialSon);
  const [produit, setProduit] = useState<ProductCardData | null>(initialProduct);
  const [zone, setZone] = useState<Zone | null>(
    initialFocus === 'son' || initialFocus === 'produit' ? initialFocus : null
  );
  // Capture INLINE dans le composer (caméra live), pas de page séparée.
  const [capture, setCapture] = useState<'photo' | 'video' | null>(
    initialFocus === 'video' ? 'video' : initialFocus === 'image' ? 'photo' : null
  );
  const [, setDraftId] = useState<string | null>(resumeDraftId);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs pour l'auto-save (évite les closures périmées dans les timers).
  const draftIdRef = useRef<string | null>(resumeDraftId);
  const publishedRef = useRef(false);

  const sonVideoId = (son?.meta as { youtube_video_id?: string } | undefined)?.youtube_video_id;
  const sonCover = son?.thumbnail_url || (sonVideoId ? `https://i.ytimg.com/vi/${sonVideoId}/hqdefault.jpg` : null);

  const hasContent = !!(mediaUrl || son || produit || title.trim() || description.trim());

  // Caption finale = titre + description (zone du composer).
  const buildCaption = () =>
    [title.trim(), description.trim()].filter(Boolean).join('\n').slice(0, 200) || null;

  // Sauvegarde / MAJ du brouillon 'gabarit' (reprend sur la page de compo).
  const saveDraftCore = async (): Promise<string | null> => {
    const id = await saveDraftNow({
      id: draftIdRef.current,
      type: 'gabarit',
      draftData: { mediaUrl, mediaType, title, description, son, produit },
      thumbnailUrl: mediaUrl || produit?.image_url || null,
      title: title.trim() || produit?.title || 'Composition',
    });
    if (id) {
      draftIdRef.current = id;
      setDraftId(id);
    }
    return id;
  };

  // Auto-save DISCRET pendant qu'on remplit (Pascal : "si j'ai pas fini, il
  // faut quand même que ça se mette en brouillon"). Debounce 1,2s.
  useEffect(() => {
    if (publishedRef.current || !hasContent) return;
    const t = setTimeout(() => {
      void saveDraftCore();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrl, mediaType, title, description, son, produit]);

  const publish = async () => {
    if (!mediaUrl) {
      setError('Ajoute une photo ou une vidéo dans la zone média.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch('/api/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: mediaType || 'video',
          media_url: mediaUrl,
          caption: buildCaption(),
          attached_audio: son ?? null,
          attached_product: produit ?? null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Publication échouée');
      publishedRef.current = true;
      if (draftIdRef.current) await deleteDraftNow(draftIdRef.current); // brouillon consommé
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setPublishing(false);
    }
  };

  // Bouton Brouillon explicite → sauve + ferme.
  const saveDraft = async () => {
    setSavingDraft(true);
    try {
      await saveDraftCore();
    } finally {
      setSavingDraft(false);
      onClose();
    }
  };

  // Fermeture (X) : si pas publié et qu'il y a du contenu → auto-brouillon
  // (on ne perd jamais une compo en cours).
  const closeWithAutosave = async () => {
    if (!publishedRef.current && hasContent) {
      try {
        await saveDraftCore();
      } catch {
        /* noop */
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0d] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/8">
        <button type="button" onClick={closeWithAutosave} aria-label="Fermer" className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/80">
          <X className="w-4 h-4" />
        </button>
        <span className="text-[15px] font-semibold text-white/95">Composer ta card</span>
        <span className="text-[10px] text-white/30 w-9 text-right">{hasContent ? 'auto' : ''}</span>
      </div>

      {/* Canvas PLEINE HAUTEUR = proportion réelle du post. Zones = rectangles
          étiquetés (plus parlant). Bas : Son (1/4) + Produit (3/4 droite). */}
      <div className="flex-1 min-h-0 p-3 flex flex-col gap-2.5">
        {/* ZONE TITRE + DESCRIPTION (tout en haut). Formats imposés pour un
            rendu propre : titre 1 ligne (60), description 2 lignes (140). */}
        <div className="shrink-0 rounded-2xl border border-white/12 bg-white/[0.03] px-3 py-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 60))}
            maxLength={60}
            placeholder="Titre"
            className="w-full bg-transparent text-[16px] font-semibold text-white placeholder:text-white/35 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 140))}
            maxLength={140}
            rows={2}
            placeholder="Description"
            className="w-full mt-1 bg-transparent text-[13px] text-white/85 placeholder:text-white/35 focus:outline-none resize-none"
          />
          <div className="text-[10px] text-white/30 text-right">{title.length}/60 · {description.length}/140</div>
        </div>

        {/* ZONE MÉDIA (grande) — Photo OU Vidéo. Le composer ouvre le bon
            éditeur ; on charge le média, puis on l'édite. */}
        <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden border border-white/12 bg-white/[0.03] flex flex-col items-center justify-center gap-2">
          {mediaUrl && mediaType === 'video' && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={mediaUrl} muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-90" />
          )}
          {mediaUrl && mediaType === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          {/* Caméra INLINE (capture dans le composer) */}
          {capture && (
            <InlineCamera
              mode={capture}
              onCapture={({ url, type }) => {
                setMediaUrl(url);
                setMediaType(type);
                setCapture(null);
              }}
              onCancel={() => setCapture(null)}
            />
          )}

          {!capture && mediaUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-between p-3">
              <span className="px-3 py-1 rounded-full text-[11px] font-medium bg-black/55 text-white flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-300" /> {mediaType === 'image' ? 'Photo' : 'Vidéo'} prête
              </span>
              <button
                type="button"
                onClick={() => setCapture(mediaType === 'image' ? 'photo' : 'video')}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-black/55 text-white border border-white/15"
              >
                Refaire
              </button>
            </div>
          )}

          {!capture && !mediaUrl && (
            <div className="relative z-10 flex flex-col items-center gap-3">
              <span className="text-[12px] text-white/45">Cadre et capture dans le composer</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCapture('photo')}
                  className="flex flex-col items-center gap-1 px-5 py-3 rounded-2xl bg-white/[0.06] border border-white/12 text-white/85 active:scale-95 transition"
                >
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-[12px]">Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCapture('video')}
                  className="flex flex-col items-center gap-1 px-5 py-3 rounded-2xl bg-white/[0.06] border border-white/12 text-white/85 active:scale-95 transition"
                >
                  <VideoIcon className="w-6 h-6" />
                  <span className="text-[12px]">Vidéo</span>
                </button>
              </div>
            </div>
          )}
        </div>

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
          disabled={publishing || !mediaUrl}
          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-red-700 text-white font-semibold disabled:opacity-40 active:scale-[0.98] transition"
        >
          {publishing ? 'Publication…' : 'Publier'}
        </button>
      </div>

      {/* Média = capture INLINE (cf zone média). L'éditeur d'effets complet
          (filtres avancés) = étape optionnelle à venir. */}
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
