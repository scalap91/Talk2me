'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface MetricsData {
  ok: boolean
  generated_at: string
  usage: {
    users_total: number
    users_new_24h: number
    users_new_7j: number
    users_actifs_7j: number
    posts_total: number
    cards_total: number
  }
  commerce: {
    boutiques_total: number
    boutiques_new_7j: number
    produits_total: number
    boutiques_avec_produits: number
    top_boutiques: { name: string; slug: string; produits: number }[]
  }
  engagement: {
    vues_total: number
    likes_total: number
    partages_total: number
    commentaires_total: number
    saves_total: number
    par_jour: { jour: string; n: number }[]
  }
  ia: {
    conversations: number
    messages_total: number
    messages_lea: number
    outils: {
      recherche_web: number
      produits: number
      lieux: number
      recettes: number
      youtube: number
      meteo: number
      wikipedia: number
    }
  }
  wallet: {
    transactions: number
    credits_cents: number
    debits_cents: number
  }
  geo?: { country: string; count: number }[]
}

export default function AdminMetricsPage() {
  const [data, setData] = useState<MetricsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMetrics = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/metrics', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        setError('Accès réservé admin')
        setLoading(false)
        return
      }
      if (!res.ok) {
        setError('Erreur lors du chargement des métriques')
        setLoading(false)
        return
      }
      const json: MetricsData = await res.json()
      if (!json.ok) {
        setError('Erreur API')
        setLoading(false)
        return
      }
      setData(json)
    } catch {
      setError('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [])

  const formatNumber = (n: number) => n.toLocaleString('fr-FR')

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `généré à ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const StatCard = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[26px] font-bold text-white">{formatNumber(value)}</div>
      <div className="text-[12px] text-white/50 mt-1">{label}</div>
    </div>
  )

  const maxParJour = data?.engagement.par_jour.length
    ? Math.max(...data.engagement.par_jour.map((p) => p.n), 1)
    : 1

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] text-white p-6">
        <div className="text-white/50">Chargement...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] text-white p-6">
        <div className="text-red-400">{error}</div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="min-h-screen bg-[#0a0a0d] text-white p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-white/40 mt-1">{formatDate(data.generated_at)}</p>
        </div>
        <button
          onClick={fetchMetrics}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
        >
          Rafraîchir
        </button>
      </div>

      {/* 1) Usage / Croissance */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Usage / Croissance</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Utilisateurs" value={data.usage.users_total} />
          <StatCard label="Nouveaux 24h" value={data.usage.users_new_24h} />
          <StatCard label="Nouveaux 7j" value={data.usage.users_new_7j} />
          <StatCard label="Actifs 7j" value={data.usage.users_actifs_7j} />
          <StatCard label="Posts" value={data.usage.posts_total} />
          <StatCard label="Cards" value={data.usage.cards_total} />
        </div>

        {/* Inscrits — où ? (anonyme : pays seulement, jamais l'IP) */}
        {data.geo && data.geo.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[13px] font-semibold text-white/55 uppercase tracking-wide mb-2">
              Inscrits — où ? <span className="text-white/30 normal-case">(anonyme, par pays)</span>
            </h3>
            <div className="space-y-1.5">
              {data.geo.map((g) => {
                const max = Math.max(...data.geo!.map((x) => x.count), 1)
                return (
                  <div key={g.country} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-[13px] text-white/80 truncate">{g.country}</span>
                    <div className="flex-1 h-3 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-500"
                        style={{ width: `${Math.round((g.count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-[13px] font-semibold text-white">
                      {g.count.toLocaleString('fr-FR')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* 2) Commerce / Boutiques */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Commerce / Boutiques</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Boutiques" value={data.commerce.boutiques_total} />
          <StatCard label="Nouvelles 7j" value={data.commerce.boutiques_new_7j} />
          <StatCard label="Produits" value={data.commerce.produits_total} />
          <StatCard label="Boutiques avec produits" value={data.commerce.boutiques_avec_produits} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-medium text-white/60 mb-3">Top boutiques</h3>
          <div className="space-y-2">
            {data.commerce.top_boutiques.map((b) => (
              <Link
                key={b.slug}
                href={`/boutique/${b.slug}`}
                className="flex items-center justify-between text-sm hover:text-red-400 transition-colors"
              >
                <span>{b.name}</span>
                <span className="text-white/50">{b.produits} produits</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 3) Engagement */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Engagement</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard label="Vues" value={data.engagement.vues_total} />
          <StatCard label="Likes" value={data.engagement.likes_total} />
          <StatCard label="Partages" value={data.engagement.partages_total} />
          <StatCard label="Commentaires" value={data.engagement.commentaires_total} />
          <StatCard label="Enregistrements" value={data.engagement.saves_total} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-medium text-white/60 mb-4">Publications par jour</h3>
          <div className="flex items-end gap-2 h-32">
            {data.engagement.par_jour.map((p) => (
              <div key={p.jour} className="flex flex-col items-center flex-1">
                <div
                  className="w-full bg-red-500/70 rounded-t-md"
                  style={{ height: `${(p.n / maxParJour) * 100}%`, minHeight: p.n > 0 ? '4px' : '0' }}
                />
                <span className="text-[10px] text-white/40 mt-1 truncate w-full text-center">
                  {p.jour}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4) L2 (IA) */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white/80 mb-4">L2 (IA)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Conversations" value={data.ia.conversations} />
          <StatCard label="Messages total" value={data.ia.messages_total} />
          <StatCard label="Messages L2" value={data.ia.messages_lea} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-medium text-white/60 mb-3">Outils les plus utilisés</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {Object.entries(data.ia.outils).map(([key, val]) => (
              <div key={key} className="text-center">
                <div className="text-lg font-bold text-white">{formatNumber(val)}</div>
                <div className="text-[11px] text-white/50 capitalize">
                  {key.replace(/_/g, ' ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5) Wallet */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Wallet</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Transactions" value={data.wallet.transactions} />
          <StatCard label="Crédits" value={data.wallet.credits_cents / 100} />
          <StatCard label="Débits" value={Math.abs(data.wallet.debits_cents) / 100} />
        </div>
      </section>
    </div>
  )
}
