'use client';

/**
 * LECTEUR FORMATION (Pascal 2026-07-28) — la vue d'une card `types:['formation']` DANS le lecteur unique.
 * Une formation n'est PAS une grille de produits : c'est une LISTE ORDONNÉE de modules. Chaque module est
 * soit 🔓 lisible (gratuit ou débloqué → contenu Markdown + slides), soit 🔒 verrouillé (contenu masqué
 * CÔTÉ SERVEUR par gateFormationForUser) avec un bouton « Débloquer ».
 *
 * RÈGLE D'OR (Pascal) : dans le FEED, une card ne DÉPASSE JAMAIS l'écran (sinon on ne peut plus passer au
 * post suivant). Donc ici : carte COMPACTE (cover + titre + nb modules + CTA) qui tient sur une page ; la
 * LISTE complète des modules s'ouvre au TAP dans une feuille plein écran (comme « Voir tout » de la boutique).
 *
 * UNE PIERRE DEUX COUPS : le même lecteur sert TES formations (owner → tout ouvert) ET celles des autres
 * (modules payants masqués). Le serveur décide par spectateur ; le client ne fait que peindre l'état reçu.
 *
 * ⚠️ ARGENT = LIGNE ROUGE : « Débloquer » appelle l'unlock MVP (accès direct). Le VRAI paiement passera par
 * le rail unique /api/commerce/buy — NON branché ici tant que Pascal ne l'ouvre pas.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Lock, ChevronDown, CheckCircle2, Play, GraduationCap } from '@/lib/icons';
import Markdown from '@/components/cards/Markdown';
import ContributorSimulator from '@/components/formation/ContributorSimulator';

interface Slide { heading?: string; points?: string[]; image?: string }
interface Module {
  id?: string;
  title?: string;
  free?: boolean;
  locked?: boolean;
  source?: { label?: string };  // résumé/objectif du module
  text?: { body?: string };     // contenu (retiré par le gating si verrouillé)
  slides?: Slide[];
}
export interface FormationCard {
  id?: string;
  title?: string;
  images?: string[];
  text?: { body?: string };
  price?: { amount?: number; currency?: string };
  items?: Module[];
}

const ACCENT = '#7C5CFF';

export default function FormationReader({ card, light = false }: { card: FormationCard; light?: boolean }) {
  const [c, setC] = useState<FormationCard>(card);
  const [open, setOpen] = useState<number | null>(0);     // 1er module AUTO-OUVERT (l'accroche/simulateur frappe direct)
  const [full, setFull] = useState(false);                 // feuille plein écran ouverte ?
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const modules = Array.isArray(c.items) ? c.items : [];
  const hasLocked = modules.some((m) => m.locked);
  const freeCount = modules.filter((m) => m.free).length;
  const cover = c.images?.[0];
  const price = c.price?.amount && c.price.amount > 0
    ? `${c.price.amount.toLocaleString('fr-FR')} ${c.price.currency || 'Ar'}`
    : null;

  const ink = light ? '#2F343A' : '#fff';
  const sub = light ? '#6A7585' : 'rgba(255,255,255,.6)';
  const cardBg = light ? '#fff' : 'rgba(255,255,255,.03)';
  const border = light ? '#E7EAF0' : 'rgba(255,255,255,.1)';

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

  // ── La liste des modules (utilisée DANS la feuille plein écran uniquement) ──
  const ModulesList = () => (
    <ul className="flex flex-col gap-2">
      {modules.map((m, i) => {
        const readable = !m.locked && !!m.text?.body;
        const isOpen = open === i;
        return (
          <li key={m.id || i} className="rounded-xl border overflow-hidden" style={{ borderColor: border }}>
            <button
              type="button"
              onClick={() => { if (readable) setOpen(isOpen ? null : i); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
              style={{ background: light ? '#FBFBFD' : 'rgba(255,255,255,.02)', cursor: readable ? 'pointer' : 'default' }}
            >
              <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 26, height: 26, fontSize: 12.5, fontWeight: 800, color: readable ? '#fff' : sub, background: readable ? ACCENT : (light ? '#EDEFF3' : 'rgba(255,255,255,.08)') }}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 14, fontWeight: 700, color: ink }}>{m.title || `Module ${i + 1}`}</span>
                {m.source?.label && <span className="block truncate" style={{ fontSize: 12, color: sub }}>{m.source.label}</span>}
              </span>
              {m.free && !m.locked && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, color: '#16A34A', background: 'rgba(22,163,74,.12)' }}>GRATUIT</span>}
              {readable
                ? (isOpen ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: sub, transform: 'rotate(180deg)' }} /> : <Play className="w-[18px] h-[18px] shrink-0" style={{ color: ACCENT }} />)
                : <Lock className="w-4 h-4 shrink-0" style={{ color: sub }} />}
            </button>
            {readable && isOpen && (
              <div className="px-3.5 py-3" style={{ borderTop: `1px solid ${border}` }}>
                {/* Marqueur [[SIMULATEUR]] : on peint le simulateur de revenus DANS le module (page 2 = les faire rêver). */}
                {m.text!.body!.includes('[[SIMULATEUR]]')
                  ? m.text!.body!.split('[[SIMULATEUR]]').map((chunk, ci) => (
                      <div key={ci}>
                        {chunk.trim() && <Markdown light={light}>{chunk}</Markdown>}
                        {ci === 0 && <ContributorSimulator />}
                      </div>
                    ))
                  : <Markdown light={light}>{m.text!.body!}</Markdown>}
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
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* CARTE COMPACTE (feed) — tient sur une page, ne déborde JAMAIS. */}
      <div className="w-full rounded-2xl overflow-hidden border" style={{ borderColor: border, background: cardBg }}>
        {cover && <img src={cover} alt={c.title || 'Formation'} className="w-full h-40 object-cover" />}
        <div className="p-3.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1" style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: ACCENT, background: 'rgba(124,92,255,.12)' }}><GraduationCap className="w-3.5 h-3.5" /> FORMATION</span>
            <span style={{ fontSize: 12, color: sub }}>{modules.length} module{modules.length > 1 ? 's' : ''}{freeCount > 0 ? ` · ${freeCount} gratuit${freeCount > 1 ? 's' : ''}` : ''}</span>
          </div>
          <div className="mt-1.5" style={{ fontSize: 17, fontWeight: 800, color: ink }}>{c.title || 'Formation'}</div>
          {c.text?.body && (
            <div className="mt-1" style={{ fontSize: 13, color: sub, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.text.body}</div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFull(true); }}
            className="mt-3 w-full rounded-xl py-3 font-bold active:scale-[0.99] transition"
            style={{ background: ACCENT, color: '#fff', fontSize: 14.5 }}
          >
            {hasLocked && price ? `Voir la formation · ${price}` : 'Voir la formation'}
          </button>
        </div>
      </div>

      {/* FEUILLE PLEIN ÉCRAN — la LISTE complète des modules (s'ouvre au tap, scroll DEDANS). */}
      {full && typeof document !== 'undefined' && createPortal(
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} onClick={() => setFull(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, height: '92dvh', overflowY: 'auto', background: light ? '#fff' : '#0b0c10', borderRadius: '18px 18px 0 0' }}>
            {cover && <img src={cover} alt="" className="w-full h-36 object-cover" />}
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1" style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: ACCENT, background: 'rgba(124,92,255,.12)' }}><GraduationCap className="w-3.5 h-3.5" /> FORMATION</span>
                  <div className="mt-1.5" style={{ fontSize: 18, fontWeight: 800, color: ink }}>{c.title || 'Formation'}</div>
                </div>
                <button type="button" onClick={() => setFull(false)} style={{ background: 'transparent', border: 'none', fontSize: 22, color: sub, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
              {c.text?.body && <div className="mt-1 mb-3" style={{ fontSize: 13, color: sub, lineHeight: 1.5 }}>{c.text.body}</div>}
              <ModulesList />

              {hasLocked && (
                <div className="mt-3.5">
                  <button type="button" onClick={unlock} disabled={busy}
                    className="w-full rounded-xl py-3 font-bold active:scale-[0.99] transition disabled:opacity-60"
                    style={{ background: ACCENT, color: '#fff', fontSize: 14.5 }}>
                    {busy ? '…' : price ? `Débloquer la formation · ${price}` : 'Débloquer la formation'}
                  </button>
                  <div className="mt-1.5 flex items-center justify-center gap-1" style={{ fontSize: 11.5, color: sub }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Accès à vie une fois débloqué
                  </div>
                  {err && <div className="mt-1 text-center" style={{ fontSize: 12, color: '#E24C4C' }}>{err}</div>}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>, document.body)}
    </>
  );
}
