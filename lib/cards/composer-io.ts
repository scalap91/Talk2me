/**
 * lib/cards/composer-io — SORTIE du composer en `.card` (Card OS, Pascal 2026-06-30).
 * Le composer remplit des RAYONS prédéfinis (media → images/video, caption/text → text,
 * produit → product, audio → audio). Ce module convertit ce qu'il produit (une direct_card)
 * en SuperCard propre, puis serializeCard donne le fichier `.card`. parseCard fait le retour.
 * Doctrine : on remplit JUSTE les rayons pertinents, jamais l'API brute. Pur (browser+server).
 */
import { makeCard, serializeCard, type SuperCard, type CardType, type CardAction } from '@/lib/cards/supercard';
import { youtubeId } from '@/lib/cards/entity-key';
import { extractHashtagsFromText, extractMentionsFromText } from '@/lib/search/metadata-map';

/** URL vidéo → src d'embed iframe (le feed rend `<iframe src={video.embed}>`). YouTube → /embed/ID. */
function videoEmbed(url: string): string | undefined {
  const yt = youtubeId(url);
  return yt ? `https://www.youtube.com/embed/${yt}` : undefined;
}

function priceFromLabel(label: string | null | undefined): { amount?: number; currency?: string } | undefined {
  if (!label) return undefined;
  const m = String(label).replace(/\s/g, '').replace(',', '.').match(/([\d.]+)/);
  const amount = m ? parseFloat(m[1]) : undefined;
  if (amount == null || isNaN(amount)) return undefined;
  return { amount, currency: /€|eur/i.test(label) ? 'EUR' : /\$/.test(label) ? 'USD' : 'EUR' };
}

export interface DirectCardLike {
  id: string;
  type: string; // 'image' | 'video' | 'texte'
  media_url?: string | null;
  caption?: string | null;
  text?: string | null;
  user_id?: string | null;
  attached_product_json?: string | null;
  attached_audio_json?: string | null;
}

/** Une direct_card (sortie composer) → SuperCard, chaque chose dans SON rayon. */
export function cardFromDirectCard(c: DirectCardLike): SuperCard {
  const types: CardType[] = c.type === 'image' ? ['image'] : c.type === 'video' ? ['video'] : ['social_post'];
  const body = (c.text || c.caption || '').trim();
  const hashtags = extractHashtagsFromText(body);
  const mentions = extractMentionsFromText(body);

  // Rayon produit (si l'user a attaché un produit) — champs PROPRES, pas l'API brute.
  let price: SuperCard['price'];
  let api: SuperCard['api'];
  let actions: CardAction[] | undefined;
  if (c.attached_product_json) {
    try {
      const p = JSON.parse(c.attached_product_json) as { title?: string; image_url?: string | null; price_label?: string | null; currency?: string | null };
      types.push('product');
      const parsed = priceFromLabel(p.price_label);
      price = { live: true, currency: parsed?.currency || p.currency || 'EUR', ...(parsed?.amount != null ? { amount: parsed.amount } : {}) };
      api = { provider: 'aliexpress', ref: (p.title || '').slice(0, 60) };
      actions = [{ kind: 'buy', label: 'Acheter' }];
    } catch { /* ignore */ }
  }

  // Rayon audio (musique attachée)
  let audio: SuperCard['audio'];
  if (c.attached_audio_json) {
    try {
      const a = JSON.parse(c.attached_audio_json) as { embed?: { src?: string }; external_url?: string };
      const src = a.embed?.src || a.external_url;
      if (src) audio = { embed: src };
    } catch { /* ignore */ }
  }

  return makeCard({
    id: c.id,
    title: '',
    types,
    images: c.type === 'image' && c.media_url ? [c.media_url] : undefined,
    video: c.type === 'video' && c.media_url ? { url: c.media_url, embed: videoEmbed(c.media_url) } : undefined,
    text: body ? { body } : undefined, // markdown OK (rich text)
    // #hashtags + @mentions STRUCTURÉS dans la card (pas juste dans le texte tronqué) → la
    // recherche + le tag lisent la card, pas la ligne affichée. Pascal 2026-07-12.
    hashtags: hashtags.length ? hashtags : undefined,
    mentions: mentions.length ? mentions : undefined,
    audio,
    price,
    api,
    actions,
    owner: c.user_id || undefined,
    state: 'published',
  });
}

/** Le fichier `.card` (string) correspondant à une direct_card. */
export function dotCardFromDirectCard(c: DirectCardLike): string {
  return serializeCard(cardFromDirectCard(c));
}
