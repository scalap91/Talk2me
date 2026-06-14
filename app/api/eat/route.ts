import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getRestaurants } from '@/lib/annonces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — liste des restaurants (boutiques kind='eat') pour l'onglet Eat.
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, restaurants: getRestaurants() });
}
