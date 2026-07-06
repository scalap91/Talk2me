'use client';

/**
 * DeleteCardConfirm — Modal de confirmation suppression de card.
 *
 * Talk2Me Lot A (Pascal 2026-06-04). Doctrine [[talk2me-card-vivante]] +
 * master prompt point 14 ("supprimer un brouillon ; supprimer une Card
 * publiée").
 *
 * Props :
 *   - cardKind : 'direct_card' | 'post'
 *   - cardId   : id de la card
 *   - hard     : false par défaut (soft-delete vers /trash 30j).
 *                true depuis /trash ("Supprimer définitivement").
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, Trash2, X } from '@/lib/icons';

type CardKindCrud = 'direct_card' | 'post';

interface DeleteCardConfirmProps {
  cardKind: CardKindCrud;
  cardId: string;
  hard?: boolean;
  onCancel: () => void;
  onDeleted: () => void;
}

export default function DeleteCardConfirm({
  cardKind,
  cardId,
  hard = false,
  onCancel,
  onDeleted,
}: DeleteCardConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doDelete = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const url =
        `/api/cards/${encodeURIComponent(cardId)}?kind=${cardKind}` +
        (hard ? '&hard=1' : '');
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        onDeleted();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === 'string' ? data.error : 'Échec');
    } catch {
      setError('Erreur réseau');
    } finally {
      setBusy(false);
    }
  }, [cardKind, cardId, hard, onDeleted]);

  return (
    <>
      <button
        type="button"
        aria-label="Annuler"
        onClick={onCancel}
        className="fixed inset-0 z-[90] bg-black/65 backdrop-blur-[3px]"
        data-testid="delete-card-backdrop"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={hard ? 'Supprimer définitivement' : 'Supprimer la card'}
        data-testid="delete-card-modal"
        className={
          'fixed left-1/2 top-1/2 z-[91] -translate-x-1/2 -translate-y-1/2 w-[min(92vw,360px)] ' +
          'rounded-3xl border border-white/12 bg-[#0e0e12]/95 backdrop-blur-xl p-6 space-y-4 ' +
          'animate-in fade-in zoom-in-95 duration-150'
        }
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-red-500/12 border border-red-400/25 flex items-center justify-center text-red-300">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1">
            <h2 className="text-[16px] font-medium text-white/95">
              {hard ? 'Supprimer définitivement ?' : 'Supprimer cette card ?'}
            </h2>
            <p className="text-[12.5px] text-white/55 leading-snug mt-0.5">
              {hard
                ? 'Action irréversible. La card sera retirée de la corbeille.'
                : 'La card sera retirée de la Home, de Mes cards et du Profil. Tu peux la restaurer pendant 30 jours depuis la corbeille.'}
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            data-testid="delete-card-error"
            className="text-[12.5px] text-red-300/90 bg-red-500/8 border border-red-400/20 rounded-xl px-3 py-2"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid="delete-card-cancel"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-white/12 bg-white/[0.04] text-white/85 text-[13px] hover:bg-white/[0.08] hover:text-white transition-colors disabled:opacity-50"
          >
            <X size={14} />
            Annuler
          </button>
          <button
            type="button"
            onClick={doDelete}
            disabled={busy}
            data-testid="delete-card-confirm"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-[13px] font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} />
            {busy ? '…' : hard ? 'Supprimer définitivement' : 'Supprimer'}
          </button>
        </div>
      </div>
    </>
  );
}
