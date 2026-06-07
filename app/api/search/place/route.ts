import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// opening_hours n'expose pas de types TS — on type manuellement la surface utilisée.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const OpeningHours = require('opening_hours') as new (raw: string) => {
  getState: () => boolean;
  getNextChange: () => Date | undefined;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Place {
  name: string;
  category: string;
  cuisine: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  maps_url: string;
  google_maps_url: string;
  directions_url: string;
  source_url: string;
  website: string | null;
  phone: string | null;
  opening_hours_raw: string | null;
  open_status: {
    is_open: boolean | null;
    label: string | null;
  } | null;
  image_url: string | null;
}

interface OverpassTags {
  name?: string;
  amenity?: string;
  shop?: string;
  tourism?: string;
  leisure?: string;
  cuisine?: string;
  website?: string;
  phone?: string;
  opening_hours?: string;
  ['addr:housenumber']?: string;
  ['addr:street']?: string;
  ['addr:postcode']?: string;
  ['addr:city']?: string;
  ['contact:website']?: string;
  ['contact:phone']?: string;
  ['contact:url']?: string;
  image?: string;
  wikimedia_commons?: string;
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  tags?: OverpassTags;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

const CATEGORY_PATTERNS: Record<string, string> = {
  food: 'restaurant|cafe|fast_food',
  drink: 'bar|pub|cafe|biergarten',
  any: 'restaurant|cafe|fast_food|bar|pub',
};

const AMENITY_WHITELIST = ['restaurant','cafe','pharmacy','bakery','bar','fast_food','hospital','clinic','doctors','dentist','school','pub','hotel','motel','guest_house','hostel'];

/**
 * Mapping amenity sémantique → tag OSM réel.
 * Certaines amenity (boulangerie) sont en fait taggées `shop=bakery` dans OSM
 * et non `amenity=bakery`. Les hôtels sont taggés `tourism=hotel` (pas
 * `amenity=hotel`) — c'est la source du bug fuzz #349 hotel 12/12 cassé.
 * On centralise ici la traduction.
 */
const AMENITY_OSM_TAG: Record<string, { key: string; value: string }> = {
  restaurant: { key: 'amenity', value: 'restaurant' },
  cafe: { key: 'amenity', value: 'cafe' },
  pharmacy: { key: 'amenity', value: 'pharmacy' },
  bar: { key: 'amenity', value: 'bar' },
  pub: { key: 'amenity', value: 'pub' },
  fast_food: { key: 'amenity', value: 'fast_food' },
  hospital: { key: 'amenity', value: 'hospital' },
  clinic: { key: 'amenity', value: 'clinic' },
  doctors: { key: 'amenity', value: 'doctors' },
  dentist: { key: 'amenity', value: 'dentist' },
  school: { key: 'amenity', value: 'school' },
  // shop=*
  bakery: { key: 'shop', value: 'bakery' },
  // tourism=*
  hotel: { key: 'tourism', value: 'hotel' },
  motel: { key: 'tourism', value: 'motel' },
  guest_house: { key: 'tourism', value: 'guest_house' },
  hostel: { key: 'tourism', value: 'hostel' },
};

/**
 * Pour certains amenity sémantiques, on veut élargir à plusieurs tags OSM
 * (ex 'hotel' englobe motel, guest_house, hostel, apartment, chalet pour
 * maximiser le rappel quand l'utilisateur dit juste "hôtel"/"auberge"/"logement").
 */
const AMENITY_OSM_TAG_EXPAND: Record<string, Array<{ key: string; value: string }>> = {
  hotel: [
    { key: 'tourism', value: 'hotel' },
    { key: 'tourism', value: 'motel' },
    { key: 'tourism', value: 'guest_house' },
    { key: 'tourism', value: 'hostel' },
    { key: 'tourism', value: 'apartment' },
    { key: 'tourism', value: 'chalet' },
  ],
};

const INTENT_MAP: Record<string, { query: string; label: string }> = {
  pharmacy: { query: 'pharmacie', label: 'pharmacies' },
  restaurant: { query: 'restaurant', label: 'restaurants' },
  cafe: { query: 'café', label: 'cafés' },
  bar: { query: 'bar', label: 'bars' },
  pub: { query: 'pub', label: 'pubs' },
  fast_food: { query: 'restauration rapide', label: 'restaurants rapides' },
  bakery: { query: 'boulangerie', label: 'boulangeries' },
  hospital: { query: 'hôpital', label: 'hôpitaux' },
  clinic: { query: 'clinique', label: 'cliniques' },
  doctors: { query: 'médecin', label: 'médecins' },
  dentist: { query: 'dentiste', label: 'dentistes' },
  school: { query: 'école', label: 'écoles' },
  hotel: { query: 'hôtel', label: 'hôtels' },
  motel: { query: 'motel', label: 'motels' },
  guest_house: { query: 'maison d\'hôtes', label: 'maisons d\'hôtes' },
  hostel: { query: 'auberge de jeunesse', label: 'auberges' },
};

const CATEGORY_INTENT_MAP: Record<string, { query: string; label: string }> = {
  food: { query: 'restaurant', label: 'restaurants' },
  drink: { query: 'bar', label: 'bars' },
  place: { query: 'lieu', label: 'lieux' },
  any: { query: 'restaurant', label: 'restaurants' },
};

const cache = new Map<string, { data: Place[]; expiry: number }>();
const CACHE_TTL = 600_000; // 10 min

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Préambule Overpass — `timeout:4` natif côté serveur pour qu'il drope vite
 * les requêtes qui s'éternisent. L'AbortController côté client (5s) est notre
 * garde-fou en cas de miroir capricieux qui ignore le timeout natif.
 *
 * Fuzz #349/#350 (Pascal 2026-06-04) : p99 search_place = 22.5s. Cause =
 * `overpass-api.de` primary parfois surchargé. Fix = chaîne de miroirs +
 * timeout serré + fail-fast vers fallback chain consciousness.
 */
const OVERPASS_PREAMBLE = '[out:json][timeout:4]';

function buildOverpassQuery(
  category: string,
  lat: number,
  lng: number,
  radius: number,
  amenity?: string
): string {
  if (amenity) {
    // Expansion : un seul `amenity` sémantique peut se traduire en plusieurs
    // tags OSM (ex hotel → tourism=hotel + motel + guest_house + …). On
    // construit alors une union Overpass.
    const expand = AMENITY_OSM_TAG_EXPAND[amenity];
    if (expand && expand.length > 0) {
      const nodes = expand
        .map((t) => `node["${t.key}"="${t.value}"](around:${radius},${lat},${lng});`)
        .join('\n  ');
      return `${OVERPASS_PREAMBLE};\n(\n  ${nodes}\n);\nout body 30;`;
    }
    const tag = AMENITY_OSM_TAG[amenity] || { key: 'amenity', value: amenity };
    return `${OVERPASS_PREAMBLE};\n(node["${tag.key}"="${tag.value}"](around:${radius},${lat},${lng}););\nout body 30;`;
  }
  if (category === 'place') {
    return `${OVERPASS_PREAMBLE};\n(\n  node["tourism"](around:${radius},${lat},${lng});\n  node["leisure"](around:${radius},${lat},${lng});\n);\nout body 30;`;
  }
  const pattern = CATEGORY_PATTERNS[category] || CATEGORY_PATTERNS.any;
  return `${OVERPASS_PREAMBLE};\n(node["amenity"~"${pattern}"](around:${radius},${lat},${lng}););\nout body 30;`;
}

function buildAddress(tags: OverpassTags): string | null {
  const parts: string[] = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  if (tags['addr:street']) parts.push(tags['addr:street']);
  // postcode séparé par virgule si présent
  const postcode = tags['addr:postcode'];
  const city = tags['addr:city'];
  if (postcode || city) {
    const suffix = [postcode, city].filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
    if (suffix) parts.push(suffix);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function buildImageUrl(tags: OverpassTags): string | null {
  if (tags.image) return tags.image;
  if (tags.wikimedia_commons) {
    // Pattern "File:XYZ.jpg" -> https://commons.wikimedia.org/wiki/Special:FilePath/XYZ.jpg
    const match = tags.wikimedia_commons.match(/^File:(.+)$/);
    if (match) {
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(match[1])}`;
    }
  }
  return null;
}

function parseOpenStatus(raw: string | null): Place['open_status'] {
  if (!raw) return null;
  try {
    const oh = new OpeningHours(raw);
    const isOpen = oh.getState();
    const nextChange = oh.getNextChange();
    let label: string | null = null;
    if (isOpen && nextChange) {
      const h = nextChange.getHours();
      const m = nextChange.getMinutes();
      label = `Ouvert · ferme à ${h}h${m !== 0 ? m.toString().padStart(2, '0') : ''}`;
    } else if (!isOpen && nextChange) {
      const h = nextChange.getHours();
      const m = nextChange.getMinutes();
      label = `Fermé · ouvre à ${h}h${m !== 0 ? m.toString().padStart(2, '0') : ''}`;
    } else if (isOpen) {
      label = 'Ouvert';
    } else {
      label = 'Fermé';
    }
    return { is_open: isOpen, label };
  } catch {
    return null;
  }
}

/**
 * Pool de miroirs Overpass — racés en parallèle (Promise.any).
 *
 * Choisis sur 2026-06-04 après test direct :
 *  - overpass-api.de : primary officiel, planète entière, fresh data, souvent
 *    <2s mais peut saturer en heure de pointe (timeout 22s observé fuzz #349).
 *  - lz4.overpass-api.de : secondary officiel DE, planète entière, sous-domaine
 *    LZ4-compressé, souvent moins chargé que le primary.
 *  - z.overpass-api.de : tertiary officiel DE, planète entière, 3e load-balancer.
 *
 * EXCLUS — miroirs RÉGIONAUX (incident 2026-06-06, Pascal) :
 *  - overpass.osm.ch : ⚠️ extract SUISSE UNIQUEMENT, PAS la planète. Répond en
 *    ~90ms avec `200 OK` mais 0 élément hors Suisse → en course `Promise.any`
 *    il GAGNE toujours (le plus rapide) et sert du VIDE. Symptôme : cards
 *    resto/hôtel vides partout sauf en CH (73/73 victoires, 0 résultat à Paris).
 *    Un miroir rapide-mais-vide est PIRE qu'un miroir lent : il empoisonne la
 *    course. Ne JAMAIS mettre un extract régional dans un pool mondial.
 *
 * EXCLUS — instables :
 *  - overpass.kumi.systems : 68 timeouts / 0 victoire sur la fenêtre observée,
 *    poids mort qui ne fait que bruiter les logs.
 *
 * EXCLUS — whitelist-only (testés 2026-06-04, retournent 403) :
 *  - maps.mail.ru/osm/tools/overpass.
 *  - overpass.openstreetmap.fr (réservé partenaires FR).
 *
 * Fuzz #349 : sans cette cascade, p99 = 22.5s sur le primary lorsqu'il est
 * surchargé. Avec course parallèle des 3 miroirs mondiaux + timeout 5s, le
 * premier qui répond gagne — worst case = 5s.
 */
const OVERPASS_MIRRORS: ReadonlyArray<string> = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];

const OVERPASS_TIMEOUT_MS = 5000;

interface OverpassFetchSuccess {
  ok: true;
  data: OverpassResponse;
  mirror: string;
  ms: number;
  attempts: number;
}

interface OverpassFetchFailure {
  ok: false;
  reason: string;
  attempts: number;
  failures: Array<{ mirror: string; reason: string; ms: number }>;
}

type OverpassFetchResult = OverpassFetchSuccess | OverpassFetchFailure;

/**
 * Tente UN miroir avec timeout — helper interne pour la course parallèle.
 */
async function tryOneMirror(
  mirror: string,
  query: string,
  timeoutMs: number,
): Promise<{ ok: true; data: OverpassResponse; mirror: string; ms: number } | { ok: false; mirror: string; reason: string; ms: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const response = await fetch(mirror, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Talk2MeBot/0.1 (+https://genius-web.fr/talktome)',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    if (!response.ok) {
      return { ok: false, mirror, reason: `http_${response.status}`, ms };
    }
    const data = (await response.json()) as OverpassResponse;
    return { ok: true, data, mirror, ms };
  } catch (e) {
    clearTimeout(timer);
    const ms = Date.now() - start;
    const err = e as { name?: string; message?: string };
    const reason = err.name === 'AbortError' ? `timeout_${timeoutMs}ms` : (err.message || 'fetch_error');
    return { ok: false, mirror, reason, ms };
  }
}

/**
 * Course parallèle : on lance les N miroirs en même temps, premier OK gagne,
 * on laisse les autres expirer/aborter naturellement (le fetch reste en cours
 * mais on s'en désintéresse). Worst case = OVERPASS_TIMEOUT_MS (5s) au lieu
 * de N×5s en séquentiel.
 *
 * Fuzz #349 séquentiel → 20s worst case (4×5s). Parallèle → 5s worst case.
 * Coût : on consomme un peu plus de bande mais Overpass est gratuit et nous
 * ne sommes pas rate-limité (User-Agent identifié, requêtes raisonnables).
 */
async function fetchOverpassWithRetry(query: string): Promise<OverpassFetchResult> {
  const failures: Array<{ mirror: string; reason: string; ms: number }> = [];
  const startAll = Date.now();

  // Promise.any : retourne le premier qui résout ok=true. Si tous rejettent
  // (ou ok=false), on tombe dans le catch.
  const promises = OVERPASS_MIRRORS.map((mirror) =>
    tryOneMirror(mirror, query, OVERPASS_TIMEOUT_MS).then((res) => {
      if (!res.ok) {
        failures.push({ mirror: res.mirror, reason: res.reason, ms: res.ms });
        console.warn(`[overpass] mirror=${res.mirror} reason=${res.reason} ms=${res.ms}`);
        throw new Error(res.reason);
      }
      return res;
    }),
  );

  try {
    const winner = await Promise.any(promises);
    const totalMs = Date.now() - startAll;
    console.log(
      `[overpass] OK mirror=${winner.mirror} ms=${winner.ms} total=${totalMs}ms elements=${winner.data?.elements?.length ?? 0}`,
    );
    return {
      ok: true,
      data: winner.data,
      mirror: winner.mirror,
      ms: winner.ms,
      attempts: failures.length + 1,
    };
  } catch {
    const totalMs = Date.now() - startAll;
    console.error(
      `[overpass] all_mirrors_failed total=${totalMs}ms failures=${JSON.stringify(failures)}`,
    );
    return {
      ok: false,
      reason: 'all_mirrors_failed',
      attempts: OVERPASS_MIRRORS.length,
      failures,
    };
  }
}

function parseElements(
  data: OverpassResponse,
  userLat: number,
  userLng: number,
  limit: number
): Place[] {
  const elements = data?.elements;
  if (!Array.isArray(elements)) return [];

  const places: Place[] = [];
  for (const elt of elements) {
    const lat = typeof elt.lat === 'number' ? elt.lat : NaN;
    const lng = typeof elt.lon === 'number' ? elt.lon : NaN;
    const tags = elt.tags ?? {};
    const name = tags.name;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) continue;

    const category = tags.amenity || tags.shop || tags.tourism || tags.leisure || 'place';
    const cuisine = tags.cuisine || null;
    const address = buildAddress(tags);
    const distance_m = Math.round(haversine(userLat, userLng, lat, lng));
    const maps_url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=18`;
    const google_maps_url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const directions_url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    const source_url = tags.website || tags['contact:website'] || tags['contact:url'] || maps_url;
    const website = tags.website || tags['contact:website'] || null;
    const phone = tags.phone || tags['contact:phone'] || null;
    const opening_hours_raw = tags.opening_hours || null;
    const open_status = parseOpenStatus(opening_hours_raw);
    const image_url = buildImageUrl(tags);

    places.push({
      name,
      category,
      cuisine,
      address,
      lat,
      lng,
      distance_m,
      maps_url,
      google_maps_url,
      directions_url,
      source_url,
      website,
      phone,
      opening_hours_raw,
      open_status,
      image_url,
    });
  }
  places.sort((a, b) => a.distance_m - b.distance_m);
  return places.slice(0, limit);
}

function getIntent(amenity: string | null, category: string): { intent_query: string; intent_label_fr: string } {
  if (amenity && INTENT_MAP[amenity]) {
    return { intent_query: INTENT_MAP[amenity].query, intent_label_fr: INTENT_MAP[amenity].label };
  }
  const fallback = CATEGORY_INTENT_MAP[category] || CATEGORY_INTENT_MAP.any;
  return { intent_query: fallback.query, intent_label_fr: fallback.label };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const params = request.nextUrl.searchParams;
    const latStr = params.get('lat');
    const lngStr = params.get('lng');
    const category = (params.get('category') || 'food').toLowerCase();
    const radiusStr = params.get('radius') || '1500';
    const limitStr = params.get('limit') || '6';
    const amenityRaw = params.get('amenity') || null;

    // Valider amenity contre whitelist
    let amenity: string | null = null;
    if (amenityRaw) {
      amenity = AMENITY_WHITELIST.includes(amenityRaw) ? amenityRaw : 'restaurant';
    }

    const lat = parseFloat(latStr ?? '');
    const lng = parseFloat(lngStr ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const intent = getIntent(amenity, category);
      return NextResponse.json({ places: [], ...intent, error: 'bad_query' }, { status: 400 });
    }

    let radius = parseInt(radiusStr, 10);
    if (!Number.isFinite(radius)) radius = 1500;
    radius = Math.max(100, Math.min(5000, radius));

    let limit = parseInt(limitStr, 10);
    if (!Number.isFinite(limit)) limit = 6;
    limit = Math.max(1, Math.min(20, limit));

    const cacheKey = `${lat.toFixed(4)}|${lng.toFixed(4)}|${category}|${radius}|${limit}|${amenity || ''}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      const intent = getIntent(amenity, category);
      return NextResponse.json({ places: cached.data, ...intent }, { status: 200 });
    }

    // Course parallèle de 5 miroirs Overpass (5s max par miroir). Premier qui
    // répond OK gagne. Si tous échouent → on bail FAST (~5s) vers la fallback
    // chain consciousness (validator Couche B → Booking pour hotel,
    // TheFork pour resto, etc.).
    //
    // Pas de retry avec rayon réduit : si tous les miroirs sont morts, ils
    // resteront morts pour la deuxième requête, on doublerait juste le délai
    // sans gain. La doctrine no-excuses dit : silence ou autre proposition.
    const query = buildOverpassQuery(category, lat, lng, radius, amenity || undefined);
    const t0 = Date.now();
    const result = await fetchOverpassWithRetry(query);

    if (!result.ok) {
      const elapsed = Date.now() - t0;
      console.error(
        `[search/place] all_mirrors_failed total=${elapsed}ms attempts=${result.attempts} failures=${JSON.stringify(result.failures)}`
      );
      const intent = getIntent(amenity, category);
      return NextResponse.json(
        { places: [], ...intent, error: 'upstream', overpass_failure: 'all_mirrors_failed' },
        { status: 200 }
      );
    }

    const places = parseElements(result.data, lat, lng, limit);
    const intent = getIntent(amenity, category);
    cache.set(cacheKey, { data: places, expiry: Date.now() + CACHE_TTL });
    // Métriques debug : mirror utilisé, temps, nb tentatives. Visibles dans
    // les headers HTTP pour observer en prod sans charger les logs PM2.
    const response = NextResponse.json({ places, ...intent }, { status: 200 });
    response.headers.set('x-overpass-mirror', result.mirror);
    response.headers.set('x-overpass-ms', String(result.ms));
    response.headers.set('x-overpass-attempts', String(result.attempts));
    return response;
  } catch (error) {
    console.error('[search/place]', error);
    return NextResponse.json({ places: [], intent_query: 'restaurant', intent_label_fr: 'restaurants' }, { status: 200 });
  }
}
