'use client';

/**
 * Talk2Me — ReportSheet (Pascal 2026-06-24, prépa App Store / Apple 1.2).
 * Feuille de signalement réutilisable (utilisateur OU contenu). On choisit un motif,
 * `onSubmit(reason)` POST le signalement, accusé de réception "traité sous 24h".
 */
import { useState } from 'react';
import { Flag, X, Loader2 } from '@/lib/icons';

const REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam / publicité' },
  { value: 'harcelement', label: 'Harcèlement / intimidation' },
  { value: 'contenu_sexuel', label: 'Contenu sexuel / nudité' },
  { value: 'violence', label: 'Violence' },
  { value: 'arnaque', label: 'Arnaque / fraude' },
  { value: 'haine', label: 'Discours haineux' },
  { value: 'autre', label: 'Autre' },
];

export default function ReportSheet({
  title = 'Signaler',
  onSubmit,
  onClose,
}: {
  title?: string;
  onSubmit: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const pick = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    const ok = await onSubmit(reason).catch(() => false);
    setBusy(false);
    if (ok) { setDone(true); setTimeout(onClose, 1200); }
  };

  return (
    <div
      className="fixed inset-0 z-[140] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-5"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full sm:max-w-sm bg-[#15151c] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-[16px] inline-flex items-center gap-2">
            <Flag size={18} className="text-red-300" /> {title}
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/70">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <p className="text-center text-emerald-300 text-[14px] py-6 leading-relaxed">
            ✅ Merci. Ton signalement a été envoyé — notre équipe le traite sous 24h.
          </p>
        ) : (
          <>
            <p className="text-white/55 text-[12.5px] mb-3">Pourquoi signales-tu ?</p>
            <div className="space-y-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(r.value)}
                  className="w-full text-left px-3.5 h-11 rounded-xl border border-white/10 bg-white/[0.04] text-white/85 text-[14px] hover:bg-white/[0.08] disabled:opacity-50 transition-colors"
                >
                  {r.label}
                </button>
              ))}
            </div>
            {busy && <div className="flex justify-center pt-3 text-white/50"><Loader2 className="w-5 h-5 animate-spin" /></div>}
          </>
        )}
      </div>
    </div>
  );
}
