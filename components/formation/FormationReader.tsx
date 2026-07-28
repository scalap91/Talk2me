'use client';

/**
 * LECTEUR FORMATION (Pascal 2026-07-28) — vue d'une card `types:['formation']` DANS le lecteur unique.
 *
 * MODÈLE VALIDÉ PAR PASCAL : un DECK de pages qu'on fait glisser À GAUCHE, chaque page = UN écran (jamais
 * plus grand que le feed). Page 1 = la PHOTO IMMERSIVE plein écran (auteur + accroche posés dessus, EXACTEMENT
 * comme le rendu natif). On glisse → page 2 = le simulateur → page 3 = la genèse… (natif et web pareils).
 *
 * `fullscreen` (feed immersif) : pages = 100svh, page 1 = photo. Sinon (variant cartes) : deck borné.
 *
 * UNE PIERRE DEUX COUPS : même lecteur pour TES formations (owner=ouvert) et celles des autres (🔒 + Débloquer).
 * ⚠️ ARGENT = LIGNE ROUGE : « Débloquer » = unlock MVP ; vrai paiement /api/commerce/buy NON branché.
 */
import { useState, useRef } from 'react';
import { Lock, CheckCircle2, GraduationCap, ChevronLeft } from '@/lib/icons';
import Markdown from '@/components/cards/Markdown';
import ContributorSimulator from '@/components/formation/ContributorSimulator';

interface Slide { heading?: string; points?: string[]; image?: string }
interface Module {
  id?: string; title?: string; free?: boolean; locked?: boolean;
  source?: { label?: string }; text?: { body?: string }; slides?: Slide[];
}
export interface FormationCard {
  id?: string; title?: string; images?: string[];
  text?: { body?: string }; price?: { amount?: number; currency?: string }; items?: Module[];
}
interface Author { who?: string; avatarUrl?: string | null }

const ACCENT = '#7C5CFF';

export default function FormationReader({ card, light = false, fullscreen = false, author }: { card: FormationCard; light?: boolean; fullscreen?: boolean; author?: Author }) {
  const [c, setC] = useState<FormationCard>(card);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const modules = Array.isArray(c.items) ? c.items : [];
  const hasLocked = modules.some((m) => m.locked);
  const cover = c.images?.[0];
  const price = c.price?.amount && c.price.amount > 0 ? `${c.price.amount.toLocaleString('fr-FR')} ${c.price.currency || 'Ar'}` : null;
  // Le module « simulateur » est DÉCOUPÉ en plusieurs pages (Pascal : chaque morceau tient dans une page).
  const SIM_PAGES = 8;
  const isSim = (m: Module) => (m.text?.body || '').includes('[[SIMULATEUR]]');
  const totalPages = 1 + modules.reduce((s, m) => s + (isSim(m) ? SIM_PAGES : 1), 0);

  const ink = light ? '#2F343A' : '#fff';
  const sub = light ? '#6A7585' : 'rgba(255,255,255,.62)';
  const border = light ? '#E7EAF0' : 'rgba(255,255,255,.12)';
  const pageBg = fullscreen ? '#0b0c10' : (light ? '#fff' : '#0b0c10');
  const H = fullscreen ? '100svh' : 'min(54svh, 460px)';

  const onScroll = () => { const el = scroller.current; if (el) setPage(Math.round(el.scrollLeft / el.clientWidth)); };
  const goTo = (i: number) => { const el = scroller.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }); };

  const unlock = async () => {
    if (!c.id || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/formation/${encodeURIComponent(c.id)}/unlock`, { method: 'POST' }).then((x) => x.json());
      if (!r?.ok) { setErr('Déblocage impossible.'); return; }
      const fresh = await fetch(`/api/formation/${encodeURIComponent(c.id)}`, { cache: 'no-store' }).then((x) => x.json());
      if (fresh?.ok && fresh.card) setC(fresh.card as FormationCard);
    } catch { setErr('Réseau.'); } finally { setBusy(false); }
  };

  const ModuleBody = ({ m }: { m: Module }) => {
    const body = m.text?.body || '';
    return (
      <>
        <Markdown light={light}>{body}</Markdown>
        {Array.isArray(m.slides) && m.slides.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {m.slides.map((s, k) => (
              <div key={k} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,.05)' }}>
                {s.image && <img src={s.image} alt="" className="w-full rounded-md mb-1.5 object-cover" style={{ maxHeight: 160 }} />}
                {s.heading && <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>{s.heading}</div>}
                {Array.isArray(s.points) && <ul className="mt-1" style={{ fontSize: 12.5, color: sub, listStyle: 'disc', paddingLeft: 16 }}>{s.points.map((p, pi) => <li key={pi}>{p}</li>)}</ul>}
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: H, background: pageBg, borderRadius: fullscreen ? 0 : 16, overflow: 'hidden', border: fullscreen ? 'none' : `1px solid ${border}` }}>
      <div ref={scroller} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory" style={{ height: '100%', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

        {/* PAGE 1 — PHOTO IMMERSIVE plein écran (auteur + accroche dessus), comme le natif */}
        <div className="shrink-0 basis-full snap-center snap-always" style={{ height: '100%', position: 'relative', background: '#000' }}>
          {cover && <img src={cover} alt={c.title || 'Formation'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.86) 0%, rgba(0,0,0,.35) 42%, rgba(0,0,0,.05) 66%)' }} />
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: fullscreen ? 'calc(env(safe-area-inset-bottom) + 92px)' : 20, zIndex: 3 }}>
            {author?.who && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {author.avatarUrl
                  ? <img src={author.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,.9)' }} />
                  : <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(45deg,#FF7F11,#7C5CFF)', border: '2px solid rgba(255,255,255,.9)' }} />}
                <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>{author.who}</span>
              </div>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, color: '#fff', background: 'rgba(124,92,255,.9)' }}><GraduationCap className="w-3.5 h-3.5" /> FORMATION · {modules.length} modules</span>
            <div style={{ fontSize: 23, fontWeight: 800, color: '#fff', lineHeight: 1.12, margin: '10px 0 6px', textShadow: '0 2px 10px rgba(0,0,0,.6)' }}>{c.title || 'Formation'}</div>
            {c.text?.body && <div style={{ fontSize: 14, color: 'rgba(255,255,255,.92)', lineHeight: 1.45, textShadow: '0 1px 6px rgba(0,0,0,.6)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.text.body}</div>}
            <button type="button" onClick={(e) => { e.stopPropagation(); goTo(1); }}
              style={{ marginTop: 14, width: '100%', borderRadius: 12, padding: '13px 0', border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Commencer <ChevronLeft className="w-4 h-4" style={{ transform: 'rotate(180deg)' }} />
            </button>
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,.7)' }}>← glisse pour parcourir</div>
          </div>
        </div>

        {/* PAGES MODULES — une page plein écran par module (glisse à gauche). Le module simulateur =
            PLUSIEURS pages (chaque morceau ≤ un écran, Pascal). */}
        {modules.map((m, i) => {
          if (isSim(m)) return <ContributorSimulator key={m.id || i} pages />;
          const readable = !m.locked && !!m.text?.body;
          return (
            <div key={m.id || i} className="shrink-0 basis-full snap-center snap-always overflow-y-auto" style={{ height: '100%', background: pageBg }}>
              <div style={{ padding: 'calc(env(safe-area-inset-top) + 72px) 16px calc(env(safe-area-inset-bottom) + 128px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 999, fontSize: 13, fontWeight: 800, color: '#fff', background: ACCENT }}>{i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: ink, lineHeight: 1.2 }}>{m.title || `Module ${i + 1}`}</div>
                    {m.source?.label && <div style={{ fontSize: 12.5, color: sub }}>{m.source.label}</div>}
                  </div>
                  {m.free && !m.locked && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, color: '#16A34A', background: 'rgba(22,163,74,.14)' }}>GRATUIT</span>}
                </div>
                <div style={{ marginTop: 14 }}>
                  {readable ? <ModuleBody m={m} /> : (
                    <div style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: '48px 0', gap: 10 }}>
                      <Lock className="w-9 h-9" style={{ color: sub }} />
                      <div style={{ fontSize: 15, fontWeight: 700, color: ink }}>Module verrouillé</div>
                      {m.source?.label && <div style={{ fontSize: 13, color: sub }}>{m.source.label}</div>}
                      <button type="button" onClick={unlock} disabled={busy} style={{ marginTop: 4, borderRadius: 12, padding: '11px 22px', border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>{busy ? '…' : price ? `Débloquer · ${price}` : 'Débloquer la formation'}</button>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: sub }}><CheckCircle2 className="w-3.5 h-3.5" /> Accès à vie une fois débloqué</div>
                      {err && <div style={{ fontSize: 12, color: '#E24C4C' }}>{err}</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* PASTILLE de progression — CLAIRE et visible sur CHAQUE écran (Pascal). Fond dégradé pour que le
          contenu qui défile NE PASSE PAS sous/sur la barre (ça s'entremêlait en page 5). Peu de pages →
          points ; beaucoup (deck long) → barre + pastille « page / total ». */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5, pointerEvents: 'none', paddingTop: 26, paddingBottom: fullscreen ? 'calc(env(safe-area-inset-bottom) + 84px)' : 8, background: fullscreen ? `linear-gradient(to top, ${pageBg} 62%, ${pageBg}cc 82%, transparent)` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {totalPages <= 12 ? (
          Array.from({ length: totalPages }).map((_, i) => (
            <button key={i} type="button" aria-label={`Page ${i + 1}`} onClick={() => goTo(i)}
              style={{ width: i === page ? 20 : 7, height: 7, borderRadius: 999, border: 'none', padding: 0, cursor: 'pointer', transition: 'width .2s', background: i === page ? ACCENT : 'rgba(255,255,255,.5)' }} />
          ))
        ) : (
          <>
            <div style={{ height: 5, width: 130, borderRadius: 999, background: 'rgba(255,255,255,.25)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((page + 1) / totalPages) * 100}%`, background: ACCENT, borderRadius: 999, transition: 'width .25s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '3px 10px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>{page + 1}/{totalPages}</span>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
