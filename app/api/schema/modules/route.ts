/**
 * Talk2Me — /api/schema/modules (Pascal 2026-08-14).
 * Sert le manifeste d'architecture (lib/schema/modules.ts) au client NATIF « Boussole »
 * (le web l'importe directement server-side ; le natif n'a pas accès au bundle → cette API).
 * Aucune PII : juste l'inventaire des modules + libellés + compteurs. Cache 5 min.
 */
import { NextResponse } from 'next/server';
import {
  MODULES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  countByCategory,
  countByStatus,
} from '@/lib/schema/modules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      total: MODULES.length,
      order: ['auth', 'social', 'chat', 'ia', 'tools', 'cards', 'call', 'feed', 'infra'],
      category_labels: CATEGORY_LABELS,
      status_labels: STATUS_LABELS,
      counts_by_category: countByCategory(),
      counts_by_status: countByStatus(),
      modules: MODULES,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}
