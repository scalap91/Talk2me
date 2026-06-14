import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cjConfigured, cjFreight } from '@/lib/cj-dropshipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/dropship/freight?vid=<variantId>&country=<ISO2> — délais d'acheminement.
export async function GET(req: NextRequest) {
  if (!cjConfigured()) return NextResponse.json({ ok: true, shipping: [] });
  const vid = req.nextUrl.searchParams.get('vid') || '';
  const country = (req.nextUrl.searchParams.get('country') || 'FR').toUpperCase().slice(0, 2);
  if (!vid) return NextResponse.json({ ok: true, shipping: [] });
  const shipping = await cjFreight(vid, country, 1);
  return NextResponse.json({ ok: true, country, shipping });
}
