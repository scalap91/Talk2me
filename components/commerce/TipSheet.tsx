'use client';

/**
 * TipSheet — envoyer un POURBOIRE à un user (Pascal 2026-07-14). MGA = entier (1 Ar = 1).
 * Réutilise le rail vérifié : POST /api/commerce/tip → escrow + commission plateforme + PaPi.
 * Depuis le chat (bouton dans ConversationHeader). Montants préréglés + libre.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Gift, Loader2 } from '@/lib/icons';
import { formatMoney } from '@/lib/money';

const PRESETS = [1000, 2000, 5000, 10000]; // Ariary (MGA = 1:1, pas de sous-unité)

export default function TipSheet({ open, toUserId, toName, onClose }: { open: boolean; toUserId: string; toName: string; onClose: () => void }) {
  const [amount, setAmount] = useState<number>(2000);
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || typeof document === 'undefined') return null;

  const value = custom.trim() ? Math.max(0, Math.round(Number(custom.replace(/[^0-9]/g, '')) || 0)) : amount;

  const send = async () => {
    if (sending || value <= 0) return;
    setSending(true); setError(null);
    try {
      const res = await fetch('/api/commerce/tip', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, amountCents: value }),
      });
      const d = await res.json();
      if (d?.needs_mobile_auth) { setError('Valide le paiement sur ton mobile pour continuer.'); return; }
      if (!res.ok || !d?.ok) { setError('Paiement impossible pour le moment.'); return; }
      // Paiement en cours → page PaPi ; sinon (solde) c'est déjà réglé.
      if (d.checkout_url) { window.location.href = d.checkout_url as string; return; }
      onClose();
    } catch {
      setError('Réseau indisponible.');
    } finally { setSending(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center" onClick={onClose} role="dialog" aria-label="Envoyer un pourboire">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-black/45" />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} className="relative w-full max-w-[440px] bg-white rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#E7EAF0]">
          <Gift size={22} className="text-[#EC4899]" />
          <h2 className="text-[17px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Pourboire à {toName}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto text-[#9DAAB7] active:scale-95 text-[20px] leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((p) => {
              const on = !custom.trim() && amount === p;
              return (
                <button key={p} type="button" onClick={() => { setCustom(''); setAmount(p); }}
                  className={'py-2.5 rounded-xl text-[13.5px] font-semibold border transition ' + (on ? 'bg-[#EC4899] text-white border-[#EC4899]' : 'bg-[#F5F6F8] text-[#2F343A] border-[#E7EAF0]')}>
                  {p.toLocaleString('fr-FR')}
                </button>
              );
            })}
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Montant libre (Ar)</label>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="numeric" placeholder="Ex : 3000"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EC4899]/50" />
          </div>
          <p className="text-[12px] text-[#9DAAB7]">Le pourboire passe par le paiement sécurisé (PaPi/MVola). Une petite commission plateforme s&apos;applique.</p>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
        </div>

        <div className="px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-[#E7EAF0]">
          <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={send} disabled={sending || value <= 0}
            className="w-full py-3 rounded-xl text-[15px] font-semibold text-white bg-[#EC4899] disabled:opacity-40 inline-flex items-center justify-center gap-2 active:scale-[0.99]">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            Envoyer {formatMoney(value, 'MGA')}
          </motion.button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
