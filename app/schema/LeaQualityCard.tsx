'use client';

/**
 * Talk2Me #408b — Card "Qualité Léa aujourd'hui" + sparkline 7j.
 *
 * Affichée en tête de /schema. Lit /api/schema/lea-trend?days=7 et affiche :
 *   - Score d'aujourd'hui (gros)
 *   - Delta vs hier (↗/↘)
 *   - Sparkline 7j (recharts LineChart minimal)
 *   - Lien vers /schema/ai-ops pour le dashboard complet
 *
 * Verbatim Pascal : "JE DOIT VOIR CHAQUE JOUR LIA SAMELIORER AVEC CE MODULE".
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';

interface Point {
  date: string;
  avg_score: number | null;
  missions_count: number;
}

interface ApiResponse {
  trend: Point[];
  today: { avg: number | null; missions: number };
  yesterday: { avg: number | null; missions: number };
}

export default function LeaQualityCard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch('/api/schema/lea-trend?days=7')
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        if (!cancel) setData(d);
      })
      .catch((e: Error) => {
        if (!cancel) setErr(e.message);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (err) {
    return (
      <Wrapper>
        <div className="text-[12px] text-red-300/80">Erreur chargement : {err}</div>
      </Wrapper>
    );
  }

  if (!data) {
    return (
      <Wrapper>
        <div className="text-[12px] text-white/45 animate-pulse">
          Chargement progression Léa…
        </div>
      </Wrapper>
    );
  }

  const today = data.today.avg;
  const yesterday = data.yesterday.avg;
  const delta =
    today !== null && yesterday !== null ? today - yesterday : null;
  const trendForChart = data.trend.map((p) => ({
    date: p.date.slice(5),
    score: p.avg_score === null ? 0 : Number(p.avg_score.toFixed(2)),
    has: p.avg_score !== null,
  }));
  const hasAnyData = trendForChart.some((p) => p.has);

  return (
    <Wrapper>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-white/45 mb-1">
            Qualité Léa · aujourd&apos;hui
          </div>
          <div className="flex items-baseline gap-3">
            <span
              className="text-[40px] leading-none font-medium"
              style={{ color: scoreColor(today) }}
            >
              {today !== null ? today.toFixed(1) : '—'}
            </span>
            <span className="text-[14px] text-white/45">/ 10</span>
            {delta !== null && Math.abs(delta) >= 0.05 && (
              <span
                className={
                  'text-[13px] font-medium ' +
                  (delta > 0 ? 'text-emerald-300' : 'text-red-300')
                }
              >
                {delta > 0 ? '↗' : '↘'} {delta > 0 ? '+' : ''}
                {delta.toFixed(2)}
              </span>
            )}
          </div>
          <div className="text-[11px] text-white/45 mt-1.5">
            {data.today.missions} mission{data.today.missions > 1 ? 's' : ''} aujourd&apos;hui ·{' '}
            {data.yesterday.missions} hier
          </div>
        </div>
        <Link
          href="/schema/ai-ops"
          className="text-[12px] text-pink-300 hover:text-pink-200 whitespace-nowrap"
        >
          Voir AI Ops →
        </Link>
      </div>

      <div className="h-20 -mx-1">
        {hasAnyData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendForChart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <YAxis hide domain={[0, 10]} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a22',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelStyle={{ color: '#aaa' }}
                formatter={(v: number) => [v.toFixed(2), 'Score']}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#ec4899"
                strokeWidth={2}
                dot={{ r: 2.5, fill: '#ec4899' }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[11px] text-white/35">
            Pas encore de données. Léa sera notée après les premières missions du daemon.
          </div>
        )}
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-pink-500/[0.05] to-transparent p-5">
      {children}
    </section>
  );
}

function scoreColor(s: number | null): string {
  if (s === null) return 'rgba(255,255,255,0.55)';
  if (s >= 8) return '#34d399';
  if (s >= 6) return '#fde047';
  if (s >= 4) return '#fb923c';
  return '#f87171';
}
