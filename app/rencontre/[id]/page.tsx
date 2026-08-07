'use client';

/**
 * Salon Rencontre — on « entre chez elle » (Pascal 2026-07-15).
 * Une SEULE page : consultation (profil d'autrui) OU édition (ton propre profil, `mine`).
 *  - Consultation : description, galerie (photos/vidéos GRATUITES visibles ; PAYANTES 🔒 → Débloquer),
 *    bouton « Accéder au live » si en ligne, bouton « Écrire » (conversation P2P).
 *  - Édition (mine) : édite la description, AJOUTE des photos/vidéos (gratuites ou payantes), supprime.
 * Le contenu = des ITEMS du shop rencontre (écrivent leur .card) ; le payant réutilise le rail escrow
 * (POST /api/rencontre/[id]/unlock). PII air-gap : owner_id jamais exposé (hostId seulement si live).
 */
import { useEffect, useState, useRef, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Loader2, ImagePlus, Lock, Play, Trash2, MessageCircle, Video, Coins, Eye } from '@/lib/icons';
import BackButton from '@/components/system/BackButton';

interface Media { id: string; media: 'photo' | 'video'; paid: boolean; priceCents: number; priceLabel: string | null; label: string | null; unlocked: boolean; url: string | null; liveSale?: boolean }
interface Salon { id: string; name: string; description: string | null; cover_url: string | null; ville: string | null; age: string | null; public_key: string; mine: boolean; vip: boolean; live: boolean; hostId: string | null; media: Media[] }

export default function SalonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // id item en cours (unlock/delete)
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch(`/api/rencontre/${id}`, { cache: 'no-store' })
    .then((r) => r.json()).then((d) => { if (d?.ok) setSalon(d.salon); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // GAINS du liveur (masqués par défaut : si qqn voit l'écran, il ne voit pas la somme). Pascal 2026-07-15.
  const [earnings, setEarnings] = useState<{ totalLabel: string; releasedLabel: string; pendingLabel: string } | null>(null);
  const [showGains, setShowGains] = useState(false);
  useEffect(() => {
    if (!salon?.mine) return;
    fetch('/api/me/earnings', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) setEarnings(d); }).catch(() => {});
  }, [salon?.mine]);

  // ── VISITEUR ──────────────────────────────────────────────
  const ecrire = async () => {
    if (!salon || busy) return; setBusy('contact');
    try {
      const r = await fetch('/api/simple-shop/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: salon.public_key }) });
      const d = await r.json();
      if (r.ok && d.conversationId) { router.push(`/c/${d.conversationId}`); return; }
    } catch { /* */ }
    setBusy(null);
  };
  const unlock = async (m: Media) => {
    if (busy) return; setBusy(m.id);
    try {
      const r = await fetch(`/api/rencontre/${id}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: m.id }) });
      const d = await r.json();
      if (d?.checkout_url) { window.location.href = d.checkout_url; return; }
      if (d?.ok) await load();
    } catch { /* */ }
    setBusy(null);
  };

  // ── PROPRIÉTAIRE (édition) ────────────────────────────────
  const [savingDesc, setSavingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const saveDesc = async () => {
    if (descDraft == null || savingDesc) return; setSavingDesc(true);
    try {
      await fetch(`/api/simple-shop/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: descDraft }) });
      setSalon((s) => (s ? { ...s, description: descDraft } : s)); setDescDraft(null);
    } finally { setSavingDesc(false); }
  };
  const [adding, setAdding] = useState(false);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const isVid = f.type.startsWith('video');
    const paid = window.confirm('Contenu PAYANT ? (OK = payant · Annuler = gratuit)');
    let price = 0;
    if (paid) { const v = window.prompt('Prix en Ariary (Ar) :', '5000'); price = Math.max(0, Math.round(Number(v) || 0)); if (!price) return; }
    setAdding(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const up = await (await fetch('/api/upload', { method: 'POST', body: fd })).json();
      if (!up?.url) return;
      await fetch(`/api/simple-shop/${id}/item`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: up.url, price, attributes: isVid ? { media: 'video' } : undefined }),
      });
      await load();
    } finally { setAdding(false); }
  };
  const toggleLiveSale = async (m: Media) => {
    const next = !m.liveSale;
    setSalon((s) => (s ? { ...s, media: s.media.map((x) => (x.id === m.id ? { ...x, liveSale: next } : x)) } : s));
    try { await fetch(`/api/rencontre/${id}/live-sale`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: m.id, on: next }) }); } catch { /* */ }
  };
  const [deleting, setDeleting] = useState(false);
  const deleteProfile = async () => {
    if (deleting || !window.confirm('Supprimer DÉFINITIVEMENT ton profil Rencontre ? (photos, vidéos, tout est effacé)')) return;
    setDeleting(true);
    try { const r = await fetch(`/api/simple-shop/${id}`, { method: 'DELETE' }); if (r.ok) { router.replace('/rencontre'); return; } } catch { /* */ }
    setDeleting(false);
  };
  const del = async (m: Media) => {
    if (busy || !window.confirm('Supprimer ce contenu ?')) return; setBusy(m.id);
    try {
      await fetch(`/api/simple-shop/${id}/item`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: m.id }) });
      await load();
    } finally { setBusy(null); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-[var(--t2m-bg)]"><Loader2 className="w-6 h-6 animate-spin text-[#EC4899]" /></div>;
  if (!salon) return (
    <div className="min-h-screen grid place-items-center bg-[var(--t2m-bg)] px-8 text-center">
      <div><Heart className="w-8 h-8 mx-auto mb-2 text-[#EC4899]" /><p className="text-[var(--t2m-ink-2)] text-[14px]">Ce profil n&apos;existe plus.</p>
        <BackButton to="/rencontre" label="Retour" size={16} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#EC4899]" /></div>
    </div>
  );

  const mine = salon.mine;
  const desc = descDraft != null ? descDraft : (salon.description || '');

  return (
    <div className="min-h-screen bg-[var(--t2m-bg)] pb-28">
      {/* Pastille de repérage (test) */}
      <span className="fixed top-2 right-2 z-[60] px-1.5 py-0.5 rounded-md bg-pink-600 text-white text-[10px] font-mono font-bold tracking-widest shadow">SALON-50</span>

      {/* En-tête cover */}
      <div className="relative w-full aspect-[4/5] max-h-[62vh] bg-[#F5F6F8] overflow-hidden">
        {salon.cover_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={salon.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 grid place-items-center" style={{ background: 'linear-gradient(135deg,#EC4899,#EC4899bb)' }}><Heart className="w-16 h-16 text-white/90" /></div>}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0) 45%)' }} />
        <BackButton size={20} className="absolute top-3 left-3 z-10 w-9 h-9 grid place-items-center rounded-full bg-black/35 backdrop-blur text-white active:scale-95" />
        {salon.live && (
          <span className="absolute top-3.5 left-14 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EF4444] text-white text-[11px] font-bold shadow"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE</span>
        )}
        {salon.vip && (
          <span className="absolute top-3.5 right-3 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-black text-[11px] font-bold shadow">★ VIP</span>
        )}
        <div className="absolute bottom-0 inset-x-0 p-4 z-10">
          <h1 className="text-white text-[24px] font-bold leading-tight" style={{ fontFamily: "'Outfit',sans-serif", textShadow: '0 1px 6px rgba(0,0,0,.5)' }}>
            {salon.name}{salon.age ? <span className="font-medium">, {salon.age}</span> : null}
          </h1>
          {salon.ville && <p className="text-white/90 text-[13px] mt-0.5" style={{ textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>📍 {salon.ville}</p>}
        </div>
      </div>

      {/* Accès live (si en ligne) */}
      {salon.live && salon.hostId && !mine && (
        <div className="px-4 pt-3">
          <button onClick={() => router.push(`/live/${salon.hostId}`)} className="w-full h-12 rounded-2xl bg-[#EF4444] text-white font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98]">
            <Video className="w-5 h-5" /> Accéder au live
          </button>
        </div>
      )}

      {/* Passer en live — le PROFIL appelle la cam (avec le pseudo). Pascal 2026-07-15. */}
      {mine && (
        <div className="px-4 pt-3">
          <button onClick={() => router.push('/rencontre/live')} className="w-full h-12 rounded-2xl bg-[#EF4444] text-white font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98]">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Passer en live
          </button>
        </div>
      )}

      {/* Mes gains (proprio) — masqués par défaut, 👁 pour révéler. */}
      {mine && (
        <div className="px-4 pt-3">
          <div className="rounded-2xl border border-[var(--t2m-line)] bg-[var(--t2m-paper)] p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: '#EC489918' }}><Coins className="w-5 h-5 text-[#EC4899]" /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-[var(--t2m-ink-3)]">Mes gains</div>
              <div className="text-[19px] font-bold text-[var(--t2m-ink)] tabular-nums leading-tight">
                {showGains ? (earnings?.totalLabel ?? '—') : '••••••'}
              </div>
              {showGains && earnings && (
                <div className="text-[11px] text-[var(--t2m-ink-3)] mt-0.5">Encaissé {earnings.releasedLabel} · En attente {earnings.pendingLabel}</div>
              )}
            </div>
            <button onClick={() => setShowGains((v) => !v)} aria-label={showGains ? 'Masquer' : 'Afficher'}
              className="w-10 h-10 grid place-items-center rounded-full bg-[var(--t2m-wash)] text-[var(--t2m-ink-2)] active:scale-95">
              <Eye className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="px-4 pt-4">
        {mine ? (
          <div>
            <label className="text-[12px] text-[var(--t2m-ink-3)] block mb-1.5">Ta description</label>
            <textarea value={desc} onChange={(e) => setDescDraft(e.target.value)} rows={3} placeholder="Présente-toi…"
              className="w-full bg-[var(--t2m-paper)] border border-[var(--t2m-line)] rounded-xl px-3 py-2.5 text-[14px] text-[var(--t2m-ink)] outline-none focus:border-[#EC4899]/50 resize-none" />
            {descDraft != null && descDraft !== (salon.description || '') && (
              <button onClick={saveDesc} disabled={savingDesc} className="mt-2 px-4 py-2 rounded-xl bg-[#EC4899] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50">
                {savingDesc ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enregistrer
              </button>
            )}
          </div>
        ) : salon.description ? (
          <p className="text-[14px] text-[var(--t2m-ink-2)] leading-relaxed whitespace-pre-wrap">{salon.description}</p>
        ) : null}
      </div>

      {/* Galerie */}
      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[15px] font-bold text-[var(--t2m-ink)]">{mine ? 'Mon contenu' : 'Ses photos & vidéos'}</h2>
          {mine && (
            <button onClick={() => fileRef.current?.click()} disabled={adding} className="px-3 py-1.5 rounded-full bg-[#EC4899]/12 text-[#EC4899] text-[12.5px] font-semibold inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Ajouter
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={onPick} />
        {salon.media.length === 0 ? (
          <p className="text-[13px] text-[var(--t2m-ink-3)] py-6 text-center">{mine ? 'Ajoute tes premières photos et vidéos (gratuites ou payantes 🔒).' : 'Aucun contenu pour l’instant.'}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {salon.media.map((m) => (
              <div key={m.id} className="relative aspect-square rounded-2xl overflow-hidden bg-[#0d0d0d]">
                {m.unlocked && m.url ? (
                  m.media === 'video'
                    ? <video src={m.url} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={m.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  // Contenu payant verrouillé : tuile 🔒 + prix (l'URL n'est même pas envoyée).
                  <div className="absolute inset-0 grid place-items-center" style={{ background: 'linear-gradient(135deg,#2a2a2e,#3a2030)' }}>
                    <Lock className="w-7 h-7 text-white/80" />
                  </div>
                )}
                {m.media === 'video' && m.unlocked && (
                  <span className="absolute top-2 left-2 w-7 h-7 grid place-items-center rounded-full bg-black/45 backdrop-blur text-white"><Play className="w-3.5 h-3.5" /></span>
                )}
                {/* Badge payant / bouton débloquer */}
                {m.paid && !m.unlocked && (
                  <button onClick={() => unlock(m)} disabled={busy === m.id}
                    className="absolute inset-x-0 bottom-0 h-9 bg-[#EC4899] text-white text-[12px] font-bold inline-flex items-center justify-center gap-1.5 active:opacity-90 disabled:opacity-60">
                    {busy === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} {m.priceLabel}
                  </button>
                )}
                {m.paid && m.unlocked && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[9.5px] font-bold">DÉBLOQUÉ</span>
                )}
                {mine && (
                  <>
                    {m.paid && <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-[#EC4899] text-white text-[9.5px] font-bold">{m.priceLabel}</span>}
                    {m.media === 'video' && m.paid && (
                      <button onClick={() => toggleLiveSale(m)} className={`absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 h-7 rounded-full text-[10px] font-bold active:scale-95 ${m.liveSale ? 'bg-[#EF4444] text-white' : 'bg-black/55 backdrop-blur text-white/85'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${m.liveSale ? 'bg-white animate-pulse' : 'bg-white/60'}`} /> {m.liveSale ? 'En vente live' : 'Vendre en live'}
                      </button>
                    )}
                    <button onClick={() => del(m)} disabled={busy === m.id} className="absolute bottom-2 right-2 w-8 h-8 grid place-items-center rounded-full bg-black/55 backdrop-blur text-white active:scale-95">
                      {busy === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supprimer mon profil (proprio) */}
      {mine && (
        <div className="px-4 pt-8">
          <button onClick={deleteProfile} disabled={deleting} className="w-full h-11 rounded-2xl border border-red-300 text-red-500 text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Supprimer mon profil
          </button>
        </div>
      )}

      {/* Barre d'action bas — visiteur : Écrire */}
      {!mine && (
        <div className="fixed bottom-0 inset-x-0 z-50 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-[var(--t2m-bg)]/90 backdrop-blur border-t border-[var(--t2m-line)] max-w-[440px] mx-auto">
          <button onClick={ecrire} disabled={busy === 'contact'} className="w-full h-12 rounded-2xl bg-[#EC4899] text-white font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60">
            {busy === 'contact' ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />} Écrire
          </button>
        </div>
      )}
    </div>
  );
}
