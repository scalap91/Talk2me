import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateMessagePlaces } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/messages/[id]/places
 * Body : { places?: Place[] | null, requires_geoloc?: boolean }
 * Persiste l'enrichissement post-géoloc d'un message agent existant.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ ok: false, error: 'bad_id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'bad_body' }, { status: 400 });
    }

    const rawPlaces = (body as Record<string, unknown>).places;
    const rawGeoloc = (body as Record<string, unknown>).requires_geoloc;
    const rawIntentQuery = (body as Record<string, unknown>).intent_query;
    const rawIntentLabel = (body as Record<string, unknown>).intent_label_fr;
    const rawUserLat = (body as Record<string, unknown>).user_lat;
    const rawUserLng = (body as Record<string, unknown>).user_lng;

    const places = Array.isArray(rawPlaces) ? rawPlaces : null;
    const requiresGeoloc = rawGeoloc === true;
    const intentQuery = typeof rawIntentQuery === 'string' ? rawIntentQuery : null;
    const intentLabelFr = typeof rawIntentLabel === 'string' ? rawIntentLabel : null;
    const userLat = typeof rawUserLat === 'number' && Number.isFinite(rawUserLat) ? rawUserLat : null;
    const userLng = typeof rawUserLng === 'number' && Number.isFinite(rawUserLng) ? rawUserLng : null;

    const ok = updateMessagePlaces(
      id,
      places,
      requiresGeoloc,
      intentQuery,
      intentLabelFr,
      userLat,
      userLng
    );
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('[messages/places]', e);
    return NextResponse.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
