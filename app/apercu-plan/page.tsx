'use client';
/**
 * /apercu-plan — APERÇU du peintre web piloté par le PLAN serveur (Pascal 2026-07-22).
 * Récupère /api/posts?src=cards&plan=1 et peint chaque carte via PlanCard (le peintre unique).
 * Sert à COMPARER le rendu web (calé sur le plan) avec le natif, côte à côte, avant bascule du feed.
 */
import { useEffect, useState } from 'react';
import PlanCard from '@/components/feed/PlanCard';
import type { FeedCardPlan } from '@/lib/cards/plan/feed-plan';

export default function ApercuPlanPage() {
  const [plans, setPlans] = useState<FeedCardPlan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/posts?src=cards&plan=1&limit=30', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const items = Array.isArray(d.items) ? d.items : [];
        setPlans(items.map((it: { plan?: FeedCardPlan }) => it.plan).filter(Boolean));
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ minHeight: '100dvh', background: '#0b0b0d', padding: '16px 12px 60px' }}>
      <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 800, textAlign: 'center', marginBottom: 4 }}>Aperçu — peintre web piloté par le plan</h1>
      <p style={{ color: '#9AA3AF', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>Même plan que le natif · colonne-téléphone (ne se creuse pas sur PC)</p>
      {loading && <p style={{ color: '#9AA3AF', textAlign: 'center' }}>Chargement…</p>}
      {err && <p style={{ color: '#E5484D', textAlign: 'center' }}>{err}</p>}
      {!loading && plans.length === 0 && !err && <p style={{ color: '#9AA3AF', textAlign: 'center' }}>Aucune carte.</p>}
      {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
    </main>
  );
}
