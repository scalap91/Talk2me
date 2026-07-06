'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * CardInspector — « Inspecter » une Card (Card OS, Pascal 2026-07-01). Phase 1 : LECTURE SEULE.
 * Comme les DevTools du navigateur, mais pour l'objet-source que TOUS les lecteurs rendent.
 * Onglets : Infos · Données · Actions · Relations · Source (JSON caviardé). L'édition = Phase 2.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Info, Layers, Zap, Share2, Braces, Loader2 } from '@/lib/icons';
import type { SuperCard } from '@/lib/cards/supercard';
import { redactCard, cardRelations, cardFilledFacets } from '@/lib/cards/inspect';

type Tab = 'infos' | 'data' | 'actions' | 'relations' | 'source';
interface InspectData {
  isOwner: boolean;
  card: SuperCard;
  meta: { id: string; source: string; created_at: number; version: number; state: string; owner: string };
  relations: { reader: string; name: string; emoji: string }[];
  facets: string[];
}

function fmtDate(ts: number): string {
  try {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  } catch { return '—'; }
}

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'infos', label: 'Infos', icon: Info },
  { key: 'data', label: 'Données', icon: Layers },
  { key: 'actions', label: 'Actions', icon: Zap },
  { key: 'relations', label: 'Relations', icon: Share2 },
  { key: 'source', label: 'Source', icon: Braces },
];

export default function CardInspector({ cardId, card, isOwner, onClose, startEdit, dev = true }: { cardId: string; card?: SuperCard; isOwner?: boolean; onClose: () => void; startEdit?: boolean; dev?: boolean }) {
  const [tab, setTab] = useState<Tab>('infos');
  // Source JSON = capot moteur → visible seulement en mode dev.
  const visibleTabs = dev ? TABS : TABS.filter((t) => t.key !== 'source');
  const [data, setData] = useState<InspectData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const openEdit = () => {
    setEditText(data?.card.text?.body || (data?.card.title && data.card.title !== 'Post' ? data.card.title : '') || '');
    setEditCategory(data?.card.categories?.[0] || '');
    setNewImage(null); setSaveMsg(null); setEditing(true);
  };
  const uploadImg = async (file: File) => {
    setUploadingImg(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd }).then((x) => x.json());
      if (r?.url) setNewImage(r.url); else setSaveMsg('Image refusée.');
    } catch { setSaveMsg('Upload impossible.'); } finally { setUploadingImg(false); }
  };
  const saveEdit = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const payload: Record<string, string> = { id: cardId, text: editText, category: editCategory };
      if (newImage) payload.media_url = newImage;
      const r = await fetch('/api/cards/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((x) => x.json());
      if (r?.ok && r.card) {
        // La card est ré-écrite à la SOURCE → on rafraîchit l'inspecteur ET tout le reste suivra.
        setData((prev) => prev ? { ...prev, card: { ...prev.card, ...r.card } } : prev);
        setEditing(false);
        setSaveMsg('Enregistré ✓ — tous les lecteurs reflètent le changement.');
      } else { setSaveMsg('Échec : ' + (r?.error || 'inconnu')); }
    } catch { setSaveMsg('Erreur réseau.'); } finally { setSaving(false); }
  };

  useEffect(() => {
    // Chemin RAPIDE : le lecteur a déjà la card → on rend direct (helpers purs), zéro fetch.
    if (card) {
      const owner = !!isOwner;
      const c = redactCard(card, owner);
      setData({
        isOwner: owner,
        card: c,
        meta: { id: cardId, source: 'lecteur', created_at: card.createdAt ?? 0, version: card.version ?? 1, state: card.state ?? 'published', owner: owner ? 'vous' : 'un autre utilisateur' },
        relations: cardRelations(c),
        facets: cardFilledFacets(c),
      });
      return;
    }
    // Fallback : on résout le `.card` côté serveur par id.
    let alive = true;
    fetch(`/api/cards/inspect?id=${encodeURIComponent(cardId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!alive) return; if (d?.ok) setData(d); else setErr(d?.message || (d?.error === 'no_card' ? 'Objet ancien : pas encore de .card.' : d?.error === 'not_found' ? 'Card introuvable.' : 'Illisible.')); })
      .catch(() => alive && setErr('network'));
    return () => { alive = false; };
  }, [cardId, card, isOwner]);

  // « Modifier » simple : on ouvre direct le panneau d'édition dès que la card est chargée.
  useEffect(() => {
    if (startEdit && data?.isOwner && !editing) openEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEdit, data]);

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-white/5">
      <span className="text-[12px] text-white/45">{k}</span>
      <span className="text-[12.5px] text-white/90 text-right break-words min-w-0">{v}</span>
    </div>
  );

  const body = (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-lg max-h-[88dvh] flex flex-col bg-[#0e0e13] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <Braces className="w-4 h-4 text-cyan-300" />
            <span className="text-[14px] font-semibold text-white">Inspecteur de Card</span>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        {!data && !err && <div className="flex-1 grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>}
        {err && <div className="flex-1 grid place-items-center py-16 px-8 text-center text-white/50 text-[13px]">{err}</div>}

        {data && (
          <>
            <div className="shrink-0 flex gap-1 px-2 pt-2 overflow-x-auto no-scrollbar border-b border-white/8">
              {visibleTabs.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={'flex items-center gap-1.5 px-3 py-2 text-[12.5px] rounded-t-lg whitespace-nowrap ' + (tab === key ? 'text-cyan-200 border-b-2 border-cyan-300 -mb-px' : 'text-white/50')}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {tab === 'infos' && (
                <div>
                  <Row k="Identifiant" v={<code className="text-[11px] text-amber-200">{data.meta.id}</code>} />
                  <Row k="Type" v={(data.card.types || []).join(', ') || '—'} />
                  <Row k="Canal" v={data.card.channel || '—'} />
                  <Row k="Source" v={data.meta.source} />
                  <Row k="Auteur" v={data.meta.owner} />
                  <Row k="État" v={data.meta.state} />
                  <Row k="Version" v={String(data.meta.version)} />
                  <Row k="Créée le" v={fmtDate(data.meta.created_at)} />
                </div>
              )}

              {tab === 'data' && (
                <div>
                  <Row k="Titre" v={data.card.title || '—'} />
                  {data.card.text?.body && <Row k="Description" v={<span className="whitespace-pre-wrap">{data.card.text.body}</span>} />}
                  {data.card.price?.amount != null && <Row k="Prix" v={`${data.card.price.amount} ${data.card.price.currency || ''}`} />}
                  {data.card.deposit?.amount != null && <Row k="Caution" v={`${data.card.deposit.amount} ${data.card.deposit.currency || ''}`} />}
                  {data.card.stock != null && <Row k="Stock" v={String(data.card.stock)} />}
                  {data.card.place?.address && <Row k="Lieu" v={data.card.place.address} />}
                  {!!(data.card.categories?.length) && <Row k="Catégories" v={data.card.categories!.join(', ')} />}
                  {!!(data.card.keywords?.length) && <Row k="Mots-clés" v={data.card.keywords!.join(', ')} />}
                  {data.card.specs && Object.keys(data.card.specs).length > 0 && (
                    <div className="py-1.5 border-b border-white/5">
                      <div className="text-[12px] text-white/45 mb-1">Specs</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(data.card.specs).map(([k, v]) => (
                          <div key={k} className="rounded-lg bg-white/[0.05] border border-white/10 px-2 py-1">
                            <div className="text-[10px] uppercase tracking-wide text-white/40">{k}</div>
                            <div className="text-[12px] text-white/85">{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!(data.card.images?.length) && (
                    <div className="pt-2">
                      <div className="text-[12px] text-white/45 mb-1.5">Images ({data.card.images!.length})</div>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar">
                        {data.card.images!.map((u, i) => <img key={i} src={u} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0 border border-white/10" />)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'actions' && (
                <div className="space-y-2">
                  {(data.card.actions || []).length === 0 && <p className="text-white/40 text-[13px] py-4">Aucune action exposée.</p>}
                  {(data.card.actions || []).map((a, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                      <span className="text-[13px] text-white/85">{a.label}</span>
                      <code className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200">{a.kind}</code>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'relations' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-[12px] text-white/45 mb-2">Lecteurs qui affichent cette card</div>
                    <div className="flex flex-wrap gap-2">
                      {data.relations.map((r) => (
                        <span key={r.reader} className="text-[12.5px] px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/85">{r.emoji} {r.name}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-white/45 mb-2">Facettes remplies (extensions)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.facets.map((f) => <code key={f} className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-200 border border-emerald-400/20">{f}</code>)}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'source' && (
                <div>
                  {!data.isOwner && <p className="text-[11px] text-amber-200/80 mb-2">Vue caviardée (tu n&apos;es pas le propriétaire) : owner, clés API et affiliation masqués.</p>}
                  <pre className="text-[11px] leading-relaxed text-[#cfd6e6] bg-black/40 border border-white/10 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(data.card, null, 2)}</pre>
                </div>
              )}
            </div>

            {data.isOwner && !editing && (
              <div className="shrink-0 px-4 py-3 border-t border-white/8">
                {saveMsg && <p className={'text-[12px] mb-2 ' + (saveMsg.startsWith('Enregistré') ? 'text-emerald-300' : 'text-red-300')}>{saveMsg}</p>}
                <button onClick={openEdit} className="w-full py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-100 text-[13px] font-medium">
                  ✏️ Éditer la Card
                </button>
              </div>
            )}
            {data.isOwner && editing && (
              <div className="shrink-0 px-4 py-3 border-t border-white/8 space-y-2">
                <div className="text-[12px] text-white/50">Édition écrite dans la source → tous les lecteurs suivent.</div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  maxLength={200}
                  rows={3}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-[14px] text-white outline-none focus:border-cyan-400/50 resize-none"
                  placeholder="Texte / légende…"
                />
                <input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  maxLength={60}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-[14px] text-white outline-none focus:border-cyan-400/50"
                  placeholder="Catégorie…"
                />
                {/* Image : remplacer la photo (rayon images) */}
                <label className="flex items-center gap-2 text-[13px] text-white/70 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 cursor-pointer">
                  {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>🖼</span>}
                  {newImage ? 'Image remplacée ✓ (enregistre pour valider)' : 'Remplacer l’image…'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImg(f); }} />
                </label>
                {newImage && <img src={newImage} alt="" className="w-20 h-20 rounded-lg object-cover border border-white/10" />}
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500 text-black text-[13px] font-semibold disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enregistrer
                  </button>
                  <button onClick={() => setEditing(false)} disabled={saving} className="px-4 py-2.5 rounded-xl border border-white/15 text-[13px] text-white/80">Annuler</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(body, document.body);
}
