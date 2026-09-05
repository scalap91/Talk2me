'use client';

/**
 * AVIS — composant GÉNÉRIQUE (Pascal 2026-09-05). Un seul rendu réutilisé PARTOUT :
 * fiche LOCAT (locat:<id>), boutique (shop:<id>), profil (user:<id>), card Discovery (card:<id>).
 * Force T2M : chaque avis est ADOSSÉ À L'IDENTITÉ (auteur = compte vérifié, traçable) → plus
 * fiable que Google. Anti-faux-avis : le POST est gaté serveur (ex. avoir loué le bien).
 *
 * - <ReviewSummary target/> : la pastille ★ moyenne · N avis (légère, pour une carte/fiche).
 * - <ReviewList target/>    : moyenne + liste des avis (lecture seule).
 * - <ReviewForm target contextRef? onDone/> : poser/mettre à jour SON avis (là où c'est autorisé).
 */
import { useEffect, useState, useCallback } from 'react';

export interface ReviewItem { id: string; author_id: string; author_name: string; author_avatar: string | null; stars: number; comment: string | null; created_at: number }
export interface ReviewData { summary: { avg: number; count: number }; reviews: ReviewItem[]; mine: { stars: number; comment: string | null } | null }

const fr = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 1 : 0, maximumFractionDigits: 1 });

/** Rangée d'étoiles (lecture ou saisie). */
export function Stars({ value, size = 16, onPick }: { value: number; size?: number; onPick?: (v: number) => void }) {
  return (
    <span className="inline-flex" style={{ gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onPick}
          onClick={() => onPick?.(i)}
          aria-label={`${i} étoile${i > 1 ? 's' : ''}`}
          className={onPick ? 'cursor-pointer' : 'cursor-default'}
          style={{ fontSize: size, lineHeight: 1, color: i <= Math.round(value) ? '#f5a623' : 'var(--t2m-line)', background: 'none', border: 0, padding: 0 }}
        >
          {i <= Math.round(value) ? '★' : '☆'}
        </button>
      ))}
    </span>
  );
}

/** Pastille compacte : ★ 4,5 · 12 avis (ou rien si aucun avis). */
export function ReviewSummary({ target, className = '' }: { target: string; className?: string }) {
  const [s, setS] = useState<{ avg: number; count: number } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/reviews?target=${encodeURIComponent(target)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.summary) setS(d.summary); }).catch(() => {});
    return () => { alive = false; };
  }, [target]);
  if (!s || !s.count) return null;
  return (
    <span className={'inline-flex items-center gap-1 text-[12.5px] text-[var(--t2m-ink-2)] ' + className}>
      <span style={{ color: '#f5a623' }}>★</span><b className="text-[var(--t2m-ink)]">{fr(s.avg)}</b>
      <span>· {s.count} avis</span>
    </span>
  );
}

const timeAgo = (ts: number) => {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return 'hier';
  if (d < 30) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString('fr-FR');
};

/** Moyenne + liste des avis (lecture seule). Réutilisable en Discovery. */
export function ReviewList({ target, refreshKey = 0 }: { target: string; refreshKey?: number }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const load = useCallback(() => {
    fetch(`/api/reviews?target=${encodeURIComponent(target)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.ok) setData(d); }).catch(() => {});
  }, [target]);
  useEffect(() => { load(); }, [load, refreshKey]);
  if (!data) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Stars value={data.summary.avg} size={18} />
        <span className="text-[13px] text-[var(--t2m-ink-2)]">{data.summary.count ? <><b className="text-[var(--t2m-ink)]">{fr(data.summary.avg)}</b> · {data.summary.count} avis</> : 'Pas encore d’avis'}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {data.reviews.map((r) => (
          <div key={r.id} className="flex gap-2.5">
            {r.author_avatar
              ? <img src={r.author_avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              : <div className="w-8 h-8 rounded-full bg-[var(--t2m-wash)] grid place-items-center text-[13px] font-bold text-[var(--t2m-ink-2)] shrink-0">{(r.author_name[0] || '?').toUpperCase()}</div>}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13.5px] text-[var(--t2m-ink)]">{r.author_name}</span>
                <Stars value={r.stars} size={12} />
                <span className="text-[11px] text-[var(--t2m-ink-3)]">{timeAgo(r.created_at)}</span>
              </div>
              {r.comment && <div className="text-[13px] text-[var(--t2m-ink-2)] leading-snug mt-0.5">{r.comment}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Formulaire : poser/mettre à jour SON avis. Placé LÀ OÙ c'est autorisé (POST gaté serveur). */
export function ReviewForm({ target, contextRef, onDone }: { target: string; contextRef?: string; onDone?: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/reviews?target=${encodeURIComponent(target)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.mine) { setStars(d.mine.stars); setComment(d.mine.comment || ''); } }).catch(() => {}).finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [target]);

  const submit = async () => {
    if (stars < 1) { setErr('Choisis une note.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, stars, comment, context: contextRef }) });
      const d = await r.json();
      if (d?.ok) onDone?.();
      else setErr(d?.error === 'must_have_rented' ? "Tu dois avoir loué ce bien pour laisser un avis." : d?.error === 'unauthorized' ? 'Connecte-toi pour laisser un avis.' : 'Envoi impossible.');
    } catch { setErr('Erreur réseau'); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[var(--t2m-line)] bg-white p-3 flex flex-col gap-2">
      <div className="font-semibold text-[13.5px] text-[var(--t2m-ink)]">{loaded && stars ? 'Modifier mon avis' : 'Laisser un avis'}</div>
      <Stars value={stars} size={26} onPick={setStars} />
      <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Ton retour (facultatif)…" className="w-full rounded-lg border border-[var(--t2m-line)] bg-white px-3 py-2 text-[14px] text-[var(--t2m-ink)] outline-none focus:border-[var(--t2m-primary)]" />
      {err && <div className="text-[12.5px] text-red-600">{err}</div>}
      <button onClick={submit} disabled={busy} className="self-end px-4 py-2 rounded-lg bg-[var(--t2m-primary)] text-white text-[13.5px] font-bold disabled:opacity-50">{busy ? '…' : 'Publier mon avis'}</button>
    </div>
  );
}
