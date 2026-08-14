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
import { useRouter } from 'next/navigation';
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

export default function FormationReader({ card, light = false, fullscreen = false, inFeed = false, author }: { card: FormationCard; light?: boolean; fullscreen?: boolean; inFeed?: boolean; author?: Author }) {
  const [c, setC] = useState<FormationCard>(card);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState(false);
  const router = useRouter();

  const modules = Array.isArray(c.items) ? c.items : [];
  const hasLocked = modules.some((m) => m.locked);
  const cover = c.images?.[0];
  const price = c.price?.amount && c.price.amount > 0 ? `${c.price.amount.toLocaleString('fr-FR')} ${c.price.currency || 'Ar'}` : null;
  // Le module « simulateur » est DÉCOUPÉ en plusieurs pages (Pascal : chaque morceau tient dans une page).
  const SIM_PAGES = 8;
  const isSim = (m: Module) => (m.text?.body || '').includes('[[SIMULATEUR]]');
  const totalPages = 1 + modules.reduce((s, m) => s + (isSim(m) ? SIM_PAGES : 1), 0);
  // SOMMAIRE interactif : index physique de départ de chaque module (le simulateur occupe SIM_PAGES pages).
  const tocEntries = (() => {
    let pg = 1; // page 0 = couverture
    return modules.map((m, i) => {
      const start = pg;
      pg += isSim(m) ? SIM_PAGES : 1;
      const raw = m.title || `Module ${i + 1}`;
      const g = raw.includes('—') ? raw.split('—')[0].trim() : null;      // section (ex. « Le métier »)
      const label = raw.includes('—') ? raw.split('—').slice(1).join('—').trim() : raw;
      return { i, start, g, label };
    });
  })();

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
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: fullscreen ? 'calc(env(safe-area-inset-bottom) + 132px)' : 20, zIndex: 3 }}>
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
                      <div style={{ fontSize: 15, fontWeight: 700, color: ink }}>Formation à débloquer</div>
                      <div style={{ fontSize: 12.5, color: sub, maxWidth: 300, lineHeight: 1.45 }}>Pour continuer, tu es <b>parrainé par un contributeur</b>. Le système t&apos;assigne automatiquement le <b>contributeur le plus proche</b> de toi (même hors de ta zone).</div>
                      <button type="button" onClick={unlock} disabled={busy} style={{ marginTop: 4, borderRadius: 12, padding: '11px 22px', border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>{busy ? '…' : price ? `Débloquer · ${price}` : 'Trouver mon parrain'}</button>
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

      {/* QUITTER — le deck est plein écran (sans PublicShell) ; sans ça on est PIÉGÉ dans la formation
          (Pascal 2026-08-08). Retour à la page précédente (/formation), sinon accueil formation. */}
      {/* QUITTER : seulement HORS feed (page autonome où l'on serait « piégé »). Dans le FEED, on n'est
          pas piégé (on scrolle au post suivant) → pas de bouton, ce qui évite aussi la collision avec
          le menu ☰ du feed en haut à gauche. Pascal 2026-08-14. */}
      {fullscreen && !inFeed && (
        <button type="button" onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/formation'); }} aria-label="Quitter la formation"
          style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 12, zIndex: 8, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px 7px 9px', borderRadius: 999, border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
          <ChevronLeft className="w-4 h-4" /> Quitter
        </button>
      )}

      {/* SOMMAIRE interactif — bouton toujours visible ; on tape une entrée → on saute au bon slide.
          Dans le FEED, on le descend SOUS la barre de menu du feed (~58px) pour ne pas chevaucher 🔍. */}
      <button type="button" onClick={() => setToc(true)} aria-label="Ouvrir le sommaire"
        style={{ position: 'absolute', top: inFeed ? 'calc(env(safe-area-inset-top) + 64px)' : (fullscreen ? 'calc(env(safe-area-inset-top) + 12px)' : 12), right: 12, zIndex: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
        Sommaire
      </button>

      {toc && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 12, background: light ? 'rgba(255,255,255,.985)' : 'rgba(8,9,12,.975)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: fullscreen ? 'calc(env(safe-area-inset-top) + 16px) 16px 12px' : '16px', borderBottom: `1px solid ${border}` }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: ink }}>Sommaire <span style={{ color: sub, fontWeight: 600, fontSize: 13 }}>· {modules.length} chapitres</span></div>
            <button type="button" onClick={() => setToc(false)} aria-label="Fermer le sommaire" style={{ background: 'none', border: 'none', color: ink, cursor: 'pointer', display: 'grid', placeItems: 'center', width: 32, height: 32 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div style={{ overflowY: 'auto', padding: '6px 8px calc(env(safe-area-inset-bottom) + 24px)' }}>
            {tocEntries.map((e, k) => (
              <div key={e.i}>
                {e.g && e.g !== (k > 0 ? tocEntries[k - 1].g : null) && (
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: ACCENT, padding: '14px 10px 5px' }}>{e.g}</div>
                )}
                <button type="button" onClick={() => { goTo(e.start); setToc(false); }}
                  style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 10, border: 'none', background: page === e.start ? 'rgba(124,92,255,.16)' : 'transparent', color: ink, cursor: 'pointer' }}>
                  <span style={{ flexShrink: 0, minWidth: 26, height: 22, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, borderRadius: 6, color: '#fff', background: page === e.start ? ACCENT : (light ? '#B9BECB' : 'rgba(255,255,255,.28)') }}>{e.start + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{e.label}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
