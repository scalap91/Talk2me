'use client';

/**
 * Talk2Me #408b — Courbe trend Léa 30j (Pascal 2026-06-05).
 *
 * Affiche 3 séries sur dual y-axis :
 *   - Score Léa (gauche, 0-10, rose)
 *   - Missions / jour (droite, bleu)
 *   - Coût USD / jour (droite, jaune)
 *
 * Data passée en prop (server component parent), pas de fetch ici.
 * Limité à 30 points → toujours léger.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface Point {
  date: string;
  avg_score: number | null;
  missions_count: number;
  missions_failed: number;
  total_cost_usd: number;
}

interface Props {
  data: Point[];
}

export default function LeaTrendChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-center text-[12.5px] text-white/45">
        <div>
          Pas encore de données pour Léa.
          <br />
          <span className="text-[11px] text-white/35">
            La courbe sera tracée à partir de la première agrégation
            <br />
            (24h après le démarrage du daemon ai-ops-daemon).
          </span>
        </div>
      </div>
    );
  }

  const chartData = data.map((p) => ({
    date: p.date.slice(5), // MM-DD
    score: p.avg_score === null ? null : Number(p.avg_score.toFixed(2)),
    missions: p.missions_count,
    cost: Number(p.total_cost_usd.toFixed(4)),
  }));

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 12, right: 24, bottom: 8, left: -8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.55)' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <YAxis
            yAxisId="score"
            domain={[0, 10]}
            tick={{ fontSize: 10, fill: '#ec4899' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            label={{
              value: 'Score',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 10, fill: '#ec4899' },
            }}
          />
          <YAxis
            yAxisId="ops"
            orientation="right"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.55)' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <Tooltip
            contentStyle={{
              background: '#1a1a22',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              fontSize: 12,
              color: '#e5e5e5',
            }}
            labelStyle={{ color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}
            iconType="circle"
          />
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="score"
            name="Score Léa"
            stroke="#ec4899"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#ec4899' }}
            activeDot={{ r: 5 }}
            connectNulls
          />
          <Line
            yAxisId="ops"
            type="monotone"
            dataKey="missions"
            name="Missions / jour"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="ops"
            type="monotone"
            dataKey="cost"
            name="Coût USD / jour"
            stroke="#facc15"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
