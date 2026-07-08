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
import { Video as VideoIcon, Image as ImageIcon, Disc3, ShoppingBag, Check } from '@/lib/icons';
import InlineCamera from '@/components/cards/editors/InlineCamera';
import SonPicker from '@/components/cards/editors/SonPicker';
import ProductPicker from '@/components/cards/editors/ProductPicker';
import { saveDraftNow, deleteDraftNow } from '@/lib/use-draft-autosave';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';

type Zone = 'video' | 'image' | 'son' | 'produit';

interface MeData {
  display_name?: string;
  username?: string;
  avatar_url?: string;
}

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
  initialHashtags?: string | null;
  initialTags?: string | null;
  initialSon?: UnifiedCard | null;
  initialBoutiqueId?: string | null;
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
  initialHashtags = null,
  initialTags = null,
  initialSon = null,
  initialBoutiqueId = null,
}: Props) {
  // Talk2Me #428 — média = photo OU vidéo (le composer ouvre le bon éditeur).
  const [mediaUrl, setMediaUrl] = useState<string | null>(initialMediaUrl ?? initialVideoUrl);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(
    initialMediaType ?? (initialVideoUrl ? 'video' : null)
  );
  // Talk2Me #428 — zone titre + description du composer (tout part de là).
  const [title, setTitle] = useState<string>(initialTitle ?? initialCaption ?? '');
  const [description, setDescription] = useState<string>(initialDescription ?? '');
  const [hashtags, setHashtags] = useState<string>(initialHashtags ?? '');
  const [tags, setTags] = useState<string>(initialTags ?? '');
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
  const [me, setMe] = useState<MeData | null>(null);

  // Talk2Me — boutique + catégorie pour ranger le produit
  const [boutiqueId, setBoutiqueId] = useState<string | null>(initialBoutiqueId ?? null);
  const [category, setCategory] = useState('');
  const [myBoutiques, setMyBoutiques] = useState<Array<{ id: string; name: string }>>([]);

  // Refs pour l'auto-save (évite les closures périmées dans les timers).
  const draftIdRef = useRef<string | null>(resumeDraftId);
  const publishedRef = useRef(false);

  const sonVideoId = (son?.meta as { youtube_video_id?: string } | undefined)?.youtube_video_id;
  const sonCover = son?.thumbnail_url || (sonVideoId ? `https://i.ytimg.com/vi/${sonVideoId}/hqdefault.jpg` : null);

  const hasContent = !!(
    mediaUrl || son || produit || title.trim() || description.trim() || hashtags.trim() || tags.trim()
  );

  const meLabel = me?.display_name || me?.username || 'Toi';
  const meInitial = meLabel.charAt(0).toUpperCase();

  // Fetch user info
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.display_name || d?.username) setMe(d);
      })
      .catch(() => {});
  }, []);

  // Fetch boutiques quand un produit est attaché ou qu'une boutique est déjà sélectionnée
  useEffect(() => {
    if (produit || boutiqueId) {
      fetch('/api/boutiques', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (data?.boutiques) setMyBoutiques(data.boutiques);
        })
        .catch(() => {});
    }
  }, [produit, boutiqueId]);

  // Caption finale = titre + description + #hashtags + @tags (formats imposés).
  const fmtTokens = (s: string, sym: '#' | '@') =>
    s
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((t) => sym + t.replace(/^[#@]+/, ''))
      .join(' ');
  const buildCaption = () =>
    [title.trim(), description.trim(), fmtTokens(hashtags, '#'), fmtTokens(tags, '@')]
      .filter(Boolean)
      .join('\n')
      .slice(0, 200) || null;

  // Sauvegarde / MAJ du brouillon 'gabarit' (reprend sur la page de compo).
  const saveDraftCore = async (): Promise<string | null> => {
    const id = await saveDraftNow({
      id: draftIdRef.current,
      type: 'gabarit',
      draftData: { mediaUrl, mediaType, title, description, hashtags, tags, son, produit, boutiqueId, category },
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
  }, [mediaUrl, mediaType, title, description, hashtags, tags, son, produit, boutiqueId, category]);

  const publish = async () => {
    const hasText = !!(title.trim() || description.trim());
    const hasMusic = !!son;
    if (!mediaUrl && !hasText && !hasMusic) {
      setError('Ajoute un média (photo/vidéo), une musique, ou au moins un texte.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      // Avec média → card image/vidéo. Sans média mais du texte/une musique → card texte
      // (la musique attachée s'affiche en lecteur, comme sur les cards image/vidéo).
      const body = mediaUrl
        ? {
            type: mediaType || 'video',
            media_url: mediaUrl,
            caption: buildCaption(),
            attached_audio: son ?? null,
            attached_product: produit ?? null,
            boutique_id: boutiqueId,
            category: category.trim() || null,
          }
        : {
            type: 'texte' as const,
            text: buildCaption() || title.trim() || (son ? `🎵 ${son.title || 'Musique'}` : ''),
            bg_variant: 'neutral',
            attached_audio: son ?? null,
            attached_product: produit ?? null,
            boutique_id: boutiqueId,
            category: category.trim() || null,
          };
      const res = await fetch('/api/cards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  // Guides pour la caméra inline (réplique visuelle non éditable)
  const cameraGuides = (
    <div className="absolute inset-0 pointer-events-none">
      {/* Overlay haut */}
      <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/70 to-transparent">
        {/* AUTEUR EN HAUT À GAUCHE */}
        <div className="absolute left-3 top-3 flex flex-col items-center">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-[14px] font-bold overflow-hidden">
            {me?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              meInitial
            )}
          </div>
          <span className="text-[12px] text-white/90 drop-shadow mt-1">{meLabel}</span>
        </div>
        {/* TITRE AU MILIEU */}
        <div className="text-center px-20 text-[20px] font-bold text-white/90 drop-shadow w-full leading-tight">
          {title || 'Titre'}
        </div>
      </div>
      {/* Overlay bas */}
      <div className="absolute bottom-0 inset-x-0 p-3 pb-3 space-y-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
        <div className="text-[13px] text-white/95 drop-shadow w-full">
          {description || 'Description…'}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-300 text-[14px] font-semibold drop-shadow">#</span>
          <span className="text-[13px] text-white/95 drop-shadow">{hashtags || 'hashtags'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sky-300 text-[14px] font-semibold drop-shadow">@</span>
          <span className="text-[13px] text-white/95 drop-shadow">{tags || 'tags'}</span>
        </div>
        <div className="flex gap-2.5">
          <div className="shrink-0 bg-black/45 backdrop-blur rounded-2xl border border-white/15 px-2.5 py-2 flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-black/40 border border-white/15 flex items-center justify-center overflow-hidden shrink-0">
              {son && sonCover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sonCover} alt="" className="w-full h-full object-cover" />
              ) : (
                <Disc3 className="w-5 h-5 text-white/75" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-white/85">Son</div>
              <div className="text-[10px] text-white/60 leading-tight line-clamp-1">
                {son ? son.title : 'fond musical'}
              </div>
            </div>
          </div>
          <div className="flex-1 bg-black/45 backdrop-blur rounded-2xl border border-red-400/30 px-2 py-2 flex items-center gap-2.5">
            <div className="w-[56px] aspect-[3/4] rounded-lg overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
              {produit?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={produit.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <ShoppingBag className="w-5 h-5 text-red-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-red-100">Produit</div>
              {produit ? (
                <>
                  <div className="text-[11px] text-white/90 line-clamp-2 mt-0.5">{produit.title}</div>
                  {produit.price_label && (
                    <div className="text-[11px] text-red-200/90 font-semibold mt-0.5">{produit.price_label}</div>
                  )}
                </>
              ) : (
                <div className="text-[11px] text-white/50 mt-0.5">+ Ajouter un produit</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--t2m-paper)] flex flex-col">
      {/* Header */}
      {/* Barre du haut — design maquette composer.html de Gemini (Pascal 2026-07-02). */}
      <div className="flex items-center gap-3.5 px-4 pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 shrink-0">
        <button type="button" onClick={closeWithAutosave} aria-label="Fermer" className="text-[24px] leading-none text-[var(--t2m-ink-2)] active:scale-90 transition">‹</button>
        <span className="text-[16px] font-semibold text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit', sans-serif" }}>Éditeur de card</span>
        <div className="ml-auto flex items-center gap-3.5 text-[18px] text-[var(--t2m-ink-3)]">
          <span aria-hidden>↩</span>
          <span aria-hidden>↪</span>
        </div>
        <button
          type="button"
          onClick={publish}
          disabled={publishing || (!mediaUrl && !title.trim() && !description.trim() && !son)}
          className="bg-[#FF7F11] text-white text-[13px] font-bold px-4 py-2 rounded-full shadow-[0_6px_16px_rgba(255,127,17,0.4)] active:scale-95 transition disabled:opacity-40"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          {publishing ? 'Publication…' : 'Publier'}
        </button>
      </div>

      {/* Canvas OVERLAY — empreinte exacte du post */}
      <div className="flex-1 min-h-0 relative bg-black overflow-hidden">
        {/* MÉDIA plein cadre */}
        {mediaUrl && mediaType === 'video' && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={mediaUrl} poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover bg-black" />
        )}
        {mediaUrl && mediaType === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Caméra INLINE */}
        {capture && (
          <div className="absolute inset-0 z-20">
            <InlineCamera
              initialMode={capture}
              onCapture={({ url, type }) => {
                setMediaUrl(url);
                setMediaType(type);
                setCapture(null);
              }}
              onCancel={() => setCapture(null)}
              guides={cameraGuides}
            />
          </div>
        )}

        {/* Pas de média et pas de capture : boutons Photo/Vidéo centrés */}
        {!capture && !mediaUrl && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
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

        {/* Bouton "Refaire" si média présent */}
        {mediaUrl && !capture && (
          <button
            type="button"
            onClick={() => setCapture(mediaType === 'image' ? 'photo' : 'video')}
            className="absolute top-3 right-3 z-20 px-3 py-1.5 rounded-full text-[12px] font-medium bg-black/55 text-white border border-white/15"
          >
            Refaire
          </button>
        )}

        {/* OVERLAY HAUT — quand PAS capture */}
        {!capture && (
          <div className="absolute top-0 inset-x-0 z-10 p-3 bg-gradient-to-b from-black/70 to-transparent">
            {/* AUTEUR EN HAUT À GAUCHE */}
            <div className="absolute left-3 top-3 flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-[14px] font-bold overflow-hidden">
                {me?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  meInitial
                )}
              </div>
              <span className="text-[12px] text-white/90 drop-shadow mt-1">{meLabel}</span>
            </div>
            {/* TITRE AU MILIEU */}
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              maxLength={80}
              rows={2}
              placeholder="Titre"
              className="text-center px-20 text-[20px] font-bold text-white bg-transparent placeholder:text-white/55 drop-shadow w-full resize-none leading-tight"
            />
          </div>
        )}

        {/* OVERLAY BAS — quand PAS capture */}
        {!capture && (
          <div className="absolute bottom-0 inset-x-0 z-10 p-3 pb-3 space-y-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
              maxLength={200}
              rows={2}
              placeholder="Description…"
              className="text-[13px] text-white/95 bg-transparent placeholder:text-white/55 drop-shadow w-full resize-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-red-300 text-[14px] font-semibold drop-shadow">#</span>
              <input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value.slice(0, 120))}
                placeholder="hashtags (mode voyage été…)"
                className="flex-1 bg-transparent text-[13px] text-white/95 placeholder:text-white/55 drop-shadow focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sky-300 text-[14px] font-semibold drop-shadow">@</span>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value.slice(0, 120))}
                placeholder="tags (@ami @marque…)"
                className="flex-1 bg-transparent text-[13px] text-white/95 placeholder:text-white/55 drop-shadow focus:outline-none"
              />
            </div>
            <div className="flex gap-2.5">
              {/* SON */}
              <button
                type="button"
                onClick={() => setZone('son')}
                className="shrink-0 bg-black/45 backdrop-blur rounded-2xl border border-white/15 px-2.5 py-2 flex items-center gap-2 active:scale-[0.98] transition"
              >
                <span className="relative w-10 h-10 rounded-full bg-black/40 border border-white/15 flex items-center justify-center overflow-hidden shrink-0">
                  {son && sonCover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sonCover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Disc3 className="w-5 h-5 text-white/75" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-white/85">Son</div>
                  <div className="text-[10px] text-white/60 leading-tight line-clamp-1">
                    {son ? son.title : 'fond musical'}
                  </div>
                </div>
              </button>

              {/* PRODUIT */}
              <button
                type="button"
                onClick={() => setZone('produit')}
                className="flex-1 bg-black/45 backdrop-blur rounded-2xl border border-red-400/30 px-2 py-2 flex items-center gap-2.5 active:scale-[0.98] transition"
              >
                <span className="relative w-[56px] aspect-[3/4] rounded-lg overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                  {produit?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={produit.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingBag className="w-5 h-5 text-red-300" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-red-100">Produit</div>
                  {produit ? (
                    <>
                      <div className="text-[11px] text-white/90 line-clamp-2 mt-0.5">{produit.title}</div>
                      {produit.price_label && (
                        <div className="text-[11px] text-red-200/90 font-semibold mt-0.5">{produit.price_label}</div>
                      )}
                    </>
                  ) : (
                    <div className="text-[11px] text-white/50 mt-0.5">+ Ajouter un produit</div>
                  )}
                </div>
              </button>
            </div>

            {/* Sélecteur boutique + catégorie — visible si produit attaché OU boutique déjà sélectionnée */}
            {(produit || boutiqueId) && (
              <div className="bg-black/45 backdrop-blur rounded-2xl border border-red-400/25 px-2.5 py-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-red-200/80 shrink-0">Ranger dans</label>
                  <select
                    value={boutiqueId ?? ''}
                    onChange={(e) => setBoutiqueId(e.target.value || null)}
                    className="flex-1 bg-black/40 text-[12px] text-white/90 border border-white/10 rounded-lg px-2 py-1 focus:outline-none focus:border-red-400/50"
                  >
                    <option value="">Aucune boutique</option>
                    {myBoutiques.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value.slice(0, 60))}
                  maxLength={60}
                  placeholder="Catégorie (rayon)"
                  className="w-full bg-black/40 text-[12px] text-white/90 placeholder:text-white/40 border border-white/10 rounded-lg px-2 py-1 focus:outline-none focus:border-red-400/50"
                />
              </div>
            )}

            {error && (
              <p className="text-[12px] text-red-300/90 text-center">{error}</p>
            )}
          </div>
        )}
      </div>

      {/* Barre du bas — design maquette composer.html (Publier au feed orange + 💾 brouillon). */}
      <div className="shrink-0 flex gap-2.5 px-4 pt-2.5 pb-[calc(14px+env(safe-area-inset-bottom))] max-w-md mx-auto w-full">
        <button
          type="button"
          onClick={publish}
          disabled={publishing || (!mediaUrl && !title.trim() && !description.trim() && !son)}
          className="flex-1 text-center font-semibold text-[14px] py-3.5 rounded-2xl bg-[#FF7F11] text-white shadow-[0_6px_16px_rgba(255,127,17,0.34)] active:scale-[0.98] transition disabled:opacity-40"
        >
          {publishing ? 'Publication…' : 'Publier au feed'}
        </button>
        <button
          type="button"
          onClick={saveDraft}
          disabled={savingDraft}
          aria-label="Enregistrer en brouillon"
          className="w-[54px] flex items-center justify-center text-[18px] py-3.5 rounded-2xl bg-[var(--t2m-wash)] border border-[var(--t2m-line)] text-[var(--t2m-ink-2)] active:scale-[0.98] transition disabled:opacity-50"
        >
          {savingDraft ? '…' : '💾'}
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
