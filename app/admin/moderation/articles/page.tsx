'use client';

/**
 * Talk2Me — ADMIN : file de modération des PAGES-ENTITÉS signalées (M4).
 * Liste les articles canoniques signalés (moteur lib/cards/engine/ratings.ts),
 * avec extrait + compteurs. Deux actions : Blanchir (dismiss) ou Supprimer l'article.
 * Gate super-admin hérité de app/admin/layout.tsx (requireDomain(null)).
 * PII : aucune info user affichée — uniquement entités + compteurs.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trash2, ShieldCheck, Loader2, Flag } from '@/lib/icons';

interface Item {
  entityRef: string;
  reports: number;
  fiable: number;
  douteux: number;
  score: number;
  snippet: string;
  lang: string;
}

export default function AdminModerationArticlesPage({ onBack }: { onBack?: () => void } = {}) {
  const router = useRouter();
  const back = () => (onBack ? onBack() : router.push('/home'));
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const toast = useCallback((t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 2200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/moderation/articles', { cache: 'no-store' });
      if (r.status === 403 || r.status === 401) {
        setForbidden(true);
        return;
      }
      const d = await r.json();
      setItems(Array.isArray(d?.items) ? d.items : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (entityRef: string, action: 'dismiss' | 'delete') => {
    if (busy) return;
    if (action === 'delete' && !window.confirm("Supprimer l'article canonique de « " + entityRef + " » ?\nLa page retombera sur son contenu d'origine.")) return;
    setBusy(entityRef);
    try {
      const r = await fetch('/api/admin/moderation/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityRef, action }),
      }).then((x) => x.json());
      if (r?.ok) {
        setItems((prev) => prev.filter((i) => i.entityRef !== entityRef));
        toast(action === 'delete' ? 'Article supprimé' : 'Blanchi');
      } else {
        toast('Échec');
      }
    } catch {
      toast('Échec');
    } finally {
      setBusy('');
    }
  };

  const badge = (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: bg,
    color,
    fontSize: 12.5,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  });

  const btn = (border: string, color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: '#fff',
    border: '1px solid ' + border,
    color,
    fontSize: 13.5,
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 10,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.6 : 1,
  });

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '28px 18px 80px',
        fontFamily: 'system-ui,sans-serif',
        color: 'var(--t2m-ink,#2F343A)',
      }}
    >
      <button
        type="button"
        onClick={back}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          color: 'var(--t2m-ink-2,#6A7585)',
          fontSize: 14,
          cursor: 'pointer',
          padding: 0,
          marginBottom: 14,
        }}
      >
        <ChevronLeft size={18} /> Retour
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Modération — articles signalés</h1>
      <p style={{ color: 'var(--t2m-ink-2,#6A7585)', fontSize: 14, marginTop: 6 }}>
        Pages-entités signalées par les utilisateurs. Blanchir clôt les signalements ; supprimer efface l'article canonique.
      </p>

      {forbidden ? (
        <div style={{ marginTop: 30, color: 'var(--t2m-ink-2,#6A7585)', fontSize: 15 }}>Accès réservé aux administrateurs.</div>
      ) : loading ? (
        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'center', color: 'var(--t2m-ink-3,#9DAAB7)' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            marginTop: 30,
            background: '#fff',
            border: '1px solid var(--t2m-line,#E7EAF0)',
            borderRadius: 14,
            padding: '28px 20px',
            textAlign: 'center',
            color: 'var(--t2m-ink-2,#6A7585)',
            fontSize: 15,
          }}
        >
          Aucun article signalé.
        </div>
      ) : (
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((it) => (
            <div
              key={it.entityRef}
              style={{
                background: '#fff',
                border: '1px solid var(--t2m-line,#E7EAF0)',
                borderRadius: 14,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, wordBreak: 'break-word' }}>{it.entityRef}</div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <span style={badge('#FEF2F2', '#DC2626')}>
                  <Flag size={13} /> {it.reports} signalement{it.reports > 1 ? 's' : ''}
                </span>
                <span style={badge('var(--t2m-wash,#F5F6F8)', 'var(--t2m-ink-2,#6A7585)')}>👎 {it.douteux} douteux</span>
                <span style={badge('var(--t2m-wash,#F5F6F8)', 'var(--t2m-ink-2,#6A7585)')}>score {Math.round(it.score * 100)}%</span>
                {it.lang && <span style={badge('var(--t2m-wash,#F5F6F8)', 'var(--t2m-ink-3,#9DAAB7)')}>{it.lang}</span>}
              </div>

              <p
                style={{
                  marginTop: 12,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: 'var(--t2m-ink-2,#6A7585)',
                  fontStyle: it.snippet.startsWith('(') ? 'italic' : 'normal',
                }}
              >
                {it.snippet}
              </p>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="button" disabled={!!busy} onClick={() => act(it.entityRef, 'dismiss')} style={btn('var(--t2m-line,#E7EAF0)', 'var(--t2m-ink,#2F343A)')}>
                  <ShieldCheck size={15} /> Blanchir
                </button>
                <button type="button" disabled={!!busy} onClick={() => act(it.entityRef, 'delete')} style={btn('#FCA5A5', '#DC2626')}>
                  {busy === it.entityRef ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Supprimer l'article
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--t2m-ink,#2F343A)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {msg}
        </div>
      )}
    </main>
  );
}
