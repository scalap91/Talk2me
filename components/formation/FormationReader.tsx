'use client';

/**
 * LECTEUR FORMATION (Pascal 2026-07-28) — la vue d'une card `types:['formation']` DANS le lecteur unique.
 * Une formation n'est PAS une grille de produits (variant boutique) : c'est une LISTE ORDONNÉE de modules.
 * Chaque module est soit 🔓 lisible (gratuit ou débloqué → contenu Markdown + slides), soit 🔒 verrouillé
 * (résumé visible, contenu masqué CÔTÉ SERVEUR par gateFormationForUser) avec un bouton « Débloquer ».
 *
 * UNE PIERRE DEUX COUPS : le même lecteur sert TES formations (owner → tout ouvert) ET celles des autres
 * (modules payants masqués). Le serveur décide par spectateur ; le client ne fait que peindre l'état reçu.
 *
 * ⚠️ ARGENT = LIGNE ROUGE : « Débloquer » appelle l'unlock MVP (accès direct, /api/formation/:id/unlock).
 * Le VRAI paiement passera par le rail unique /api/commerce/buy — NON branché ici tant que Pascal ne l'ouvre pas.
 */
import { useState } from 'react';
import { Lock, ChevronDown, CheckCircle2, Play } from '@/lib/icons';
import Markdown from '@/components/cards/Markdown';

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

export default function FormationReader({ card, light = false }: { card: FormationCard; light?: boolean }) {
  const [c, setC] = useState<FormationCard>(card);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const modules = Array.isArray(c.items) ? c.items : [];
  const hasLocked = modules.some((m) => m.locked);
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
      // On RE-DEMANDE la card au serveur → elle revient débloquée (contenu des modules rétabli).
      const fresh = await fetch(`/api/formation/${encodeURIComponent(c.id)}`, { cache: 'no-store' }).then((x) => x.json());
      if (fresh?.ok && fresh.card) setC(fresh.card as FormationCard);
    } catch { setErr('Réseau.'); } finally { setBusy(false); }
  };

  return (
    <div className="w-full rounded-2xl overflow-hidden border" style={{ borderColor: border, background: cardBg }}>
      {cover && <img src={cover} alt={c.title || 'Formation'} className="w-full h-40 object-cover" />}
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: '#7C5CFF', background: 'rgba(124,92,255,.12)' }}>🎓 FORMATION</span>
          <span style={{ fontSize: 12, color: sub }}>{modules.length} module{modules.length > 1 ? 's' : ''}</span>
        </div>
        <div className="mt-1.5" style={{ fontSize: 17, fontWeight: 800, color: ink }}>{c.title || 'Formation'}</div>
        {c.text?.body && <div className="mt-1" style={{ fontSize: 13, color: sub, lineHeight: 1.5 }}>{c.text.body}</div>}

        {/* LISTE ORDONNÉE des modules */}
        <ul className="mt-3 flex flex-col gap-2">
          {modules.map((m, i) => {
            const readable = !m.locked && !!m.text?.body;
            const isOpen = open === i;
            return (
              <li key={m.id || i} className="rounded-xl border overflow-hidden" style={{ borderColor: border }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (readable) setOpen(isOpen ? null : i); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                  style={{ background: light ? '#FBFBFD' : 'rgba(255,255,255,.02)', cursor: readable ? 'pointer' : 'default' }}
                >
                  <span className="shrink-0 grid place-items-center rounded-full" style={{ width: 26, height: 26, fontSize: 12.5, fontWeight: 800, color: readable ? '#fff' : sub, background: readable ? '#7C5CFF' : (light ? '#EDEFF3' : 'rgba(255,255,255,.08)') }}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: 14, fontWeight: 700, color: ink }}>{m.title || `Module ${i + 1}`}</span>
                    {m.source?.label && <span className="block truncate" style={{ fontSize: 12, color: sub }}>{m.source.label}</span>}
                  </span>
                  {m.free && !m.locked && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, color: '#16A34A', background: 'rgba(22,163,74,.12)' }}>GRATUIT</span>}
                  {readable ? (
                    isOpen ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: sub, transform: 'rotate(180deg)' }} /> : <Play className="w-[18px] h-[18px] shrink-0" style={{ color: '#7C5CFF' }} />
                  ) : (
                    <Lock className="w-4 h-4 shrink-0" style={{ color: sub }} />
                  )}
                </button>
                {readable && isOpen && (
                  <div className="px-3.5 py-3" style={{ borderTop: `1px solid ${border}` }}>
                    <Markdown light={light}>{m.text!.body!}</Markdown>
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

        {/* CTA DÉBLOQUER — seulement s'il reste des modules verrouillés (donc : ni owner ni déjà acheté). */}
        {hasLocked && (
          <div className="mt-3.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); unlock(); }}
              disabled={busy}
              className="w-full rounded-xl py-3 font-bold active:scale-[0.99] transition disabled:opacity-60"
              style={{ background: '#7C5CFF', color: '#fff', fontSize: 14.5 }}
            >
              {busy ? '…' : price ? `Débloquer la formation · ${price}` : 'Débloquer la formation'}
            </button>
            <div className="mt-1.5 flex items-center justify-center gap-1" style={{ fontSize: 11.5, color: sub }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Accès à vie une fois débloqué
            </div>
            {err && <div className="mt-1 text-center" style={{ fontSize: 12, color: '#E24C4C' }}>{err}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
