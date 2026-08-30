'use client';

/**
 * Talk2Me — Composer WYSIWYG (Pascal 2026-06-09).
 * « Ce que je vois = ce que j'édite. » On part de ZÉRO : la card s'affiche en
 * plein écran et on écrit DIRECTEMENT dessus. On peut attacher photo / vidéo /
 * article (tout apparaît sur la card), + description + hashtags. Au publish, ce
 * qu'on voit est ce qui est enregistré.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { X, Check, Loader2, Film, Link2, Share2, FileText, Music, ShoppingBag, Shirt, ChevronUp, ChevronRight, Pencil } from '@/lib/icons';
import InlineCamera from '@/components/cards/editors/InlineCamera';
import MusicPickerSheet from '@/components/cards/MusicPickerSheet';
import SavedCardPicker from '@/components/cards/SavedCardPicker';
import ShopItemChip from '@/components/cards/ShopItemChip';
import FormatExportSheet from '@/components/composer/FormatExportSheet';
import VideoCardEditor from '@/components/cards/editors/VideoCardEditor';
import DescriptionSheet from '@/components/composer/DescriptionSheet';
import { reorderCaptionForReading } from '@/lib/search/metadata-map';
import { useCardDraftStore } from '@/lib/card-draft-store';
import { useCardCreationStore } from '@/lib/card-creation-store';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { ProductCardData } from '@/lib/chat-types';
// Recadrage PINCEMENT-ZOOM façon NATIF (remplace Filerobot, lourd/hors-charte). Pascal 2026-08-26.
import PinchCrop from '@/components/cards/editors/PinchCrop';

// IDENTIQUE à BG_VARIANTS de TexteCardDisplay.
const BG_VARIANTS: Record<string, string> = {
  neutral: 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)',
  purple: 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)',
  blue: 'linear-gradient(135deg, #18233a 0%, #213254 100%)',
  warm: 'linear-gradient(135deg, #2a1d20 0%, #3d2530 100%)',
};

export default function CreerPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [atags, setAtags] = useState(''); // @amis taggés (4e zone du module Description, natif _atags). Pascal 2026-08-16.
  const [descSheetOpen, setDescSheetOpen] = useState(false); // module Description (bottom-sheet) ouvert ?
  const [variant] = useState('neutral'); // fond des posts TEXTE (nuancier retiré → neutral par défaut)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | null>(null);
  const [articleUrl, setArticleUrl] = useState('');
  const [showArticle, setShowArticle] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [capture, setCapture] = useState<'photo' | 'video' | null>(null); // caméra inline ouverte ?
  // ANTI-FLASH (Pascal 2026-08-29) : quand on ouvre le composer sur un brouillon/une card à éditer ou
  // en mode caméra, le média arrive de façon ASYNCHRONE → sans ça, l'écran d'entrée VIDE s'affiche une
  // fraction de seconde avant l'image. Tant que ça « boot », on couvre par un écran de chargement noir.
  const [booting, setBooting] = useState(() => {
    if (typeof window === 'undefined') return false;
    const sp = new URLSearchParams(window.location.search);
    return sp.has('draft') || sp.has('card') || sp.get('start') === 'photo'; // overlay le temps que média/caméra s'ouvre
  });
  const [showExport, setShowExport] = useState(false); // feuille « Décliner pour… »
  const [editVideo, setEditVideo] = useState(false); // éditeur vidéo (trim/filtres/musique)
  const [editImage, setEditImage] = useState<string | null>(null); // photo en cours de recadrage (PinchCrop)
  // Id de la card en cours d'ÉDITION (reprise brouillon OU édition d'une card publiée). Publier/Brouillon
  // réutilisent CET id → même .card qui change d'état (brouillon↔feed), zéro doublon. Pascal 2026-08-26.
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [attachedSon, setAttachedSon] = useState<UnifiedCard | null>(null); // musique attachée (transfert de compétences depuis GabaritEditor). Pascal 2026-07-14.
  const [attachedProduct, setAttachedProduct] = useState<ProductCardData | null>(null); // produit attaché (transfert de compétences). Pascal 2026-07-14.
  const [musicPickerOpen, setMusicPickerOpen] = useState(false); // 2e façon d'ajouter un son : picker DANS le composer. Pascal 2026-07-14.
  const [pickerKind, setPickerKind] = useState<'article' | 'boutique' | null>(null); // sélecteur « Mes cards enregistrées ». Pascal 2026-07-14.
  const [attachedArticles, setAttachedArticles] = useState<{ id: string; title?: string; image_url?: string; price_label?: string }[]>([]); // articles (produits de TOUTES les boutiques) imbriqués → items .card. Pascal 2026-07-14.
  const [attachedBoutique, setAttachedBoutique] = useState<{ id: string; name?: string; coverUrl?: string } | null>(null); // MA boutique attachée → items .card via attached_boutique_id. Pascal 2026-07-14.
  const resetDraft = useCardDraftStore((s) => s.resetDraft);
  const initDraft = useCardDraftStore((s) => s.initDraft);
  const dSetHashtags = useCardDraftStore((s) => s.setHashtags);
  const dAddText = useCardDraftStore((s) => s.addText);
  const openVideoEditor = () => {
    if (!mediaUrl) return;
    resetDraft();
    initDraft('video', mediaUrl);
    // Reporter le TEXTE + HASHTAGS de la page 1 → piste TEXTE éditable (overlays),
    // à leur place (titre en haut, description+hashtags en bas). Les hashtags restent
    // AUSSI en métadonnée (recherche). PAS de setTitle/setDescription ici → sinon le
    // titre apparaîtrait EN DOUBLE (overlay gravé + caption). Pascal 2026-06-21.
    const t = title.trim(), d = description.trim();
    const tags = hashtags.trim().split(/\s+/).map((x) => x.replace(/^#/, '')).filter(Boolean);
    if (t) dAddText(t, 'top');
    const bottom = [d, tags.map((x) => '#' + x).join(' ')].filter(Boolean).join('\n');
    if (bottom) dAddText(bottom, 'bottom');
    if (tags.length) dSetHashtags(tags); // métadonnée seulement (pas de doublon visuel)
    setEditVideo(true);
  };
  const videoRef = useRef<HTMLInputElement>(null);

  // Préremplissage depuis un PARTAGE (Web Share Target → /share → composer).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const u = (q.get('url') || '').trim();
    const txt = (q.get('text') || '').trim();
    const ttl = (q.get('title') || '').trim();
    if (ttl) setTitle(ttl);
    if (txt) setDescription(txt);
    if (u) { setArticleUrl(u); setShowArticle(true); }
  }, []);

  // (Effet « retour du Composer Studio /composer » SUPPRIMÉ — ancien composer viré du code. Pascal 2026-07-12.)

  // REPRISE D'UN BROUILLON (Pascal 2026-08-26) : `?draft=<id>` → on charge le brouillon et on
  // pré-remplit CE composer (fini l'ancien /drafts/[id]/edit qui ouvrait les éditeurs cadavres).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const cardId = sp.get('card');
    if (cardId) {
      setEditingCardId(cardId);
      // Édition d'une card PUBLIÉE (long-press → Modifier) : on charge ses champs. Pascal 2026-08-26.
      fetch(`/api/cards/render-data?id=${encodeURIComponent(cardId)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((res) => {
          const c = res?.card;
          if (!c) return;
          const body = (typeof c.text === 'string' && c.text) ? c.text : (typeof c.caption === 'string' ? c.caption : '');
          if (body) setDescription(body);
          const media = (typeof c.media_url === 'string') ? c.media_url : '';
          // Photo → on REVIENT à l'étape crop (pincement-zoom), comme le natif. Vidéo → média direct. Pascal 2026-08-26.
          if (media) {
            if (c.type === 'video') { setMediaUrl(media); setMediaKind('video'); }
            else setEditImage(media);
          }
        })
        .catch(() => {})
        .finally(() => setBooting(false));
      return;
    }
    const id = sp.get('draft');
    if (!id) return;
    setEditingCardId(id); // le brouillon EST une card (state=draft) → même id à la publication
    let waitImg = false; // si le brouillon a une IMAGE : on garde le chargement jusqu'au onLoad de l'image (pas juste le fetch)
    fetch(`/api/drafts/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((res) => {
        const dd = res?.draft?.draft_data;
        if (!dd || typeof dd !== 'object') return;
        const g = (k: string) => (typeof dd[k] === 'string' ? dd[k] as string : '');
        if (g('title')) setTitle(g('title'));
        if (g('description')) setDescription(g('description'));
        if (g('hashtags')) setHashtags(g('hashtags'));
        const t = g('tags') || g('atags'); if (t) setAtags(t);
        // INSTANTANE COMPLET : on restaure toutes les pieces attachees (etat exact du composer). Pascal 2026-08-29.
        if (dd.attachedSon && typeof dd.attachedSon === 'object') setAttachedSon(dd.attachedSon as UnifiedCard);
        if (dd.attachedProduct && typeof dd.attachedProduct === 'object') setAttachedProduct(dd.attachedProduct as ProductCardData);
        if (dd.attachedBoutique && typeof dd.attachedBoutique === 'object') setAttachedBoutique(dd.attachedBoutique as { id: string; name?: string; coverUrl?: string });
        if (Array.isArray(dd.attachedArticles) && dd.attachedArticles.length) setAttachedArticles(dd.attachedArticles as { id: string; title?: string; image_url?: string; price_label?: string }[]);
        const media = g('mediaUrl') || g('source_url') || g('media_url') || g('url');
        if (media) {
          const isVid = g('mediaKind') === 'video' || g('mediaType') === 'video' || g('media_type') === 'video' || res?.draft?.type === 'video';
          // REPRISE OU ON S'EST ARRETE (Pascal 2026-08-29) : ecran de compo avec le media DEJA pret
          // (photo deja recadree). Pas de re-crop force.
          setMediaUrl(media); setMediaKind(isVid ? 'video' : 'image');
          if (!isVid) waitImg = true; // image → le onLoad de l'<img> coupera le chargement
        }
        const art = g('articleUrl'); if (art) { setArticleUrl(art); setShowArticle(true); }
        else if (dd.showArticle === true) setShowArticle(true);
      })
      .catch(() => {})
      .finally(() => { if (!waitImg) setBooting(false); });
  }, []);

  // ?start=photo (tuile Photo / « Créer un post ») : on ouvre la caméra APRÈS le montage (useEffect =
  // fiable côté client, contrairement à un init useState qui casse le SSR et laisse l'écran vide). Le
  // temps d'une frame, l'overlay « Chargement… » (booting) couvre → on ne voit jamais l'écran d'entrée.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('start') === 'photo') { setCapture('photo'); setBooting(false); }
  }, []);

  // GARDE-FOU anti-blocage : si le chargement (image cassée, réseau mort) ne se coupe jamais,
  // on le lève au bout de 5 s → jamais d'écran de chargement figé. Pascal 2026-08-29.
  useEffect(() => {
    if (!booting) return;
    const t = window.setTimeout(() => setBooting(false), 5000);
    return () => window.clearTimeout(t);
  }, [booting]);

  // TRANSFERT DE COMPÉTENCES (Pascal 2026-07-14) — une entrée (ex: Music-Hub) a préparé une musique
  // dans le store (stageMusic) puis navigué ici : on la consomme et on l'attache. Lecture non-réactive
  // (getState) pour éviter toute boucle de rendu.
  useEffect(() => {
    const s = useCardCreationStore.getState();
    if (s.presetMusic) {
      setAttachedSon(s.presetMusic);
      s.stageMusic(null);
      // « Créer une card avec ce son » = on veut une VIDÉO avec cette musique → on ouvre direct
      // la caméra en mode vidéo (comme TikTok), musique déjà attachée. Pascal 2026-07-14.
      setCapture('video');
    } else if (s.presetProduct) {
      // « Créer ma card » depuis un produit → on montre le produit (photo), produit déjà attaché.
      setAttachedProduct(s.presetProduct);
      s.stageProduct(null);
      setCapture('photo');
    }
  }, []);

  // Upload d'une image recadrée (sortie PinchCrop) → devient le média de la card.
  const uploadEdited = async (dataUrl: string) => {
    setEditImage(null);
    setUploading(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const fd = new FormData(); fd.append('file', new File([blob], 'photo.png', { type: blob.type || 'image/png' }));
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const up = await res.json().catch(() => ({}));
      if (res.ok && up?.url) { setMediaUrl(up.url); setMediaKind('image'); }
      else alert("L'envoi de la photo a échoué. Réessaie.");
    } catch { alert("Connexion interrompue pendant l'envoi de la photo."); }
    finally { setUploading(false); }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'video') => {
    const f = e.target.files?.[0];
    if (!f) return;
    // PHOTO → on ouvre l'éditeur (crop/filtres/ajuste) AVANT publication.
    if (kind === 'image') {
      const reader = new FileReader();
      reader.onload = () => setEditImage(String(reader.result));
      reader.readAsDataURL(f);
      if (e.target) e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const up = await res.json().catch(() => ({}));
      if (res.ok && up?.url) { setMediaUrl(up.url); setMediaKind(kind); }
      else if (up?.error === 'file_too_large') alert(`Vidéo trop lourde (${Math.round((up.size || 0) / 1024 / 1024)} Mo). Max ${up.max_mb || 500} Mo.\nPour un film entier, colle plutôt un lien (YouTube/Vimeo) via « Article ».`);
      else if (up?.error === 'unsupported_mime') alert('Format non reconnu. Essaie un MP4, ou colle un lien vidéo via « Article ».');
      else alert("L'envoi de la vidéo a échoué. Réessaie ou colle un lien via « Article ».");
    } catch { alert("Connexion interrompue pendant l'envoi de la vidéo."); }
    finally { setUploading(false); if (videoRef.current) videoRef.current.value = ''; }
  };

  // Assemblage légende = module Description natif (_buildCaption) : Titre + Description + #hashtags + @amis,
  // chaque partie trim, on jette les vides, join avec '\n'. Les tokens #/@ sont normalisés (préfixe unique)
  // comme _fmtTokens du natif. Pascal 2026-08-16.
  const fmtTokens = (s: string, sym: '#' | '@') => s
    .split(/[\s,]+/)
    .filter((t) => t.trim())
    .map((t) => sym + t.replace(/^[#@]+/, ''))
    .join(' ');
  const assembled = [title.trim(), description.trim(), fmtTokens(hashtags, '#'), fmtTokens(atags, '@')].filter(Boolean).join('\n');
  // VIDÉO : le composer EST l'aperçu — il s'affiche au format feed (vidéo 16/9 en haut fond noir,
  // texte dessous), pas en plein écran superposé. Pascal 2026-07-11 : « l'aperçu doit être le composer ».
  const isVideo = !!mediaUrl && mediaKind === 'video';
  // ID vidéo YouTube de la musique attachée → lecteur en aperçu (haut) sur la music card. Pascal 2026-07-14.
  const sonVideoId = (attachedSon?.meta as { youtube_video_id?: string } | undefined)?.youtube_video_id;

  // Corps .card partagé par Publier ET Brouillon (le brouillon = même card, state='draft').
  const buildCardBody = () => {
    const attached_product = attachedProduct ?? (articleUrl.trim() ? { url: articleUrl.trim(), title: 'Article' } : undefined);
    const cap = reorderCaptionForReading(assembled);
    const clipVideos = mediaKind === 'video'
      ? [...new Set((useCardDraftStore.getState().draft?.clips || []).map((c) => c.source_url).filter((u): u is string => !!u))]
      : [];
    const attached_audio = attachedSon ?? undefined;
    const attached_boutique_id = attachedBoutique?.id ?? undefined;
    const attached_product_ids = attachedArticles.length ? attachedArticles.map((a) => a.id) : undefined;
    return mediaUrl
      ? { type: mediaKind, media_url: mediaUrl, caption: cap.slice(0, 200), attached_product, attached_audio, attached_boutique_id, attached_product_ids, ...(clipVideos.length > 1 ? { videos: clipVideos } : {}) }
      : { type: 'texte', text: (cap + (articleUrl.trim() ? '\n' + articleUrl.trim() : '')).slice(0, 200), bg_variant: variant, attached_product, attached_audio, attached_boutique_id, attached_product_ids };
  };

  const publish = async () => {
    if (publishing) return;
    if (!assembled && !mediaUrl && !attachedSon) return; // au moins du texte, un média ou une musique
    setPublishing(true);
    try {
      // Publier = flip du MÊME .card vers 'published' si on éditait (brouillon ou card publiée) ; sinon création.
      const body = { ...buildCardBody(), state: 'published', ...(editingCardId ? { id: editingCardId } : {}) };
      const r = await fetch('/api/cards/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        const cardId = d?.card?.id;
        if (attachedSon) {
          fetch('/api/cards/save', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_kind: 'youtube', card_data: attachedSon, title: attachedSon.title || null }),
          }).catch(() => {});
        }
        router.push(cardId ? `/home#card-${cardId}` : '/home');
      } else setPublishing(false);
    } catch { setPublishing(false); }
  };

  // Bouton Brouillon — enregistre la compo comme un .card `state='draft'` (MÊME card qu'à la publication).
  const saveDraft = async () => {
    if (savingDraft) return;
    if (!assembled && !mediaUrl) return;
    setSavingDraft(true);
    try {
      const body = { ...buildCardBody(), state: 'draft', ...(editingCardId ? { id: editingCardId } : {}),
        // INSTANTANE COMPLET du composer -> reprise exactement la ou on s'est arrete. Pascal 2026-08-29.
        draft_composer: { title, description, hashtags, atags, mediaUrl, mediaKind, articleUrl, showArticle, attachedSon, attachedProduct, attachedBoutique, attachedArticles } };
      const r = await fetch('/api/cards/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        const newId = d?.card?.id;
        if (newId) setEditingCardId(newId); // re-sauver met à jour LE MÊME brouillon
      }
      router.push('/home');
    } finally { setSavingDraft(false); }
  };

  // APERÇU des éléments attachés (article/boutique) = LA MÊME vignette que le feed (ShopItemChip),
  // posée sur la caméra (CAM-30) ET sur la photo (PH-10). Pascal 2026-07-14.
  const attachedOverlay = (attachedArticles.length > 0 || attachedBoutique) ? (
    <div className="absolute left-3 right-16 bottom-44 z-[46] flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {attachedBoutique && (
        <ShopItemChip image={attachedBoutique.coverUrl} title={attachedBoutique.name || 'Ma boutique'} showBuy={false} style={{ flex: '0 0 auto', maxWidth: '78%' }} />
      )}
      {attachedArticles.map((art) => (
        <ShopItemChip key={art.id} image={art.image_url} title={art.title || 'Article'} priceLabel={art.price_label} style={{ flex: '0 0 78%' }} />
      ))}
    </div>
  ) : null;

  return (
    <div
      className="relative w-full h-[100svh] max-w-md mx-auto overflow-hidden select-none bg-black"
      style={mediaUrl ? (isVideo ? { background: '#0d0b16' } : undefined) : { background: BG_VARIANTS[variant] }}
    >
      {/* ANTI-FLASH : écran de chargement tant que le brouillon/la card charge (média asynchrone) →
          on ne montre JAMAIS l'écran d'entrée vide avant l'image. Pascal 2026-08-29. */}
      {booting && (
        <div className="absolute inset-0 z-[200] grid place-items-center" style={{ background: BG_VARIANTS.neutral }}>
          <div className="flex flex-col items-center gap-3 text-white/70">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-[13px] font-medium">Chargement…</span>
          </div>
        </div>
      )}
      {/* Média de fond (si photo attachée) : affichée plein cadre. L'édition photo (crop/filtres)
          se fait dans PinchCrop (pincement-zoom) AVANT d'arriver ici — plus de décorateur superposé. */}
      {mediaUrl && mediaKind === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl} alt="" onLoad={() => setBooting(false)} onError={() => setBooting(false)} className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 12 }} />
      )}
      {isVideo && (
        // Aperçu vidéo EN HAUT dans un LECTEUR (Pascal 2026-07-14, flow « card avec ce son ») :
        // vidéo cadrée en haut avec contrôles, musique juste dessous, légende/boutons en bas.
        <div className="absolute inset-x-0 top-0 z-[8] flex flex-col items-stretch gap-2 px-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3.25rem)' }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={mediaUrl!} className="w-full max-h-[58vh] rounded-xl object-contain bg-black" controls autoPlay loop muted playsInline preload="metadata" />
          {attachedSon && (
            <div className="mx-auto flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-1.5 pr-3 py-1.5 max-w-full">
              {attachedSon.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachedSon.thumbnail_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[12px] shrink-0">🎵</span>
              )}
              <span className="text-[12.5px] text-white/90 truncate">{attachedSon.title || 'Musique'}</span>
              <button type="button" onClick={() => setAttachedSon(null)} aria-label="Retirer la musique" className="text-white/50 shrink-0"><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}
      {/* APERÇU des éléments attachés SUR LA PHOTO (PH-10) — même vignette que le feed. Pascal 2026-07-14. */}
      {mediaUrl && mediaKind === 'image' && !editImage && !capture && attachedOverlay}
      {/* Sans photo (fond couleur) : la vignette article s'affiche AUSSI sur l'écran de compo. Pascal 2026-08-26. */}
      {!mediaUrl && !isVideo && !editImage && !capture && attachedOverlay}
      {/* PASTILLES DE REPÉRAGE (temporaires) — une par ÉTAT de cet écran, code différent. Pascal 2026-07-14. */}
      {mediaUrl && mediaKind === 'image' && !editImage && !capture && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[999] pointer-events-none text-white text-[20px] font-mono font-bold bg-orange-600/90 px-4 py-2 rounded-xl border-2 border-white shadow-2xl tracking-widest">PH-10</div>
      )}
      {isVideo && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[999] pointer-events-none text-white text-[20px] font-mono font-bold bg-emerald-600/90 px-4 py-2 rounded-xl border-2 border-white shadow-2xl tracking-widest">VD-20</div>
      )}

      {/* Dégradé HAUT — valeurs EXACTES Home (header h-14=56px + safe-area). */}
      <div className="absolute top-0 inset-x-0 z-[5] pointer-events-none bg-gradient-to-b from-black/65 via-black/35 to-transparent" style={{ height: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }} />


      {/* Barre haute : fermer + nuancier (si pas de média) */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button onClick={() => router.push('/home')} aria-label="Annuler" className="w-9 h-9 rounded-full bg-black/40 grid place-items-center text-white/90">
          <X className="w-5 h-5" />
        </button>
        {/* (Écran d'entrée « fantôme » = VIDE. L'attache lien/article est sur la CAMÉRA, pas ici.
            Pascal 2026-07-14 : « RX-42 on y met rien, tout se passe sur CAM-30 ».) */}
      </div>

      {/* TITRE DÉPLACÉ EN BAS (Pascal 2026-07-12) : le titre se rend en BAS au feed (avec la
          légende), donc le champ est au BAS du composer = WYSIWYG. Ici en haut : juste la puce article.
          Masqué pour la vidéo (le composer devient le format feed : texte SOUS la vidéo). */}
      {!isVideo && (showArticle || articleUrl) && (
      <div className="absolute inset-x-0 top-0 z-10 px-6 pt-[calc(env(safe-area-inset-top)+6rem)] flex flex-col items-center text-center">
        {/* Chip article attaché */}
        {(showArticle || articleUrl) && (
          <div className="w-full mt-4 flex items-center gap-2 bg-white/[0.08] border border-white/15 rounded-xl px-3 py-2">
            <Link2 className="w-4 h-4 text-white/70 shrink-0" />
            <input
              value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} placeholder="Colle le lien de l'article…"
              className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
            />
            {articleUrl && <button onClick={() => { setArticleUrl(''); setShowArticle(false); }} className="text-white/50"><X className="w-4 h-4" /></button>}
          </div>
        )}
      </div>
      )}

      {/* Chip MUSIQUE attachée (transfert de compétences GabaritEditor → /creer/texte). Pascal 2026-07-14.
          Pour la VIDÉO, le chip est rendu SOUS le lecteur (bloc isVideo) → ici seulement hors-vidéo. */}
      {!isVideo && attachedSon && (
        <div className="absolute inset-x-0 top-0 z-10 px-6 pt-[calc(env(safe-area-inset-top)+9rem)] flex justify-center">
          <div className="flex items-center gap-2 bg-white/[0.10] border border-white/15 rounded-full pl-1.5 pr-3 py-1.5 max-w-full">
            {attachedSon.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachedSon.thumbnail_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-white/10 grid place-items-center text-[13px] shrink-0">🎵</span>
            )}
            <span className="text-[13px] text-white/90 truncate">{attachedSon.title || 'Musique'}</span>
            <button type="button" onClick={() => setAttachedSon(null)} aria-label="Retirer la musique" className="text-white/50 shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Chip PRODUIT attaché (transfert de compétences GabaritEditor → /creer/texte). Pascal 2026-07-14. */}
      {attachedProduct && (
        <div className="absolute inset-x-0 top-0 z-10 px-6 pt-[calc(env(safe-area-inset-top)+12rem)] flex justify-center">
          <div className="flex items-center gap-2 bg-white/[0.10] border border-red-400/30 rounded-full pl-1.5 pr-3 py-1.5 max-w-full">
            {attachedProduct.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachedProduct.image_url} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="w-7 h-7 rounded-lg bg-white/10 grid place-items-center text-[13px] shrink-0">🛍️</span>
            )}
            <span className="text-[13px] text-white/90 truncate">{attachedProduct.title || 'Produit'}</span>
            {attachedProduct.price_label && <span className="text-[12px] text-red-200 font-semibold shrink-0">{attachedProduct.price_label}</span>}
            <button type="button" onClick={() => setAttachedProduct(null)} aria-label="Retirer le produit" className="text-white/50 shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Chip BOUTIQUE attachée → items .card (attached_boutique_id). Pascal 2026-07-14. */}
      {attachedBoutique && (
        <div className="absolute inset-x-0 top-0 z-10 px-6 pt-[calc(env(safe-area-inset-top)+15rem)] flex justify-center">
          <div className="flex items-center gap-2 bg-white/[0.10] border border-red-400/30 rounded-full pl-1.5 pr-3 py-1.5 max-w-full">
            {attachedBoutique.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachedBoutique.coverUrl} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="w-7 h-7 rounded-lg bg-white/10 grid place-items-center text-[13px] shrink-0">🏪</span>
            )}
            <span className="text-[13px] text-white/90 truncate">{attachedBoutique.name || 'Ma boutique'}</span>
            <button type="button" onClick={() => setAttachedBoutique(null)} aria-label="Retirer la boutique" className="text-white/50 shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Bloc texte vidéo « sous le 16/9 » SUPPRIMÉ : la vidéo est plein écran + même champ légende
          que la photo (en bas), module texte #/@. Pascal 2026-07-12. */}

      {/* CHOIX Photo/Vidéo/Article RETIRÉS du centre (Pascal 2026-07-14) : on neutralise l'écran
          d'entrée (« page fantôme ») pour ne pas risquer un rejet store. Le vrai choix se fait dans
          la feuille « + » ; ici on n'arrive qu'avec un média (caméra via ?start=photo) ou un partage.
          Le bloc conditionnel est vidé, PAS supprimé — la plomberie du pipeline reste intacte. */}

      {/* Bouton « Studio » (IA vidéo) RETIRÉ de l'aperçu — Studio est en LABO, pas prêt (Pascal 2026-07-12). */}

      {/* Vidéo attachée → éditeur vidéo (trim / filtres / musique) */}
      {mediaUrl && mediaKind === 'video' && (
        <button
          type="button"
          onClick={openVideoEditor}
          className="absolute top-[calc(env(safe-area-inset-top)+3.5rem)] right-3 z-20 px-3 h-9 rounded-full bg-white text-black text-[12px] font-semibold inline-flex items-center gap-1.5 active:scale-95"
        >
          <Film className="w-4 h-4" /> Éditer
        </button>
      )}


      {/* Lien « Modifier les images » vers l'ancien Studio /composer RETIRÉ du composer/de la croix
          (Pascal 2026-07-12). /composer reste UNIQUEMENT accessible depuis le LABO, jamais depuis ici. */}

      {/* FOOTER façon vrai post (Pascal) : bulle auteur + icônes sociales, mais
          ICI DÉCORATIVES (aperçu, non cliquables) → placées exactement où elles
          seront sur le post. Publier reste à droite, à sa place. */}
      {/* Dégradé BAS — valeurs EXACTES Home (from-black/85 via-black/45), hauteur courte. */}
      <div className="absolute bottom-0 inset-x-0 h-40 z-10 pointer-events-none bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      {/* BARRE NOIRE = symbolise le menu de la Home (BottomNav h-16=64px). Repère
          visuel, derrière Publier. Même hauteur (safe-area incluse). (Pascal)
          Masquée sur l'écran d'entrée à vide (« fantôme ») — n'apparaît que quand on compose. */}
      {(mediaUrl || showArticle || articleUrl || attachedSon || attachedProduct || attachedBoutique || attachedArticles.length > 0 || !!assembled) && (
        <div className="absolute bottom-0 inset-x-0 z-[15] pointer-events-none bg-black border-t border-white/10" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }} />
      )}

      {/* BLOC BAS : description (gauche, 3 lignes) + hashtags (gauche, 1 ligne) +
          icônes sociales. Ancré en bas ; les icônes (dernier enfant) restent à
          un offset FIXE → pile poil identique en mode caméra.
          Masqué pour la vidéo (texte déplacé SOUS la vidéo = format feed). */}
      {/* UN SEUL CHAMP LÉGENDE — MÊME pour PHOTO et VIDÉO (plein écran) : titre+texte+hashtags dans
          le MÊME flux (logique « une ligne »), module #/@. Le publish envoie `assembled`. Pascal 2026-07-12.
          Masqué sur l'écran d'entrée à vide (« fantôme ») — n'apparaît que quand on compose. */}
      {(mediaUrl || showArticle || articleUrl || attachedSon || attachedProduct || attachedBoutique || attachedArticles.length > 0 || !!assembled) && (
      <div className="absolute inset-x-0 z-20 px-3" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}>
        {/* BARRE REPLIABLE D'APERÇU (natif _descPreview) : vide → notes + « Titre, description, #tags, @amis… » + chevron ;
            remplie → aperçu de la légende + crayon. Tap → ouvre le module Description (bottom-sheet). Pascal 2026-08-16. */}
        <button
          type="button"
          onClick={() => setDescSheetOpen(true)}
          className="w-full flex items-start gap-2 text-left bg-white/[0.06] border border-white/12 rounded-xl px-3 py-2.5 active:scale-[0.99]"
        >
          {(() => {
            const empty = !title.trim() && !description.trim() && !hashtags.trim() && !atags.trim();
            if (empty) {
              return (
                <>
                  <FileText className="w-[18px] h-[18px] text-white/70 shrink-0 mt-px" />
                  <span className="flex-1 text-white/70 text-[14px]">Titre, description, #tags, @amis…</span>
                  <ChevronUp className="w-5 h-5 text-white/70 shrink-0" />
                </>
              );
            }
            return (
              <>
                <span className="flex-1 min-w-0 text-white text-[14px] leading-snug whitespace-pre-wrap line-clamp-4 drop-shadow">{assembled}</span>
                <Pencil className="w-[15px] h-[15px] text-white/60 shrink-0 mt-px" />
              </>
            );
          })()}
        </button>
      </div>
      )}

      {/* Brouillon + Décliner + Publier — EN BAS (Pascal 2026-07-14) : le décorateur du bas a été
          retiré, le bas est de nouveau libre → boutons posés sur la barre noire (repère menu Home).
          Masqués sur l'écran d'entrée à vide (« fantôme ») — n'apparaissent que quand on compose. */}
      {(mediaUrl || showArticle || articleUrl || attachedSon || attachedProduct || attachedBoutique || attachedArticles.length > 0 || !!assembled) && (
      <div className="absolute inset-x-0 z-20 px-3 flex items-center gap-2 overflow-hidden" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
        <button
          onClick={saveDraft}
          disabled={(!assembled && !mediaUrl) || savingDraft || publishing}
          className="inline-flex flex-col items-center justify-center gap-0.5 w-16 h-[52px] rounded-2xl bg-white/[0.18] text-white text-[10px] font-medium disabled:opacity-40 active:scale-[0.98]"
        >
          {savingDraft ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
          {savingDraft ? '…' : 'Brouillon'}
        </button>
        <button
          onClick={publish}
          disabled={(!assembled && !mediaUrl) || publishing || uploading}
          className="flex-1 inline-flex items-center justify-center gap-2 h-[52px] rounded-2xl text-white text-[15px] font-extrabold disabled:opacity-40 active:scale-[0.98]"
          style={{ backgroundColor: '#FF7F11' }}
        >
          {publishing ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {publishing ? 'Publication…' : 'Publier au feed'}
        </button>
        <button
          onClick={() => setShowExport(true)}
          disabled={!assembled && !mediaUrl}
          aria-label="Exporter"
          className="inline-flex flex-col items-center justify-center gap-0.5 w-16 h-[52px] rounded-2xl bg-white/[0.18] text-white text-[10px] font-medium disabled:opacity-40 active:scale-[0.98]"
        >
          <Share2 className="w-5 h-5" /> Exporter
        </button>
      </div>
      )}

      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => onPick(e, 'video')} />

      {/* MODULE DESCRIPTION (bottom-sheet natif) — 4 zones (titre/description/#tags/@amis) + phrases
          contextuelles + toggle Emoji. La légende publiée est assemblée via `assembled` (_buildCaption). Pascal 2026-08-16. */}
      <DescriptionSheet
        open={descSheetOpen}
        onClose={() => setDescSheetOpen(false)}
        title={title} setTitle={setTitle}
        description={description} setDescription={setDescription}
        hashtags={hashtags} setHashtags={setHashtags}
        atags={atags} setAtags={setAtags}
        hasBoutique={!!attachedBoutique}
        hasArticle={attachedArticles.length > 0 || !!attachedProduct || !!articleUrl.trim()}
        isVideo={isVideo}
        hasAudio={!!attachedSon}
      />

      {/* PICKER MUSIQUE (2e façon d'ajouter un son : directement dans le composer). Pascal 2026-07-14.
          Sur sélection → le son s'attache (attachedSon) → lecteur en haut + attached_audio à la publication. */}
      <MusicPickerSheet
        open={musicPickerOpen}
        onClose={() => setMusicPickerOpen(false)}
        onSelect={(card) => { setAttachedSon(card); setMusicPickerOpen(false); }}
      />

      {/* SÉLECTEUR « Mes cards enregistrées » (Article multi / Boutique). Pascal 2026-07-14.
          Article = multi-sélection ; Boutique = 1 produit (réutilise attached_product). */}
      <SavedCardPicker
        open={pickerKind !== null}
        kind={pickerKind ?? 'article'}
        multi={pickerKind === 'article'}
        onClose={() => setPickerKind(null)}
        onSelect={(raws) => {
          if (pickerKind === 'article') setAttachedArticles((prev) => {
            // ACCUMULE + dédup (Pascal 2026-07-14) : rouvrir le sélecteur AJOUTE des articles, ne remplace pas.
            const map = new Map(prev.map((a) => [a.id, a]));
            (raws as { id: string; title?: string; image_url?: string; price_label?: string }[]).forEach((a) => map.set(a.id, a));
            return Array.from(map.values());
          });
          else if (pickerKind === 'boutique' && raws[0]) setAttachedBoutique(raws[0] as { id: string; name?: string; coverUrl?: string });
          setPickerKind(null);
        }}
      />


      {/* ÉDITEUR VIDÉO (trim / filtres / musique) — mode RETOUR : il renvoie la vidéo
          montée DANS le post (pas de publication ici). Pascal 2026-06-21. */}
      {editVideo && (
        <div className="fixed inset-0 z-[130] bg-black">
          <VideoCardEditor
            returnMode
            demoPreviewUrl={mediaUrl}
            demoFileName="video.mp4"
            onClose={() => setEditVideo(false)}
            onPublished={() => setEditVideo(false)}
            onResult={({ videoUrl, caption }) => {
              if (videoUrl) { setMediaUrl(videoUrl); setMediaKind('video'); }
              // Le texte vient UNIQUEMENT du module Description du composer (fini le doublon avec
              // les champs de VideoCardEditor, masqués en returnMode). On n'écrase plus. Pascal 2026-08-27.
              void caption;
              setEditVideo(false);
            }}
          />
        </div>
      )}

      {/* DÉCLINER POUR… — reformate aux ratios réseaux + partage natif / téléchargement */}
      {showExport && (
        <FormatExportSheet
          title={title} description={description} hashtags={hashtags}
          mediaUrl={mediaUrl} mediaKind={mediaKind} variant={variant}
          onClose={() => setShowExport(false)}
        />
      )}


      {/* RECADRAGE PINCEMENT-ZOOM (natif) — remplace Filerobot. Cuit l'image → uploadEdited. Pascal 2026-08-26. */}
      {editImage && (
        <PinchCrop
          src={editImage}
          onCancel={() => setEditImage(null)}
          onDone={(dataUrl) => uploadEdited(dataUrl)}
        />
      )}

      {/* CAMÉRA INLINE (Pascal) — le bouton Photo ouvre la caméra DANS le composer.
          On capture → la photo devient le fond de la card, on reste sur le WYSIWYG. */}
      {capture && (
        // Flow MUSIC CARD (musique attachée) : caméra CADRÉE EN HAUT (la vidéo se place en haut),
        // pas plein écran → Pascal 2026-07-14. Caméra normale (sans musique) = plein écran, inchangée.
        <div className="absolute inset-0 z-40 bg-black flex flex-col">
          {/* pastille repérage (temporaire) — écran CAMÉRA (photo/vidéo) */}
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[999] pointer-events-none text-white text-[18px] font-mono font-bold bg-pink-600/90 px-3 py-1.5 rounded-xl border-2 border-white shadow-2xl tracking-widest">CAM-30</div>

          {/* SUIVANT (Pascal 2026-08-26) — quitter la caméra SANS photo dès qu'un élément est attaché
              (article/son/boutique/lien). Corrige le blocage « obligé de prendre une photo pour avoir
              les boutons » : on ferme la caméra → l'écran de compo (Publier/Brouillon/Description) s'affiche. */}
          {(attachedArticles.length > 0 || !!attachedSon || !!attachedProduct || !!attachedBoutique || !!articleUrl.trim()) && (
            <button
              type="button"
              onClick={() => setCapture(null)}
              className="absolute z-[47] right-3 flex items-center gap-1.5 px-4 h-10 rounded-full text-white text-[14px] font-extrabold active:scale-95 shadow-lg"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)', backgroundColor: '#FF7F11' }}
            >
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* ATTACHER UN LIEN / ARTICLE — SUR LA CAMÉRA (Pascal 2026-07-14 : « tout se passe sur CAM-30,
              l'écran d'entrée reste vide »). Bouton 🔗 à gauche → champ lien en haut. Le lien s'imbrique
              dans la .card (attached_product url), rendu par le lecteur unique. */}
          {/* RAIL D'ACTIONS À DROITE (façon TikTok) — Pascal 2026-07-14. Son (picker) + Article + Boutique
              (sélecteur « Mes cards enregistrées », multi-sélection — à venir). Le lien-à-coller = labo. */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-[45] flex flex-col items-center gap-6">
            {/* 🎵 Son — icône BLANCHE nette, SANS bulle (Pascal 2026-07-14), toujours visible.
                Attaché → icône rouge + × pour retirer ; tap → changer. */}
            <div className="relative flex flex-col items-center">
              <button type="button" onClick={() => setMusicPickerOpen(true)} aria-label={attachedSon ? 'Changer la musique' : 'Ajouter une musique'} className="flex flex-col items-center gap-1 active:scale-90 transition">
                <Music className={'w-8 h-8 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ' + (attachedSon ? 'text-red-400' : 'text-white')} strokeWidth={2} />
                <span className="text-[11px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Son</span>
              </button>
              {attachedSon && (
                <button type="button" onClick={() => setAttachedSon(null)} aria-label="Retirer la musique" className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 grid place-items-center text-white shadow"><X className="w-3 h-3" /></button>
              )}
            </div>
            {/* « Beau avec rien » (Pascal 2026-07-14) : icônes nettes, PAS de bulle. */}
            <button type="button" onClick={() => setPickerKind('article')} aria-label="Attacher des articles" className="flex flex-col items-center gap-1 text-white active:scale-90 transition">
              <Shirt className="w-8 h-8 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" strokeWidth={2} />
              <span className="text-[11px] font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Article{attachedArticles.length ? ` ·${attachedArticles.length}` : ''}</span>
            </button>
            <button type="button" onClick={() => setPickerKind('boutique')} aria-label="Attacher une boutique / produit" className="flex flex-col items-center gap-1 text-white active:scale-90 transition">
              <ShoppingBag className="w-8 h-8 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]" strokeWidth={2} />
              <span className="text-[11px] font-semibold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Boutique</span>
            </button>
          </div>
          {/* APERÇU DES ÉLÉMENTS ATTACHÉS — MÊME vignette que le feed, posée sur la caméra. Pascal 2026-07-14. */}
          {attachedOverlay}
          {/* LECTEUR de la musique (YouTube) en APERÇU EN HAUT ; la caméra vient DESSOUS. Pascal 2026-07-14. */}
          {attachedSon && (
            <div className="w-full bg-black shrink-0" style={{ aspectRatio: '16 / 9', marginTop: 'env(safe-area-inset-top, 0px)' }}>
              {sonVideoId ? (
                <iframe src={`https://www.youtube.com/embed/${sonVideoId}?playsinline=1`} className="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title={attachedSon.title || 'Musique'} />
              ) : (
                <div className="w-full h-full grid place-items-center text-white/60 text-[13px]">🎵 {attachedSon.title || 'Musique'}</div>
              )}
            </div>
          )}
          <div className="relative flex-1 min-h-0">
          <InlineCamera
            initialMode={capture}
            onCapture={({ url, type }) => { setCapture(null); if (type === 'image') setEditImage(url); else { setMediaUrl(url); setMediaKind(type); } }}
            onCancel={() => router.push('/home')}
            guides={
              <>
                {/* Les DEUX dégradés sombres de la Home (valeurs/hauteurs exactes) */}
                <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/65 via-black/35 to-transparent" style={{ height: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }} />
                <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
                {/* Barre noire = menu Home (même repère qu'au composer) */}
                <div className="absolute bottom-0 inset-x-0 bg-black border-t border-white/10" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }} />
                {/* (Bandeau musique retiré : la musique est désormais le LECTEUR YouTube AU-DESSUS de la caméra.) */}
                {/* TITRE en haut (centré) par-dessus la caméra */}
                {title.trim() && (
                  <div className="absolute inset-x-0 top-0 px-6 pt-[calc(env(safe-area-inset-top)+6rem)] flex flex-col items-center text-center">
                    <p className="w-full text-white text-2xl font-semibold leading-snug whitespace-pre-wrap drop-shadow-lg">{title}</p>
                  </div>
                )}
                {/* Bas : description (gauche, 3 lignes) + hashtags (gauche) + icônes — MÊME offset EXACT que le composer */}
                <div className="absolute inset-x-0 px-3 flex flex-col gap-1.5" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}>
                  {description.trim() && <p className="w-full text-white text-[15px] text-left leading-snug whitespace-pre-wrap line-clamp-3 drop-shadow-lg">{description}</p>}
                  {hashtags.trim() && <p className="w-full text-red-300 text-[14px] font-medium text-left drop-shadow-lg">{hashtags}</p>}
                </div>
              </>
            }
          />
          </div>
        </div>
      )}
    </div>
  );
}
