/**
 * Talk2Me — API admin : magasin de clés (kill switch) + sites externes appelés.
 * GET  → état de chaque clé (masquée) + liste des sites/APIs appelés + usage.
 * POST → { provider, action: 'toggle'|'set'|'delete', value?, enabled? }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getDb } from '@/lib/db';
import { listApiKeyStatus, setApiKey, deleteApiKeyOverride } from '@/lib/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function guard(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!isAiOpsAdmin(user.id, (user as { email?: string }).email))
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const g = guard(req);
  if (g.error) return g.error;
  const db = getDb();
  const keys = listApiKeyStatus(db);

  // Usage des outils (depuis messages) = combien de fois chaque service est appelé.
  const cnt = (sql: string): number => {
    try {
      return (db.prepare(sql).get() as { c?: number })?.c ?? 0;
    } catch {
      return 0;
    }
  };
  const u = {
    web_search: cnt('SELECT COUNT(*) c FROM messages WHERE web_search IS NOT NULL'),
    products: cnt('SELECT COUNT(*) c FROM messages WHERE products IS NOT NULL'),
    places: cnt('SELECT COUNT(*) c FROM messages WHERE places IS NOT NULL'),
    youtube: cnt('SELECT COUNT(*) c FROM messages WHERE youtube IS NOT NULL'),
    weather: cnt('SELECT COUNT(*) c FROM messages WHERE weather IS NOT NULL'),
    wikipedia: cnt('SELECT COUNT(*) c FROM messages WHERE wikipedia IS NOT NULL'),
    recipe: cnt('SELECT COUNT(*) c FROM messages WHERE recipe IS NOT NULL'),
  };

  // Tous les sites/APIs externes réellement appelés par le serveur.
  const services = [
    { name: 'DeepSeek API', host: 'api.deepseek.com', role: 'IA L2 (réponses)', provider: 'deepseek', needs_key: true, calls: cnt("SELECT COUNT(*) c FROM messages WHERE role='agent'") },
    { name: 'Brave Search', host: 'api.search.brave.com', role: 'Recherche web', provider: 'brave', needs_key: true, calls: u.web_search },
    { name: 'Bing (scrape)', host: 'www.bing.com', role: 'Recherche web (fallback)', provider: null, needs_key: false, calls: null },
    { name: 'DuckDuckGo', host: 'duckduckgo.com', role: 'Recherche web (fallback)', provider: null, needs_key: false, calls: null },
    { name: 'YouTube Data API', host: 'www.googleapis.com', role: 'Vidéos', provider: 'youtube', needs_key: true, calls: u.youtube },
    { name: 'AliExpress', host: 'aliexpress.com', role: 'Produits', provider: null, needs_key: false, calls: u.products },
    { name: 'OpenStreetMap (Nominatim/Overpass)', host: 'nominatim.openstreetmap.org', role: 'Lieux', provider: null, needs_key: false, calls: u.places },
    { name: 'Open-Meteo', host: 'api.open-meteo.com', role: 'Météo', provider: null, needs_key: false, calls: u.weather },
    { name: 'Wikipedia', host: 'wikipedia.org', role: 'Encyclopédie', provider: null, needs_key: false, calls: u.wikipedia },
    { name: 'Brevo', host: 'api.brevo.com', role: 'Emails (liens magiques)', provider: 'brevo', needs_key: true, calls: null },
    { name: 'Unsplash', host: 'api.unsplash.com', role: 'Images', provider: 'unsplash', needs_key: true, calls: null },
    { name: 'fetch_url_content', host: '(toute URL)', role: 'Lire une page web', provider: null, needs_key: false, calls: null },
  ];

  return NextResponse.json({ ok: true, keys, services });
}

export async function POST(req: NextRequest) {
  const g = guard(req);
  if (g.error) return g.error;
  const body = (await req.json().catch(() => ({}))) as {
    provider?: string;
    action?: string;
    value?: string;
    enabled?: boolean;
  };
  const provider = typeof body.provider === 'string' ? body.provider : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!provider) return NextResponse.json({ error: 'provider_required' }, { status: 400 });
  const db = getDb();
  try {
    if (action === 'delete') {
      deleteApiKeyOverride(db, provider);
    } else if (action === 'toggle') {
      setApiKey(db, provider, { enabled: !!body.enabled });
    } else if (action === 'set') {
      setApiKey(db, provider, { value: typeof body.value === 'string' ? body.value : '', enabled: true });
    } else {
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, keys: listApiKeyStatus(db) });
}
