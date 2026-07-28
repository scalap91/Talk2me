'use client';

/**
 * LECTEUR FORMATION (Pascal 2026-07-28) — vue d'une card `types:['formation']` DANS le lecteur unique.
 *
 * RÈGLE D'OR (Pascal, répétée) : une formation ne fait JAMAIS une longue page verticale qui DÉPASSE l'écran
 * du feed. C'est un **DECK de pages qu'on fait défiler sur le côté** (swipe horizontal — « scroller à gauche
 * pour arriver aux autres pages »). Chaque page tient dans une hauteur BORNÉE (jamais plus que l'écran) ;
 * si un module est long, il scrolle DEDANS, la page elle ne pousse pas le feed.
 *  - Page 1 = COUVERTURE : image forte + accroche.
 *  - Page 2 = le SIMULATEUR (module accroche) — on les fait rêver direct.
 *  - Pages suivantes = les modules (genèse → mission → prise en main → métier).
 *
 * UNE PIERRE DEUX COUPS : même lecteur pour TES formations (owner=tout ouvert) et celles des autres
 * (modules payants masqués côté serveur par gateFormationForUser) → 🔒 + « Débloquer ».
 *
 * ⚠️ ARGENT = LIGNE ROUGE : « Débloquer » = unlock MVP (accès direct). Le vrai paiement (/api/commerce/buy)
 * n'est PAS branché ici tant que Pascal ne l'ouvre pas.
 */
import { useState, useRef } from 'react';
import { Lock, CheckCircle2, GraduationCap, ChevronRight } from '@/lib/icons';
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

const ACCENT = '#7C5CFF';

export default function FormationReader({ card, light = false }: { card: FormationCard; light?: boolean }) {
  const [c, setC] = useState<FormationCard>(card);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const modules = Array.isArray(c.items) ? c.items : [];
  const hasLocked = modules.some((m) => m.locked);
  const cover = c.images?.[0];
  const price = c.price?.amount && c.price.amount > 0
    ? `${c.price.amount.toLocaleString('fr-FR')} ${c.price.currency || 'Ar'}`
    : null;

  const ink = light ? '#2F343A' : '#fff';
  const sub = light ? '#6A7585' : 'rgba(255,255,255,.6)';
  const cardBg = light ? '#fff' : 'rgba(255,255,255,.04)';
  const border = light ? '#E7EAF0' : 'rgba(255,255,255,.1)';
  const pageBg = light ? '#fff' : '#0b0c10';

  // total pages = couverture + modules. Hauteur BORNÉE (ne dépasse pas l'écran du feed).
  const totalPages = 1 + modules.length;
  const H = 'min(72svh, 620px)';

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

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

  // Corps d'un module : Markdown + éventuel simulateur (marqueur) + slides.
  const ModuleBody = ({ m }: { m: Module }) => {
    const body = m.text?.body || '';
    return (
      <>
        {body.includes('[[SIMULATEUR]]')
          ? body.split('[[SIMULATEUR]]').map((chunk, ci) => (
              <div key={ci}>
                {chunk.trim() && <Markdown light={light}>{chunk}</Markdown>}
                {ci === 0 && <ContributorSimulator />}
              </div>
            ))
          : <Markdown light={light}>{body}</Markdown>}
        {Array.isArray(m.slides) && m.slides.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {m.slides.map((s, k) => (
              <div key={k} className="rounded-lg p-2.5" style={{ background: light ? '#F5F6F8' : 'rgba(255,255,255,.05)' }}>
                {s.image && <img src={s.image} alt={s.heading || ''} className="w-full rounded-md mb-1.5 object-cover" style={{ maxHeight: 160 }} />}
                {s.heading && <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>{s.heading}</div>}
                {Array.isArray(s.points) && (
                  <ul className="mt-1" style={{ fontSize: 12.5, color: sub, listStyle: 'disc', paddingLeft: 16 }}>
                    {s.points.map((p, pi) => <li key={pi}>{p}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  const Page = ({ children }: { children: React.ReactNode }) => (
    <div className="shrink-0 basis-full snap-center snap-always overflow-y-auto" style={{ height: H, background: pageBg }}>{children}</div>
  );

  return (
    <div className="w-full rounded-2xl overflow-hidden border relative" style={{ borderColor: border, background: cardBg }}>
      <div ref={scroller} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {/* PAGE 1 — COUVERTURE : image forte + accroche */}
        <Page>
          <div className="flex flex-col h-full">
            {cover && <img src={cover} alt={c.title || 'Formation'} className="w-full object-cover" style={{ height: '46%', minHeight: 150 }} />}
            <div className="p-4 flex-1 flex flex-col">
              <span className="inline-flex items-center gap-1 self-start" style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: ACCENT, background: 'rgba(124,92,255,.12)' }}><GraduationCap className="w-3.5 h-3.5" /> FORMATION · {modules.length} modules</span>
              <div className="mt-2" style={{ fontSize: 20, fontWeight: 800, color: ink, lineHeight: 1.15 }}>{c.title || 'Formation'}</div>
              {c.text?.body && <div className="mt-2" style={{ fontSize: 14, color: sub, lineHeight: 1.5 }}>{c.text.body}</div>}
              <div className="flex-1" />
              <button type="button" onClick={(e) => { e.stopPropagation(); goTo(1); }}
                className="mt-3 w-full rounded-xl py-3 font-bold active:scale-[0.99] transition inline-flex items-center justify-center gap-1.5"
                style={{ background: ACCENT, color: '#fff', fontSize: 15 }}>
                {hasLocked && price ? `Commencer · ${price}` : 'Commencer'} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Page>

        {/* PAGES MODULES — une page par module, swipe latéral */}
        {modules.map((m, i) => {
          const readable = !m.locked && !!m.text?.body;
          return (
            <Page key={m.id || i}>
              <div className="p-4">
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 30, height: 30, fontSize: 13, fontWeight: 800, color: '#fff', background: ACCENT }}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div style={{ fontSize: 16, fontWeight: 800, color: ink, lineHeight: 1.2 }}>{m.title || `Module ${i + 1}`}</div>
                    {m.source?.label && <div style={{ fontSize: 12.5, color: sub }}>{m.source.label}</div>}
                  </div>
                  {m.free && !m.locked && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, color: '#16A34A', background: 'rgba(22,163,74,.12)' }}>GRATUIT</span>}
                </div>

                <div className="mt-3">
                  {readable ? <ModuleBody m={m} /> : (
                    <div className="grid place-items-center text-center py-10 gap-2">
                      <Lock className="w-8 h-8" style={{ color: sub }} />
                      <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>Module verrouillé</div>
                      {m.source?.label && <div style={{ fontSize: 13, color: sub }}>{m.source.label}</div>}
                      <button type="button" onClick={unlock} disabled={busy}
                        className="mt-2 rounded-xl px-5 py-2.5 font-bold active:scale-[0.99] transition disabled:opacity-60"
                        style={{ background: ACCENT, color: '#fff', fontSize: 14 }}>
                        {busy ? '…' : price ? `Débloquer · ${price}` : 'Débloquer la formation'}
                      </button>
                      <div className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: sub }}><CheckCircle2 className="w-3.5 h-3.5" /> Accès à vie une fois débloqué</div>
                      {err && <div style={{ fontSize: 12, color: '#E24C4C' }}>{err}</div>}
                    </div>
                  )}
                </div>
              </div>
            </Page>
          );
        })}
      </div>

      {/* PAGINATION — points + hint « swipe » (ne dépasse pas, tout est dans la hauteur bornée au-dessus) */}
      <div className="flex items-center justify-center gap-1.5 py-2.5" style={{ background: pageBg, borderTop: `1px solid ${border}` }}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <button key={i} type="button" aria-label={`Page ${i + 1}`} onClick={() => goTo(i)}
            style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 999, border: 'none', padding: 0, cursor: 'pointer', transition: 'width .2s', background: i === page ? ACCENT : (light ? '#D4D8DE' : 'rgba(255,255,255,.25)') }} />
        ))}
        <span className="ml-2" style={{ fontSize: 11, color: sub }}>{page + 1}/{totalPages}</span>
      </div>
    </div>
  );
}
