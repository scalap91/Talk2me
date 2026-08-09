'use client';

/**
 * Talk2Me — MES COMMANDES (Pascal 2026-08-06, Étape 6).
 * Chaque commande = SA `.card`, rendue par le MOTEUR DE RENDU UNIQUE (SuperCardView) — le même
 * qui sert le feed. Ici : variant='card' + reveal=['media'] → identité de l'objet acheté (image+titre),
 * SANS prix-card / actions « Acheter » / barre sociale (on n'aime/partage pas une commande).
 * La couche COMMANDE (statut escrow, montant PAYÉ, type, date, litige) est posée AUTOUR par cette page.
 * Le nominatif reste privé (c'est MON escrow). Pas de menu marché, pas de chat vendeur.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Clock } from '@/lib/icons';
import { formatMoney } from '@/lib/money';
import SuperCardView from '@/components/cards/SuperCardView';
import type { SuperCard } from '@/lib/cards/supercard';

interface Order { id: string; card_id: string | null; order_type: string | null; amount_cents: number; status: string; currency: string; created_at: number; card: SuperCard | null; litige?: { status: 'open' | 'instructed' | 'decided'; refund_type: string | null } | null }

// État LISIBLE du litige d'une commande (ce que l'acheteur voit).
function litigeLabel(l: NonNullable<Order['litige']>): { text: string; fg: string } {
  if (l.status === 'open') return { text: '⚖️ Problème signalé — un chef de secteur va l’instruire.', fg: '#b45309' };
  if (l.status === 'instructed') return { text: '⚖️ En cours d’examen — un validateur va trancher.', fg: '#b45309' };
  if (l.refund_type === 'full') return { text: '⚖️ Tranché : remboursé ✅', fg: '#0e7c54' };
  if (l.refund_type === 'none') return { text: '⚖️ Tranché : en faveur du vendeur.', fg: '#6a7585' };
  return { text: '⚖️ Tranché.', fg: '#6a7585' };
}

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  locked: { label: 'Protégé · en cours', bg: 'rgba(245,158,11,.14)', fg: '#b45309' },
  released: { label: 'Terminé', bg: 'rgba(16,159,110,.14)', fg: '#0e7c54' },
  refunded: { label: 'Remboursé', bg: 'rgba(107,117,133,.14)', fg: '#6a7585' },
};
const TYPE_LABEL: Record<string, string> = { boutique: 'Boutique', plat: 'Plat', eat: 'Resto', annonce: 'Annonce', service: 'Service', rental: 'Location', immobilier: 'Séjour', boost: 'Boost' };

function fmtDate(ts: number): string {
  try { return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; }
}

export default function MesCommandesPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // « Signaler un problème » → ouvre un LITIGE (Étape 3a). Pas de chat vendeur : un chef de secteur instruit.
  const [litigeFor, setLitigeFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    return fetch('/api/orders', { cache: 'no-store' })
      .then((r) => { if (r.status === 401) { router.replace('/signin'); return null; } return r.json(); })
      .then((j) => { if (j?.orders) setOrders(j.orders as Order[]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);
  useEffect(() => { load(); }, [load]);

  const submitLitige = async (orderId: string) => {
    if (!reason.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/orders/${orderId}/litige`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) { setLitigeFor(null); setReason(''); await load(); } // recharge → le vrai statut du litige remonte
    } catch { /* silencieux */ } finally { setSending(false); }
  };

  return (
    <main style={{ minHeight: '100svh', background: 'var(--t2m-paper)', color: 'var(--t2m-ink)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8, height: 56, padding: '0 12px', borderBottom: '1px solid var(--t2m-line)', background: 'var(--t2m-paper)' }}>
        <button onClick={() => router.push('/profile')} aria-label="Retour" style={{ padding: 4, color: 'var(--t2m-ink-2)', background: 'none', border: 'none', cursor: 'pointer' }}><ChevronLeft className="w-6 h-6" /></button>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>Mes commandes</h1>
      </header>

      <div style={{ flex: 1, maxWidth: 560, width: '100%', margin: '0 auto', padding: '12px 12px 90px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--t2m-ink-3)', fontSize: 13, padding: '48px 0' }}>Chargement…</p>
        ) : orders.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '64px 0', gap: 12, color: 'var(--t2m-ink-3)' }}>
            <Clock className="w-10 h-10" />
            <p style={{ fontSize: 14, color: 'var(--t2m-ink-2)' }}>Aucune commande pour l&apos;instant.</p>
            <p style={{ fontSize: 12 }}>Tes achats protégés apparaîtront ici.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {orders.map((o) => {
              const st = STATUS[o.status] || { label: o.status, bg: 'rgba(107,117,133,.14)', fg: '#6a7585' };
              const typeLabel = TYPE_LABEL[o.order_type || ''] || o.order_type || '';
              const fallbackTitle = TYPE_LABEL[o.order_type || ''] || 'Commande';
              return (
                <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderRadius: 18, background: 'var(--t2m-paper)', border: '1px solid var(--t2m-line)' }}>
                  {/* CORPS = la .card via le LECTEUR UNIQUE. Fallback si dotcard absent (ex. panier multi-articles). */}
                  {o.card ? (
                    <SuperCardView card={o.card} variant="card" theme="light" hideMeta reveal={['media']} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 12, flex: '0 0 auto', background: 'linear-gradient(135deg,#ffd9a8,#ff9a3d)' }} />
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{fallbackTitle}</span>
                    </div>
                  )}

                  {/* COUCHE COMMANDE : statut escrow + montant PAYÉ + type + date. La money vit ICI, pas dans la card. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.fg }}>{st.label}</span>
                    {typeLabel && <span style={{ fontSize: 11, color: 'var(--t2m-ink-3)' }}>{typeLabel}</span>}
                    <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 'auto' }}>{formatMoney(o.amount_cents, o.currency)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t2m-ink-3)', marginTop: -4 }}>{fmtDate(o.created_at)}</div>

                  {/* SIGNALER UN PROBLÈME → LITIGE (chef de secteur). Pas de chat vendeur libre — Étape 3a.
                      Si un litige existe déjà : on montre son ÉTAT RÉEL (en cours → tranché → remboursé), pas de doublon. */}
                  {o.litige ? (
                    (() => { const ll = litigeLabel(o.litige!); return <div style={{ fontSize: 12, color: ll.fg, fontWeight: 600 }}>{ll.text}</div>; })()
                  ) : litigeFor === o.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={600} placeholder="Décris le problème (non reçu, abîmé, pas conforme…)" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--t2m-line)', padding: '8px 10px', fontSize: 13, resize: 'none', outline: 'none', boxSizing: 'border-box', background: 'var(--t2m-wash)', color: 'var(--t2m-ink)' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => submitLitige(o.id)} disabled={sending || !reason.trim()} style={{ padding: '7px 12px', borderRadius: 999, border: 'none', background: '#E24C4C', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: sending || !reason.trim() ? 0.5 : 1 }}>{sending ? '…' : 'Envoyer au chef de secteur'}</button>
                        <button type="button" onClick={() => { setLitigeFor(null); setReason(''); }} style={{ padding: '7px 12px', borderRadius: 999, border: '1px solid var(--t2m-line)', background: 'var(--t2m-wash)', color: 'var(--t2m-ink-2)', fontSize: 12.5, cursor: 'pointer' }}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setLitigeFor(o.id); setReason(''); }} style={{ alignSelf: 'flex-start', fontSize: 12, color: '#b45309', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>⚠️ Signaler un problème</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
