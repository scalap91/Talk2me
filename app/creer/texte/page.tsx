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
import { X, Check, Loader2, Camera, Film, Link2, Trash2, Share2, FileText, Wand2 } from '@/lib/icons';
import InlineCamera from '@/components/cards/editors/InlineCamera';
import FormatExportSheet from '@/components/composer/FormatExportSheet';
import AiVideoStudioSheet from '@/components/composer/AiVideoStudioSheet';
import VideoCardEditor from '@/components/cards/editors/VideoCardEditor';
import CaptionField from '@/components/composer/CaptionField';
import { reorderCaptionForReading } from '@/lib/search/metadata-map';
import { useCardDraftStore } from '@/lib/card-draft-store';
import { saveDraftNow } from '@/lib/use-draft-autosave';
import dynamic from 'next/dynamic';

// Éditeur photo Filerobot (MIT) — crop / filtres Insta / ajustements / annotations.
// Client-only (canvas/konva) → import dynamique sans SSR.
const FilerobotImageEditor = dynamic(() => import('react-filerobot-image-editor'), { ssr: false });

// IDENTIQUE à BG_VARIANTS de TexteCardDisplay.
const BG_VARIANTS: Record<string, string> = {
  neutral: 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)',
  purple: 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)',
  blue: 'linear-gradient(135deg, #18233a 0%, #213254 100%)',
  warm: 'linear-gradient(135deg, #2a1d20 0%, #3d2530 100%)',
};
const ORDER = ['neutral', 'purple', 'blue', 'warm'];

export default function CreerPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [variant, setVariant] = useState('neutral');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | null>(null);
  const [articleUrl, setArticleUrl] = useState('');
  const [showArticle, setShowArticle] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [capture, setCapture] = useState<'photo' | 'video' | null>(null); // caméra inline ouverte ?
  const [showExport, setShowExport] = useState(false); // feuille « Décliner pour… »
  const [showStudio, setShowStudio] = useState(false); // feuille « Studio Vidéo IA »
  const [editVideo, setEditVideo] = useState(false); // éditeur vidéo (trim/filtres/musique)
  const [editImage, setEditImage] = useState<string | null>(null); // photo en cours d'édition (Filerobot)
  const [composerProjectId, setComposerProjectId] = useState(''); // projet studio à rouvrir pour éditer les scènes
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

  // Retour du Composer Studio (/composer) : le résultat de l'IA REVIENT ici (média
  // attaché), c'est la SEULE page où l'on décide Publier ou Brouillon (Pascal 2026-06-21).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('from') !== 'composer') return;
    const media = q.get('media'); const kind = q.get('kind');
    if (media && (kind === 'video' || kind === 'image')) { setMediaUrl(media); setMediaKind(kind); }
    const cap = (q.get('caption') || '').trim(); if (cap) setTitle(cap.slice(0, 200));
    const tags = (q.get('tags') || '').trim();
    if (tags) setHashtags(tags.split(',').map((t) => (t.startsWith('#') ? t : '#' + t)).join(' '));
    const proj = (q.get('project') || '').trim(); if (proj) setComposerProjectId(proj); // pour revenir éditer les scènes
  }, []);

  // Tuile Photo (« Créer une card ») : on atterrit DIRECT sur « prendre photo » (la caméra),
  // sans passer par l'écran texte — Pascal 2026-07-03.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('start') === 'photo') setCapture('photo');
  }, []);

  // Upload d'une image DÉJÀ éditée (sortie Filerobot) → devient le média de la card.
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

  const assembled = [title.trim(), description.trim(), hashtags.trim()].filter(Boolean).join('\n\n');
  // VIDÉO : le composer EST l'aperçu — il s'affiche au format feed (vidéo 16/9 en haut fond noir,
  // texte dessous), pas en plein écran superposé. Pascal 2026-07-11 : « l'aperçu doit être le composer ».
  const isVideo = !!mediaUrl && mediaKind === 'video';

  const publish = async () => {
    if (publishing) return;
    if (!assembled && !mediaUrl) return; // au moins du texte ou un média
    setPublishing(true);
    try {
      const attached_product = articleUrl.trim() ? { url: articleUrl.trim(), title: 'Article' } : undefined;
      // Réordonne la légende (hashtags de tête → fin) AVANT de publier : bon ordre de lecture. Pascal 2026-07-12.
      const cap = reorderCaptionForReading(assembled);
      const body = mediaUrl
        ? { type: mediaKind, media_url: mediaUrl, caption: cap.slice(0, 200), attached_product }
        : { type: 'texte', text: (cap + (articleUrl.trim() ? '\n' + articleUrl.trim() : '')).slice(0, 200), bg_variant: variant, attached_product };
      const r = await fetch('/api/cards/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        const cardId = d?.card?.id;
        // Atterrir DIRECT sur la Home, sur MON post (le feed scrolle sur #card-<id>).
        router.push(cardId ? `/home#card-${cardId}` : '/home');
      } else setPublishing(false);
    } catch { setPublishing(false); }
  };

  // Bouton Brouillon — sauve la compo en cours et va dans Mes cards (brouillons).
  const saveDraft = async () => {
    if (savingDraft) return;
    if (!assembled && !mediaUrl) return;
    setSavingDraft(true);
    try {
      await saveDraftNow({
        id: null,
        type: mediaUrl ? (mediaKind || 'image') : 'texte',
        draftData: { title, description, hashtags, mediaUrl, mediaKind, articleUrl, variant },
        thumbnailUrl: mediaUrl || null,
        title: title.trim() || description.trim().slice(0, 40) || 'Brouillon',
      });
      // Mis en brouillon → on revient sur le FIL de la Home (pas sur /drafts).
      router.push('/home');
    } finally { setSavingDraft(false); }
  };

  return (
    <div
      className="relative w-full h-[100svh] max-w-md mx-auto overflow-hidden select-none bg-black"
      style={mediaUrl ? (isVideo ? { background: '#0d0b16' } : undefined) : { background: BG_VARIANTS[variant] }}
    >
      {/* Média de fond (si attaché) */}
      {mediaUrl && mediaKind === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {isVideo && (
        // Vidéo = format feed : bloc 16/9 calé EN HAUT (sous le header), fond noir, jamais plein écran.
        <div className="absolute inset-x-0 z-[2] bg-black" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)', aspectRatio: '16 / 9' }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={mediaUrl!} className="w-full h-full object-contain bg-black" controls playsInline preload="metadata" />
        </div>
      )}
      {/* Dégradé HAUT — valeurs EXACTES Home (header h-14=56px + safe-area). */}
      <div className="absolute top-0 inset-x-0 z-[5] pointer-events-none bg-gradient-to-b from-black/65 via-black/35 to-transparent" style={{ height: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }} />

      {/* Barre haute : fermer + nuancier (si pas de média) */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button onClick={() => router.push('/home')} aria-label="Annuler" className="w-9 h-9 rounded-full bg-black/40 grid place-items-center text-white/90">
          <X className="w-5 h-5" />
        </button>
        {!mediaUrl ? (
          <div className="flex items-center gap-2">
            {ORDER.map((k) => (
              <button key={k} onClick={() => setVariant(k)} aria-label={`Fond ${k}`}
                className={'w-7 h-7 rounded-full border-2 ' + (variant === k ? 'border-white' : 'border-white/30')}
                style={{ background: BG_VARIANTS[k] }} />
            ))}
          </div>
        ) : (
          <button onClick={() => { setMediaUrl(null); setMediaKind(null); }} className="px-3 h-9 rounded-full bg-black/40 text-white/90 text-[12px] inline-flex items-center gap-1">
            <Trash2 className="w-4 h-4" /> Retirer
          </button>
        )}
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

      {/* VIDÉO : ÉDITION SOUS LA VIDÉO (le composer = format feed). Titre + description +
          hashtags juste sous le bloc 16/9, sur fond noir, comme la card sortira au feed. */}
      {isVideo && (
        <div className="absolute inset-x-0 z-10 px-5 overflow-y-auto"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem + 56.25vw + 14px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)' }}>
          <textarea
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} rows={2}
            placeholder="Titre…"
            className="w-full bg-transparent text-white text-[17px] font-extrabold leading-snug outline-none resize-none placeholder:text-white/35"
            style={{ fontFamily: "'Outfit',sans-serif", letterSpacing: '-0.01em' }}
          />
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} rows={4}
            placeholder="Décris ta vidéo…"
            className="w-full mt-1.5 bg-transparent text-[15px] leading-relaxed outline-none resize-none placeholder:text-white/30"
            style={{ fontFamily: "'Inter',sans-serif", color: 'rgba(255,255,255,.92)' }}
          />
          <input
            value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtags"
            className="w-full mt-2 bg-transparent text-red-300 text-[14px] font-medium outline-none placeholder:text-red-300/40"
          />
        </div>
      )}

      {/* OUTILS AU MILIEU (Pascal) — Photo / Vidéo / Article centrés. Cachés une
          fois qu'un média est attaché (le média prend le centre). */}
      {!mediaUrl && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 px-6 flex flex-col items-center gap-3">
          <div className="flex items-center justify-center gap-3">
            <AttachBtn icon={<Camera className="w-6 h-6" />} label="Photo" onClick={() => setCapture('photo')} busy={uploading} />
            <AttachBtn icon={<Film className="w-6 h-6" />} label="Vidéo" onClick={() => videoRef.current?.click()} busy={uploading} />
            <AttachBtn icon={<Link2 className="w-6 h-6" />} label="Article" onClick={() => setShowArticle(true)} active={showArticle || !!articleUrl} />
          </div>
          {/* Bouton « Ouvrir le Composer Studio » RETIRÉ (Studio = LABO, pas prêt). Pascal 2026-07-12. */}
        </div>
      )}

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


      {/* Média venant du Composer Studio → revenir éditer les 4 images/scènes (Studio /composer, labo) */}
      {composerProjectId && (
        <button
          type="button"
          onClick={() => router.push('/composer?project=' + encodeURIComponent(composerProjectId))}
          className="absolute top-[calc(env(safe-area-inset-top)+3.5rem)] left-3 z-20 px-3 h-9 rounded-full bg-violet-600 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 active:scale-95"
        >
          <Wand2 className="w-4 h-4" /> Modifier les images
        </button>
      )}

      {/* FOOTER façon vrai post (Pascal) : bulle auteur + icônes sociales, mais
          ICI DÉCORATIVES (aperçu, non cliquables) → placées exactement où elles
          seront sur le post. Publier reste à droite, à sa place. */}
      {/* Dégradé BAS — valeurs EXACTES Home (from-black/85 via-black/45), hauteur courte. */}
      <div className="absolute bottom-0 inset-x-0 h-40 z-10 pointer-events-none bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      {/* BARRE NOIRE = symbolise le menu de la Home (BottomNav h-16=64px). Repère
          visuel, derrière Publier. Même hauteur (safe-area incluse). (Pascal) */}
      <div className="absolute bottom-0 inset-x-0 z-[15] pointer-events-none bg-black border-t border-white/10" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }} />

      {/* BLOC BAS : description (gauche, 3 lignes) + hashtags (gauche, 1 ligne) +
          icônes sociales. Ancré en bas ; les icônes (dernier enfant) restent à
          un offset FIXE → pile poil identique en mode caméra.
          Masqué pour la vidéo (texte déplacé SOUS la vidéo = format feed). */}
      {!isVideo && (
      <div className="absolute inset-x-0 z-20 px-3" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.75rem)' }}>
        {/* UN SEUL CHAMP LÉGENDE qui FLUE comme le feed (Pascal 2026-07-12) : titre + texte +
            hashtags dans le MÊME flux (logique « une ligne » de tous nos posts), plus de champs
            titre/description/hashtag séparés. Le publish envoie déjà `assembled` = ce texte →
            WYSIWYG exact du feed. Même style/place que la légende du feed (15px, blanc, bas-gauche). */}
        <CaptionField
          value={description} onChange={setDescription} maxLength={200} rows={2}
          placeholder="Écris ta légende…  #hashtag  @tag un ami"
          className="w-full bg-transparent text-white text-[15px] text-left leading-snug outline-none resize-none placeholder:text-white/45 drop-shadow"
          style={{ maxHeight: '5rem' }}
        />
      </div>
      )}

      {/* Brouillon + Publier */}
      <div className="absolute inset-x-0 z-20 px-3 flex items-center justify-between gap-3" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}>
        <button
          onClick={saveDraft}
          disabled={(!assembled && !mediaUrl) || savingDraft || publishing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 border border-white/15 text-white/85 text-[14px] font-medium disabled:opacity-40 active:scale-[0.98]"
        >
          {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {savingDraft ? '…' : 'Brouillon'}
        </button>
        <button
          onClick={() => setShowExport(true)}
          disabled={!assembled && !mediaUrl}
          aria-label="Décliner pour les réseaux"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 border border-white/15 text-white/85 text-[14px] font-medium disabled:opacity-40 active:scale-[0.98]"
        >
          <Share2 className="w-4 h-4" /> Décliner
        </button>
        <button
          onClick={publish}
          disabled={(!assembled && !mediaUrl) || publishing || uploading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600 text-white text-[14px] font-semibold disabled:opacity-40 active:scale-[0.98]"
        >
          {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {publishing ? 'Publication…' : 'Publier'}
        </button>
      </div>

      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => onPick(e, 'video')} />


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
            onResult={({ videoUrl }) => {
              if (videoUrl) { setMediaUrl(videoUrl); setMediaKind('video'); }
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

      {/* STUDIO VIDÉO IA — sujet → script DeepSeek → voix ElevenLabs (gated) → montage ffmpeg */}
      {showStudio && (
        <AiVideoStudioSheet
          initialTopic={[title, description].filter(Boolean).join('. ').trim()}
          imageUrls={mediaUrl && mediaKind === 'image' ? [mediaUrl] : []}
          onClose={() => setShowStudio(false)}
          onResult={({ url, title: vt }) => {
            setMediaUrl(url);
            setMediaKind('video');
            if (!title.trim() && vt) setTitle(vt.slice(0, 200));
            setShowStudio(false);
          }}
        />
      )}

      {/* ÉDITEUR PHOTO (Filerobot, MIT) — crop / filtres Insta / ajuste / annote → devient la card. */}
      {editImage && (
        <div className="fixed inset-0 z-[60] bg-black">
          <FilerobotImageEditor
            source={editImage}
            onSave={(edited: { imageBase64?: string }) => uploadEdited(edited?.imageBase64 || editImage)}
            onClose={() => setEditImage(null)}
            savingPixelRatio={2}
            previewPixelRatio={typeof window !== 'undefined' ? window.devicePixelRatio : 1}
            // FORMAT FEED (Pascal 2026-07-12) : recadrage vertical plein écran 9:16 (taille du FEED
            // immersif, PAS la card 4:5). Un seul ratio imposé, ouverture direct sur le crop.
            Crop={{ ratio: 9 / 16, noPresets: true }}
            defaultTabId="Adjust"
            defaultToolId="Crop"
            // Pas d'étape « nommer la photo » : Save enregistre DIRECT (skip le modal de sauvegarde
            // Filerobot qui demandait un nom/format). Pascal 2026-07-12.
            onBeforeSave={() => false}
          />
        </div>
      )}

      {/* CAMÉRA INLINE (Pascal) — le bouton Photo ouvre la caméra DANS le composer.
          On capture → la photo devient le fond de la card, on reste sur le WYSIWYG. */}
      {capture && (
        <div className="absolute inset-0 z-40">
          <InlineCamera
            initialMode={capture}
            onCapture={({ url, type }) => { setCapture(null); if (type === 'image') setEditImage(url); else { setMediaUrl(url); setMediaKind(type); } }}
            onCancel={() => setCapture(null)}
            guides={
              <>
                {/* Les DEUX dégradés sombres de la Home (valeurs/hauteurs exactes) */}
                <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/65 via-black/35 to-transparent" style={{ height: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }} />
                <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
                {/* Barre noire = menu Home (même repère qu'au composer) */}
                <div className="absolute bottom-0 inset-x-0 bg-black border-t border-white/10" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }} />
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
      )}
    </div>
  );
}

function AttachBtn({ icon, label, onClick, busy, active }: { icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={'w-[88px] h-[88px] flex flex-col items-center justify-center gap-2 rounded-2xl border text-[12px] transition ' +
        (active ? 'border-red-400/50 bg-red-500/15 text-red-100' : 'border-white/12 bg-white/[0.05] text-white/80 hover:bg-white/[0.1]')}
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
