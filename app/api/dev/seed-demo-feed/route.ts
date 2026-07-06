/**
 * GET /api/dev/seed-demo-feed — DÉMO (super-admin), Pascal 2026-07-01.
 * Crée plusieurs cards VARIÉES dans le feed via le vrai pipeline Card OS
 * (adaptateurs chat → `.card` → direct_card → rendu SuperCardView). Sert à voir
 * le feed peuplé de cards de types différents. Gated super-admin, owner = l'admin.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getDb } from '@/lib/db-core';
import { createDirectCard, setCardDotcard } from '@/lib/db-direct-cards';

const DEMO_TITLES = [
  'Chris Brown — Under the Influence', 'Couscous royal maison', 'La Villa des Épices',
  'Casque audio sans fil Bluetooth', 'Antananarivo — Ensoleillé', 'Madagascar',
];
import { serializeCard, type SuperCard } from '@/lib/cards/supercard';
import {
  fromChatYouTube, fromChatPlace, fromChatRecipe, fromChatWikipedia,
  fromChatWeather, fromChatProduct,
} from '@/lib/cards/adapt-chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // UNDO : retire les cards démo du feed ET de la matrice unifiée (?undo=1).
  if (req.nextUrl.searchParams.get('undo') === '1') {
    const db = getDb();
    const ph = DEMO_TITLES.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id FROM direct_cards WHERE user_id = ? AND caption IN (${ph})`).all(me.id, ...DEMO_TITLES) as { id: string }[];
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const idPh = ids.map(() => '?').join(',');
      for (const [tbl, col1, col2] of [['card_likes', 'card_kind', 'card_id'], ['card_comments', 'card_kind', 'card_id'], ['unified_posts', 'source', 'id']] as const) {
        try { db.prepare(`DELETE FROM ${tbl} WHERE ${col1}='direct_card' AND ${col2} IN (${idPh})`).run(...ids); } catch { /* table absente */ }
      }
      db.prepare(`DELETE FROM direct_cards WHERE id IN (${idPh})`).run(...ids);
    }
    return NextResponse.json({ ok: true, removed: ids.length, hint: 'Feed nettoyé.' });
  }

  const cards: SuperCard[] = [
    fromChatYouTube({ video_id: 'wWR0VD6qgt8', title: 'Chris Brown — Under the Influence', channel: 'Chris Brown', description: 'Clip officiel.', thumbnail: 'https://i.ytimg.com/vi/wWR0VD6qgt8/hqdefault.jpg', is_music: true }),
    fromChatRecipe({ name: 'Couscous royal maison', image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800', prep_time: '45 min', servings: '6 personnes', difficulty: 'Moyen', ingredients: ['semoule', 'agneau', 'poulet', 'merguez', 'pois chiches', 'carottes', 'courgettes', 'navets'], description: 'Le grand classique convivial, viandes et légumes mijotés.', source_url: 'https://www.marmiton.org/recettes/recette_couscous_19226.aspx', source: 'marmiton' }),
    fromChatPlace({ name: 'La Villa des Épices', category: 'Restaurant', cuisine: 'Marocaine', address: '12 rue de la Kasbah', distance_m: 420, maps_url: 'https://www.openstreetmap.org/', google_maps_url: 'https://maps.google.com/', website: null, phone: '+212 5 24 00 00 00', opening_hours: '12:00-23:00', opening_hours_raw: '12:00-23:00', open_status: null, image_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800', lat: 31.6295, lng: -7.9811 }),
    fromChatProduct({ id: 'demo1', title: 'Casque audio sans fil Bluetooth', image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', price_label: '89 000 Ar', currency: 'MGA', source: 'AliExpress', source_url: 'https://www.aliexpress.com/', condition: 'neuf' }),
    fromChatWeather({ temperature_c: 27, feels_like_c: 29, condition_label: 'Ensoleillé', icon: '01d', wind_kmh: 12, humidity_pct: 55, source: 'open-meteo', source_url: 'https://open-meteo.com/', observed_at: '2026-07-01T12:00:00Z', lat: -18.8792, lng: 47.5079, place_label: 'Antananarivo' }),
    fromChatWikipedia({ title: 'Madagascar', extract: "Madagascar, en forme longue la république de Madagascar, est un État insulaire de l'océan Indien.", thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Baobab_Avenue.jpg/320px-Baobab_Avenue.jpg', page_url: 'https://fr.wikipedia.org/wiki/Madagascar', lang: 'fr', source: 'wikipedia' }),
  ];

  const ids: string[] = [];
  for (const card of cards) {
    try {
      const dc = createDirectCard(me.id, {
        type: 'image',
        media_url: card.images?.[0] ?? null,
        caption: card.title ?? null,
        text: card.text?.body ?? null,
        category: card.categories?.[0] ?? null,
      });
      setCardDotcard(dc.id, serializeCard(card));
      ids.push(dc.id);
    } catch { /* on continue les autres */ }
  }

  return NextResponse.json({ ok: true, created: ids.length, ids, hint: 'Va dans le feed (Accueil / Découvrir) pour les voir.' });
}
