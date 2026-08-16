'use client';

/**
 * Talk2Me — OUTILS DE CONTRIBUTION à une card (page-entité vivante, Pascal 2026-07-08).
 * Îlot client greffé dans la page publique SSR /card/[id]. Rend visible LE GESTE
 * « j'enrichis un post » : je partage ce que JE sais en plus, Léa remet la forme
 * propre (jamais les faits), je valide, mon nom reste attaché.
 *
 * Thème CLAIR (tokens --t2m-*). PII : n'affiche que display_name/username/avatar.
 */
import { useEffect, useRef, useState } from 'react';
import GetAppSheet from '@/components/public/GetAppSheet';

interface Me { id: string; username?: string | null; display_name?: string | null }

type Verdict = 'integrated' | 'duplicate' | 'off_context' | 'needs_review';
type ClaimStatus = 'confirmed' | 'contradicted' | 'unverifiable';
interface ClaimCheck {
  claim: string;
  status: ClaimStatus;
  source: string | null;
  note: string;
}
interface Verification {
  available: boolean;
  veracity: number;
  checks: ClaimCheck[];
  sources: string[];
}
interface Preview {
  verdict: Verdict;
  reason: string;
  scoreContext: number;
  scoreNovelty: number;
  isEvent: boolean;
  newBody: string;
  changed: boolean;
  verification?: Verification;
}

export default function ContributionTools({ cardId }: { cardId: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Flux d'enrichissement
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [proposing, setProposing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Langue finale : Léa écrit / traduit dans cette langue (défaut français).
  const [lang, setLang] = useState('français');
  // Joindre un PDF scanné → OCR → Léa reconstruit le contenu dans le brouillon.
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  // Module « REJOINDRE » : le visiteur non connecté ne va plus vers /signin, il
  // ouvre la GetAppSheet (QR / stores / SMS) pour choper l'app puis enrichir.
  const [getApp, setGetApp] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
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
  }, [cardId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  // PROPOSER : Léa lit l'article ENTIER + ma contribution, score, décide, et renvoie
  // l'article RÉÉCRIT en aperçu (rien n'est publié tant que je n'ai pas validé).
  async function onPropose() {
    const text = draft.trim();
    if (!text || proposing) return;
    setProposing(true);
    setPreview(null);
    try {
      const r = await fetch(`/api/cards/${cardId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'propose', text, lang }),
      });
      if (r.ok) {
        const j = (await r.json()) as Preview;
        setPreview(j);
      } else {
        showToast("l’IA n'a pas pu analyser — réessaie.");
      }
    } catch {
      showToast("l’IA n'a pas pu analyser — réessaie.");
    } finally {
      setProposing(false);
    }
  }

  // VALIDER : je confirme l'article fusionné → il remplace le corps canonique.
  async function onCommit() {
    if (!preview || preview.verdict !== 'integrated' || committing) return;
    setCommitting(true);
    try {
      const r = await fetch(`/api/cards/${cardId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', newBody: preview.newBody, text: draft.trim(), isEvent: preview.isEvent }),
      });
      if (r.ok) {
        setDraft('');
        setPreview(null);
        setOpen(false);
        window.location.reload(); // l'article SSR se re-rend fusionné + signature à jour
        return;
      }
      showToast('Publication impossible — réessaie.');
    } catch {
      showToast('Publication impossible — réessaie.');
    } finally {
      setCommitting(false);
    }
  }

  // RAFRAÎCHIR : Léa met à jour les données datées depuis les sources actuelles → aperçu à valider.
  async function onRefresh() {
    if (refreshing || committing) return;
    setRefreshing(true);
    try {
      const r = await fetch(`/api/cards/${cardId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', lang }),
      });
      if (r.status === 401) {
        setGetApp(true);
        return;
      }
      if (r.ok) {
        setDraft('');
        setPreview((await r.json()) as Preview);
        setOpen(true);
      }
    } catch {
      showToast('Rafraîchissement impossible — réessaie.');
    } finally {
      setRefreshing(false);
    }
  }

  // PDF SCANNÉ → OCR → Léa reconstruit → remplit le brouillon (l'user relit & valide).
  async function onPickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Reset l'input tout de suite pour permettre de re-choisir le même fichier.
    if (pdfInputRef.current) pdfInputRef.current.value = '';
    if (!f || pdfBusy) return;
    if (f.type && f.type !== 'application/pdf') {
      showToast('Il faut un fichier PDF.');
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      showToast('PDF trop lourd (12 Mo max).');
      return;
    }
    setPdfBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('lang', lang);
      const r = await fetch(`/api/cards/${cardId}/enrich-pdf`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok && String(j.text || '').trim()) {
        setDraft(String(j.text).trim());
        setPreview(null);
        showToast('Document lu par l’IA — relis, puis propose-le ✍️');
      } else if (j?.reason === 'rasterisation_indisponible' || j?.reason === 'ocr_vide') {
        showToast("Ce scan n'a pas pu être lu, réessaie avec une photo plus nette.");
      } else if (j?.reason === 'too_large') {
        showToast('PDF trop lourd (12 Mo max).');
      } else if (j?.reason === 'not_pdf') {
        showToast('Il faut un fichier PDF.');
      } else {
        showToast("Impossible de lire ce document pour l'instant.");
      }
    } catch {
      showToast("Impossible de lire ce document pour l'instant.");
    } finally {
      setPdfBusy(false);
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
          Enrichir cette page
        </h2>
        <p style={{ fontSize: 13, color: 'var(--t2m-ink-3)', margin: '0 0 14px' }}>
          Ajoute ce que tu sais — l’IA remet la forme, tu restes crédité·e.
        </p>


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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setOpen(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 12,
                  border: 'none', background: 'var(--t2m-primary)', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: 'pointer',
                }}
              >
                ✍️ Enrichir ce post
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                title="Mettre à jour les données datées depuis les sources actuelles"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12,
                  border: '1px solid var(--t2m-line)', background: 'var(--t2m-paper)', color: 'var(--t2m-ink)',
                  fontWeight: 700, fontSize: 14, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.6 : 1,
                }}
              >
                {refreshing ? '… l’IA actualise' : '🔄 Rafraîchir'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Joindre un PDF scanné → OCR → Léa reconstruit dans le brouillon */}
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                onChange={onPickPdf}
                style={{ display: 'none' }}
              />
              <div>
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={pdfBusy || committing}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 16px',
                    borderRadius: 12,
                    border: '1px solid var(--t2m-line)',
                    background: 'var(--t2m-wash)',
                    color: 'var(--t2m-ink)',
                    fontWeight: 700,
                    fontSize: 13.5,
                    cursor: pdfBusy || committing ? 'default' : 'pointer',
                    opacity: pdfBusy || committing ? 0.7 : 1,
                  }}
                >
                  {pdfBusy ? (
                    <>
                      <span
                        aria-hidden
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          border: '2px solid var(--t2m-line)',
                          borderTopColor: 'var(--t2m-primary)',
                          display: 'inline-block',
                          animation: 'spin 0.8s linear infinite',
                        }}
                      />
                      📄 l’IA lit le document…
                    </>
                  ) : (
                    '📎 Joindre un PDF scanné'
                  )}
                </button>
                <p style={{ fontSize: 11.5, color: 'var(--t2m-ink-3)', margin: '6px 0 0' }}>
                  Scan peu lisible ? L’IA reconstitue le texte à partir du document — vérifie toujours avant de publier.
                </p>
              </div>

              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Partage ce que TU sais en plus…"
                disabled={pdfBusy}
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12.5, color: 'var(--t2m-ink-3)', margin: 0, flex: 1, minWidth: 180 }}>
                  L’IA lit tout l'article et fusionne ta contribution au bon endroit — tu valides.
                </p>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--t2m-ink-2)' }}>
                  Langue
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 10, border: '1px solid var(--t2m-line)', background: 'var(--t2m-paper)', color: 'var(--t2m-ink)', fontSize: 13.5 }}
                  >
                    <option value="français">Français</option>
                    <option value="anglais">English</option>
                    <option value="malgache">Malagasy</option>
                    <option value="espagnol">Español</option>
                  </select>
                </label>
              </div>

              {/* Aperçu de la fusion (verdict + scores + article réécrit éditable) */}
              {preview && (
                <div style={{ background: 'var(--t2m-wash)', border: '1px solid var(--t2m-line)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 12.5, fontWeight: 800,
                        color: preview.verdict === 'integrated' ? '#1B7F4B' : 'var(--t2m-ink-2)',
                      }}
                    >
                      {preview.verdict === 'integrated'
                        ? '✓ Apport retenu'
                        : preview.verdict === 'duplicate'
                          ? '↺ Déjà couvert'
                          : preview.verdict === 'off_context'
                            ? '⤫ Hors sujet'
                            : '⚠ À vérifier'}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--t2m-ink-3)', fontWeight: 600 }}>
                      contexte {preview.scoreContext} · nouveauté {preview.scoreNovelty}
                      {preview.isEvent ? ' · événement' : ''}
                    </span>
                  </div>
                  {preview.reason && (
                    <p style={{ fontSize: 13, color: 'var(--t2m-ink-2)', margin: '0 0 8px', lineHeight: 1.5 }}>{preview.reason}</p>
                  )}

                  {/* Vérification des faits (M2) — la vérité avant de valider */}
                  {preview.verification && preview.verification.checks.length > 0 && (
                    <div style={{ margin: '0 0 8px', borderTop: '1px solid var(--t2m-line)', paddingTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--t2m-ink-2)', marginBottom: 6 }}>
                        🔎 Vérification des faits · {preview.verification.veracity}% corroborés
                      </div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {preview.verification.checks.map((c, i) => (
                          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                            <span>{c.status === 'confirmed' ? '✅ ' : c.status === 'contradicted' ? '❌ ' : '❓ '}</span>
                            <span style={{ color: c.status === 'contradicted' ? '#B42318' : 'var(--t2m-ink)' }}>{c.claim}</span>
                            {(c.note || c.source) && (
                              <span style={{ display: 'block', color: 'var(--t2m-ink-3)', fontSize: 11.5, marginLeft: 18, marginTop: 1 }}>
                                {c.note}
                                {c.source && (
                                  <>
                                    {c.note ? ' · ' : ''}
                                    <a href={c.source} target="_blank" rel="noreferrer" style={{ color: 'var(--t2m-primary)' }}>source</a>
                                  </>
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {preview.verdict === 'integrated' && (
                    <>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t2m-ink-3)' }}>Article après fusion (modifiable) :</span>
                      <textarea
                        value={preview.newBody}
                        onChange={(e) => setPreview({ ...preview, newBody: e.target.value })}
                        rows={8}
                        style={{
                          width: '100%', resize: 'vertical', marginTop: 6, padding: '10px 12px', borderRadius: 10,
                          border: '1px solid var(--t2m-line)', background: 'var(--t2m-paper)', color: 'var(--t2m-ink)',
                          fontSize: 14, lineHeight: 1.55, fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                      />
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {(!preview || preview.verdict !== 'integrated') && (
                  <button
                    type="button"
                    onClick={onPropose}
                    disabled={!draft.trim() || proposing || pdfBusy}
                    style={{
                      padding: '10px 18px', borderRadius: 12, border: 'none', background: 'var(--t2m-primary)', color: '#fff',
                      fontWeight: 800, fontSize: 14, cursor: !draft.trim() || proposing ? 'default' : 'pointer',
                      opacity: !draft.trim() || proposing ? 0.55 : 1,
                    }}
                  >
                    {proposing ? '… l’IA analyse' : 'Proposer à l’IA'}
                  </button>
                )}
                {preview && preview.verdict === 'integrated' && (
                  <button
                    type="button"
                    onClick={onCommit}
                    disabled={committing}
                    style={{
                      padding: '10px 18px', borderRadius: 12, border: 'none', background: 'var(--t2m-primary)', color: '#fff',
                      fontWeight: 800, fontSize: 14, cursor: committing ? 'default' : 'pointer', opacity: committing ? 0.6 : 1,
                    }}
                  >
                    {committing ? 'Publication…' : 'Valider et publier'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setPreview(null);
                  }}
                  style={{
                    padding: '10px 14px', borderRadius: 12, border: 'none', background: 'transparent',
                    color: 'var(--t2m-ink-3)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
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

      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>

      <GetAppSheet open={getApp} onClose={() => setGetApp(false)} context="enrich" />
    </section>
  );
}
