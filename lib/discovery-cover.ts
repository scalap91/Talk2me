/**
 * deriveCover — lecteur DISCOVERY (Pascal 2026-08-30). Le .card est la source ; ici on n'affiche PAS
 * la card comme au feed (AlignedPostCard/FeedMini), on en EXTRAIT le strict nécessaire pour une mise en
 * scène ÉDITORIALE : une image de couverture, un titre, un sous-titre, un type. Ça donne au Discovery sa
 * propre disposition (disques, posters, mosaïque) au lieu de reprendre bêtement le rendu du feed.
 */

export type CoverKind = 'music' | 'video' | 'film' | 'photo' | 'texte' | 'boutique' | 'produit' | 'post';

export interface DiscoveryCover {
  id: string;
  image: string | null;   // couverture (null → tuile typographique)
  title: string;
  subtitle: string | null;
  kind: CoverKind;
  emoji: string;          // pastille de type
  accent: string;         // couleur dérivée (déterministe) pour les tuiles sans image
}

const EMOJI: Record<CoverKind, string> = {
  music: '🎵', video: '🎬', film: '🎞️', photo: '🖼️', texte: '✍️', boutique: '🛍️', produit: '🏷️', post: '💬',
};

// Palette chaude (marque), déterministe selon l'id → une tuile texte garde toujours la même couleur.
const ACCENTS = ['#FF7F11', '#FF3D2E', '#F5A623', '#E8552D', '#FF9E45', '#D64541'];
function accentFor(seed: string): string {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function ytId(...cands: (string | null | undefined)[]): string | null {
  for (const c of cands) {
    if (!c) continue;
    const m = String(c).match(/[?&]v=([A-Za-z0-9_-]{6,})/) || String(c).match(/\/vi\/([A-Za-z0-9_-]{6,})\//) || String(c).match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) || String(c).match(/embed\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[1];
  }
  return null;
}
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

const looksImage = (u?: string | null) => !!u && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u);
const looksVideo = (u?: string | null) => !!u && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u);
// Vidéo perso locale sans poster → vignette auto (1ʳᵉ image via ffmpeg, cache disque). Cf. /api/media/poster.
const videoPoster = (u?: string | null) => (u && u.startsWith('/uploads/') && looksVideo(u)) ? `/api/media/poster?src=${encodeURIComponent(u)}` : null;
const clean = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim();

function firstLine(s?: string | null, max = 80): string {
  const t = clean(s);
  if (!t) return '';
  const line = t.split(/[.!?\n]/)[0] || t;
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

export function deriveCover(raw: unknown): DiscoveryCover {
  const it = (raw || {}) as Record<string, unknown>;
  const id = String(it.id ?? it.card_id ?? Math.random());
  const accent = accentFor(id);
  const mk = (o: Partial<DiscoveryCover>): DiscoveryCover => ({
    id, image: null, title: 'Sans titre', subtitle: null, kind: 'post', emoji: EMOJI[o.kind ?? 'post'], accent, ...o,
  });

  // Boutique / fiche.
  if (it.kind === 'boutique' || it.card_kind === 'boutique') {
    return mk({ kind: 'boutique', image: (it.cover_url as string) || null, title: clean(it.name as string) || 'Boutique', subtitle: firstLine(it.description as string) || null });
  }

  // Musique (audio YouTube attaché) → DISQUE.
  const audioRaw = it.attached_audio_json as string | null | undefined;
  if (audioRaw) {
    try {
      const a = JSON.parse(audioRaw) as { title?: string; author?: { name?: string }; description?: string; thumbnail_url?: string; external_url?: string };
      const vid = ytId(a.external_url, a.thumbnail_url);
      const img = a.thumbnail_url || (vid ? ytThumb(vid) : null);
      return mk({ kind: 'music', image: img, title: clean(a.title) || 'Musique', subtitle: clean(a.author?.name) || clean(a.description) || null });
    } catch { /* */ }
  }

  const layout = String(it.layout ?? '');
  const type = String(it.type ?? '');
  const mediaUrl = (it.media_url as string) || null;
  const caption = firstLine((it.caption as string) || (it.text as string));
  const yt = ytId(mediaUrl, it.dotcard as string);

  // Produit attaché.
  const prodRaw = it.attached_product_json as string | null | undefined;
  if (prodRaw) {
    try {
      const p = JSON.parse(prodRaw) as { title?: string; name?: string; image?: string; image_url?: string; priceLabel?: string; price_label?: string };
      const img = p.image || p.image_url || (looksImage(mediaUrl) ? mediaUrl : null);
      if (img) return mk({ kind: 'produit', image: img, title: clean(p.title || p.name) || caption || 'Produit', subtitle: clean(p.priceLabel || p.price_label) || null });
    } catch { /* */ }
  }

  // Film / vidéo.
  if (layout === 'film' || type === 'video' || it.kind === 'video_card' || layout === 'video' || yt) {
    const img = yt ? ytThumb(yt) : (looksImage(mediaUrl) ? mediaUrl : videoPoster(mediaUrl));
    return mk({ kind: layout === 'film' ? 'film' : 'video', image: img, title: caption || (layout === 'film' ? 'Film' : 'Vidéo'), subtitle: null });
  }

  // Photo.
  if (type === 'image' || it.kind === 'image_card' || looksImage(mediaUrl)) {
    return mk({ kind: 'photo', image: mediaUrl, title: caption || 'Photo', subtitle: null });
  }

  // Texte / post → tuile typographique (pas d'image, on met le titre en grand).
  const postContent = (it.post as { content?: string } | undefined)?.content;
  const title = caption || firstLine(postContent) || firstLine(it.text as string) || 'Publication';
  return mk({ kind: type === 'texte' || it.kind === 'texte_card' ? 'texte' : 'post', image: null, title, subtitle: null });
}
