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

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Video as VideoIcon, Image as ImageIcon, Disc3, ShoppingBag, Check, Upload } from '@/lib/icons';
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
  // Import d'une vidéo/photo EXISTANTE (galerie), en plus de la capture live. Pascal 2026-07-11.
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Talk2Me — boutique + catégorie pour ranger le produit
  const [boutiqueId, setBoutiqueId] = useState<string | null>(initialBoutiqueId ?? null);
  const [category, setCategory] = useState('');
  // Boutique ATTACHÉE EN SLIDE (≠ boutique_id qui ferait de la card un produit). Pascal 2026-07-11.
  const [attachedBoutiqueId, setAttachedBoutiqueId] = useState<string | null>(null);
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

  // Fetch MES boutiques au montage (pour pouvoir en attacher une = slide boutique dans la card).
  useEffect(() => {
    fetch('/api/boutiques', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.boutiques) setMyBoutiques(data.boutiques);
      })
      .catch(() => {});
  }, []);

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

  // Attacher une vidéo (ou photo) DÉJÀ EXISTANTE depuis la galerie/fichiers → upload → zone média.
  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind: 'image' | 'video' = f.type.startsWith('video') ? 'video' : 'image';
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const up = await res.json().catch(() => null);
      if (res.ok && up?.url) {
        setMediaUrl(up.url);
        setMediaType(kind);
      } else if (up?.error === 'file_too_large') {
        setError(`Fichier trop lourd (${Math.round((up.size || 0) / 1024 / 1024)} Mo). Max ${up.max_mb || 500} Mo.`);
      } else {
        setError("L'import a échoué. Réessaie, ou filme directement.");
      }
    } catch {
      setError("Connexion interrompue pendant l'import.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
            attached_boutique_id: attachedBoutiqueId,
            category: category.trim() || null,
          }
        : {
            type: 'texte' as const,
            text: buildCaption() || title.trim() || (son ? `🎵 ${son.title || 'Musique'}` : ''),
            bg_variant: 'neutral',
            attached_audio: son ?? null,
            attached_product: produit ?? null,
            boutique_id: boutiqueId,
            attached_boutique_id: attachedBoutiqueId,
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
      {/* pastille repérage (temporaire) — composer DORMANT GabaritEditor. Si tu vois ça, tu n'es PAS sur /creer/texte. */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[999] pointer-events-none text-white text-[20px] font-mono font-bold bg-red-700/90 px-4 py-2 rounded-xl border-2 border-white shadow-2xl tracking-widest">GAB-99</div>
      {/* Header */}
      {/* Barre du haut — design maquette composer.html de Gemini (Pascal 2026-07-02). */}
      <div className="flex items-center gap-3.5 px-4 pt-[calc(10px+env(safe-area-inset-top))] pb-2.5 shrink-0">
        <button type="button" onClick={closeWithAutosave} aria-label="Fermer" className="text-[24px] leading-none text-[var(--t2m-ink-2)] active:scale-90 transition">‹</button>
        <span className="text-[16px] font-semibold text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit', sans-serif" }}>Éditeur de card</span>
        {/* « Publier » du haut + flèches ↩↪ RETIRÉS (Pascal 2026-07-11) : un seul jeu d'actions
            en bas (Brouillon / Publier au feed) suffit. */}
      </div>

      {/* CANVAS = APERÇU FIDÈLE DU RENDU FEED (Pascal 2026-07-11 « fidèle c'est mieux ») :
          vidéo 16/9 EN HAUT sur fond noir, puis titre + texte + zones DESSOUS — exactement
          comme la card sortira au feed. Fini le plein écran avec texte superposé. */}
      <div className="flex-1 min-h-0 relative overflow-hidden" style={{ background: '#0d0b16' }}>
        {/* CAPTURE caméra INLINE — plein cadre pendant la prise */}
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

        {/* APERÇU (hors capture) — défile verticalement, comme le feed */}
        {!capture && (
          <div className="absolute inset-0 overflow-y-auto">
            {/* ── VIDÉO 16/9 EN HAUT, fond noir ── */}
            <div className="relative w-full bg-black" style={{ aspectRatio: '16 / 9' }}>
              {mediaUrl && mediaType === 'video' && (
                // Lecteur (controls) en haut, comme au feed — Pascal 2026-07-11 « ouvre la vidéo en haut en lecteur ».
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={mediaUrl} controls playsInline preload="metadata" className="w-full h-full object-contain bg-black" />
              )}
              {mediaUrl && mediaType === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="" className="w-full h-full object-contain bg-black" />
              )}
              {/* Pas de média perso mais un SON sélectionné → son CLIP YouTube joue EN LECTEUR EN HAUT,
                  exactement comme au feed (Pascal 2026-07-11). Le son = fond sonore + image ; contenu dessous. */}
              {!mediaUrl && sonVideoId && (
                <iframe
                  src={`https://www.youtube.com/embed/${sonVideoId}?modestbranding=1&rel=0&playsinline=1`}
                  title={son?.title || 'Clip'}
                  className="w-full h-full"
                  style={{ border: 'none' }}
                  allow="encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              )}
              {!mediaUrl && !sonVideoId && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-[12px] text-white/45">Filme, ou importe une vidéo/photo existante</span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setCapture('photo')} className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/12 text-white/85 active:scale-95 transition">
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-[12px]">Photo</span>
                    </button>
                    <button type="button" onClick={() => setCapture('video')} className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/12 text-white/85 active:scale-95 transition">
                      <VideoIcon className="w-6 h-6" />
                      <span className="text-[12px]">Vidéo</span>
                    </button>
                    {/* Importer une vidéo/photo DÉJÀ EXISTANTE (galerie/fichiers). Pascal 2026-07-11. */}
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/12 text-white/85 active:scale-95 transition disabled:opacity-50">
                      {uploading
                        ? <span className="w-6 h-6 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        : <Upload className="w-6 h-6" />}
                      <span className="text-[12px]">{uploading ? 'Import…' : 'Importer'}</span>
                    </button>
                  </div>
                </div>
              )}
              {mediaUrl && (
                <button type="button" onClick={() => setCapture(mediaType === 'image' ? 'photo' : 'video')} className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-full text-[12px] font-medium bg-black/55 text-white border border-white/15">
                  Refaire
                </button>
              )}
            </div>

            {/* ── TITRE + TEXTE + ZONES DESSOUS (comme le feed enrichi) ── */}
            <div className="px-4 py-3.5 space-y-3">
              {/* Titre — sous la vidéo, comme au feed */}
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                maxLength={80}
                rows={1}
                placeholder="Titre"
                className="w-full bg-transparent text-white text-[18px] font-extrabold placeholder:text-white/35 resize-none leading-tight focus:outline-none"
                style={{ fontFamily: "'Outfit',sans-serif" }}
              />

              {/* Description */}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                maxLength={200}
                rows={3}
                placeholder="Description…"
                className="w-full bg-transparent text-white/90 text-[14px] placeholder:text-white/30 resize-none focus:outline-none leading-relaxed"
              />

              {/* # hashtags */}
              <div className="flex items-center gap-2">
                <span className="text-red-300 text-[14px] font-semibold">#</span>
                <input
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value.slice(0, 120))}
                  placeholder="hashtags"
                  className="flex-1 bg-transparent text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none"
                />
              </div>

              {/* Changer/ajouter le son — LIEN TEXTE simple, PAS de vignette YouTube (ToS). Le clip
                  du son est déjà le lecteur officiel en haut. Pascal 2026-07-11 « enlève les pastilles ». */}
              <button
                type="button"
                onClick={() => setZone('son')}
                className="text-[12px] text-white/60 hover:text-white/90 transition flex items-center gap-1.5"
              >
                <Disc3 className="w-3.5 h-3.5" /> {son ? 'Changer le son (fond musical)' : 'Ajouter un son (fond musical)'}
              </button>

              {/* PRODUIT — SECONDAIRE : lien discret « + produit » qui déplie la vraie zone
                  (Pascal 2026-07-11 : depuis Music Card l'intention = musique+vidéo, pas vendre). */}
              {!produit && !boutiqueId ? (
                <button
                  type="button"
                  onClick={() => setZone('produit')}
                  className="text-[12px] text-white/45 hover:text-white/70 transition flex items-center gap-1.5"
                >
                  <ShoppingBag className="w-3.5 h-3.5" /> + Ajouter un produit (optionnel)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setZone('produit')}
                  className="w-full bg-white/[0.06] rounded-2xl border border-red-400/30 px-2 py-2 flex items-center gap-2.5 active:scale-[0.99] transition"
                >
                  <span className="relative w-[48px] aspect-[3/4] rounded-lg overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                    {produit?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={produit.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className="w-5 h-5 text-red-300" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="text-[11px] font-semibold text-red-100">Produit</div>
                    {produit && (
                      <>
                        <div className="text-[12px] text-white/90 line-clamp-2 mt-0.5">{produit.title}</div>
                        {produit.price_label && (
                          <div className="text-[11px] text-red-200/90 font-semibold mt-0.5">{produit.price_label}</div>
                        )}
                      </>
                    )}
                  </div>
                </button>
              )}

              {/* ATTACHER MA BOUTIQUE → ses items deviennent une SLIDE boutique dans la card, à
                  feuilleter sous la vidéo comme le texte (Pascal 2026-07-11). */}
              {myBoutiques.length > 0 && (
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-3.5 h-3.5 text-white/45 shrink-0" />
                  <select
                    value={attachedBoutiqueId ?? ''}
                    onChange={(e) => setAttachedBoutiqueId(e.target.value || null)}
                    className="flex-1 bg-transparent text-[12px] text-white/65 focus:outline-none"
                  >
                    <option value="" className="text-black">Attacher une de mes boutiques (slide)…</option>
                    {myBoutiques.map((bq) => (
                      <option key={bq.id} value={bq.id} className="text-black">🛍️ {bq.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Catégorie (rayon) — quand un produit externe est attaché */}
              {produit && (
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value.slice(0, 60))}
                  maxLength={60}
                  placeholder="Catégorie (rayon)"
                  className="w-full bg-white/[0.06] text-[12px] text-white/90 placeholder:text-white/40 border border-white/10 rounded-lg px-2.5 py-2 focus:outline-none focus:border-red-400/50"
                />
              )}

              {error && (
                <p className="text-[12px] text-red-300/90 text-center">{error}</p>
              )}
            </div>
          </div>
        )}

        {/* Input caché pour l'import galerie/fichiers (vidéo ou photo) — toujours monté. */}
        <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={onPickFile} />
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
