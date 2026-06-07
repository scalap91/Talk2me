/**
 * Talk2Me #408b — /api/schema/lea-trend (Pascal 2026-06-05).
 *
 * Renvoie la série temporelle agrégée de la qualité Léa sur N jours +
 * snapshots aujourd'hui / hier (fenêtres glissantes 24h).
 *
 * PUBLIC : utilisé par la card "Qualité Léa" en tête de /schema, qui est
 * elle-même publique (boussole). Aucune PII, juste des moyennes de scores
 * d'agents. Cache HTTP 60s (cf. directive Pascal "Cache 60s").
 *
 * Verbatim Pascal : "JE DOIT VOIR CHAQUE JOUR LIA SAMELIORER AVEC CE MODULE".
 */

import { NextResponse } from 'next/server';
import {
  getLeaDailyTrend,
  getLeaAvgScoreSince,
} from '@/lib/ai-ops/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 60;

const dayMs = 24 * 60 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const daysRaw = Number(url.searchParams.get('days') || '30');
    const days = Math.max(1, Math.min(90, isNaN(daysRaw) ? 30 : daysRaw));

    const trend = getLeaDailyTrend(days);
    const today = getLeaAvgScoreSince(Date.now() - dayMs);
    const yesterday = (() => {
      // Fenêtre 24h..48h
      // Pas de helper dédié, on filtre dans la trend si la date d'hier existe.
      const yKey = new Date(Date.now() - dayMs).toISOString().slice(0, 10);
      const row = trend.find((t) => t.date === yKey);
      return {
        avg: row?.avg_score ?? null,
        missions: row?.missions_count ?? 0,
      };
    })();

    return NextResponse.json(
      { trend, today, yesterday },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, trend: [], today: null, yesterday: null },
      { status: 500 },
    );
  }
}
