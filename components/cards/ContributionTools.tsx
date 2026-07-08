'use client';

/**
 * Talk2Me — OUTILS DE CONTRIBUTION à une card (page-entité vivante, Pascal 2026-07-08).
 * Îlot client greffé dans la page publique SSR /card/[id]. Rend visible LE GESTE
 * « j'enrichis un post » : je partage ce que JE sais en plus, Léa remet la forme
 * propre (jamais les faits), je valide, mon nom reste attaché.
 *
 * Thème CLAIR (tokens --t2m-*). PII : n'affiche que display_name/username/avatar.
 */
import { useEffect, useState } from 'react';
import GetAppSheet from '@/components/public/GetAppSheet';

interface Contributor {
  user_id: string;
  role: 'creator' | 'sharer' | 'editor';
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}
interface Enrichment {
  id: string;
  user_id: string;
  text: string;
  created_at: number;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}
interface Me { id: string; username?: string | null; display_name?: string | null }

const ROLE_LABEL: Record<Contributor['role'], string> = {
  creator: 'Créateur',
  editor: 'Éditeur',
  sharer: 'Partage',
};

function nameOf(u: { display_name: string | null; username: string | null }): string {
  return (u.display_name || u.username || 'Anonyme').trim();
}
function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

export default function ContributionTools({ cardId }: { cardId: string }) {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [enrichments, setEnrichments] = useState<Enrichment[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Flux d'enrichissement
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [lea, setLea] = useState<string | null>(null);
  const [reformulating, setReformulating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Module « REJOINDRE » : le visiteur non connecté ne va plus vers /signin, il
  // ouvre la GetAppSheet (QR / stores / SMS) pour choper l'app puis enrichir.
  const [getApp, setGetApp] = useState(false);

  async function loadContributions() {
    try {
      const r = await fetch(`/api/cards/${cardId}/contributions`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setContributors(j.contributors || []);
        setEnrichments(j.enrichments || []);
      }
    } catch {
      /* silencieux — doctrine no-excuses */
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadContributions();
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (alive && r.ok) {
          const j = await r.json();
          setMe(j.user || null);
        }
      } catch {
        /* non connecté */
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function onReformulate() {
    const text = draft.trim();
    if (!text || reformulating) return;
    setReformulating(true);
    try {
      const r = await fetch(`/api/cards/${cardId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reformulate', text }),
      });
      if (r.ok) {
        const j = await r.json();
        setLea(String(j.reformulated || '').trim() || text);
      }
    } catch {
      /* silencieux */
    } finally {
      setReformulating(false);
    }
  }

  async function onSave() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/cards/${cardId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', text }),
      });
      if (r.ok) {
        setDraft('');
        setLea(null);
        setOpen(false);
        await loadContributions();
        showToast('Merci — ton enrichissement est en ligne ✨');
      }
    } catch {
      /* silencieux */
    } finally {
      setSaving(false);
    }
  }

  const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '8px 18px 8px' };

  return (
    <section style={wrap}>
      <div
        style={{
          background: 'var(--t2m-paper)',
          border: '1px solid var(--t2m-line)',
          borderRadius: 18,
          padding: '18px 18px 20px',
        }}
      >
        <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: 'var(--t2m-ink)' }}>
          Contributeurs
        </h2>
        <p style={{ fontSize: 13, color: 'var(--t2m-ink-3)', margin: '0 0 14px' }}>
          Cette page vit grâce à ceux qui la connaissent.
        </p>

        {/* Contributeurs */}
        {loading ? (
          <p style={{ fontSize: 14, color: 'var(--t2m-ink-3)', margin: 0 }}>Chargement…</p>
        ) : contributors.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--t2m-ink-3)', margin: 0 }}>Sois le premier à enrichir ce post.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {contributors.map((c) => {
              const name = nameOf(c);
              return (
                <li
                  key={c.user_id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--t2m-wash)',
                    border: '1px solid var(--t2m-line)',
                    borderRadius: 999,
                    padding: '5px 12px 5px 5px',
                  }}
                >
                  {c.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'var(--t2m-primary)',
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {initials(name)}
                    </span>
                  )}
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--t2m-ink)' }}>{name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: c.role === 'creator' ? 'var(--t2m-primary-deep)' : 'var(--t2m-ink-2)',
                    }}
                  >
                    {ROLE_LABEL[c.role]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {/* Enrichissements */}
        {enrichments.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 800, margin: '0 0 10px', color: 'var(--t2m-ink)' }}>
              Ce que la communauté ajoute
            </h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {enrichments.map((e) => (
                <li
                  key={e.id}
                  style={{
                    background: 'var(--t2m-wash)',
                    border: '1px solid var(--t2m-line)',
                    borderRadius: 14,
                    padding: '12px 14px',
                  }}
                >
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--t2m-ink)', margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{e.text}</p>
                  <span style={{ fontSize: 12.5, color: 'var(--t2m-ink-3)', fontWeight: 600 }}>— {nameOf(e)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action / auth gate */}
        <div style={{ marginTop: 20 }}>
          {loading ? null : !me ? (
            <button
              type="button"
              onClick={() => setGetApp(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 20px',
                borderRadius: 12,
                border: '1px solid var(--t2m-line)',
                background: 'var(--t2m-paper)',
                color: 'var(--t2m-ink)',
                fontWeight: 700,
                fontSize: 14.5,
                cursor: 'pointer',
              }}
            >
              Rejoindre pour enrichir
            </button>
          ) : !open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 20px',
                borderRadius: 12,
                border: 'none',
                background: 'var(--t2m-primary)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 14.5,
                cursor: 'pointer',
              }}
            >
              ✍️ Enrichir ce post
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Partage ce que TU sais en plus…"
                rows={4}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--t2m-line)',
                  background: 'var(--t2m-paper)',
                  color: 'var(--t2m-ink)',
                  fontSize: 15,
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />

              <p style={{ fontSize: 12.5, color: 'var(--t2m-ink-3)', margin: 0 }}>
                Léa améliore la forme, jamais les faits — tu valides.
              </p>

              {/* Version de Léa */}
              {lea && (
                <div
                  style={{
                    background: 'var(--t2m-wash)',
                    border: '1px solid var(--t2m-line)',
                    borderRadius: 12,
                    padding: '12px 14px',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--t2m-primary-deep)', letterSpacing: 0.2 }}>
                    ✨ Version de Léa
                  </span>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--t2m-ink)', margin: '6px 0 10px', whiteSpace: 'pre-wrap' }}>{lea}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(lea);
                      setLea(null);
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--t2m-line)',
                      background: 'var(--t2m-paper)',
                      color: 'var(--t2m-ink)',
                      fontWeight: 700,
                      fontSize: 13.5,
                      cursor: 'pointer',
                    }}
                  >
                    Utiliser la version de Léa
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  onClick={onReformulate}
                  disabled={!draft.trim() || reformulating}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 12,
                    border: '1px solid var(--t2m-line)',
                    background: 'var(--t2m-paper)',
                    color: 'var(--t2m-ink)',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: !draft.trim() || reformulating ? 'default' : 'pointer',
                    opacity: !draft.trim() || reformulating ? 0.55 : 1,
                  }}
                >
                  {reformulating ? '… Léa reformule' : 'Léa reformule'}
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!draft.trim() || saving}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'var(--t2m-primary)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: !draft.trim() || saving ? 'default' : 'pointer',
                    opacity: !draft.trim() || saving ? 0.55 : 1,
                  }}
                >
                  {saving ? 'Publication…' : 'Valider et publier'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setLea(null);
                  }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--t2m-ink-3)',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            background: 'var(--t2m-ink)',
            color: '#fff',
            padding: '11px 18px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}

      <GetAppSheet open={getApp} onClose={() => setGetApp(false)} context="enrich" />
    </section>
  );
}
