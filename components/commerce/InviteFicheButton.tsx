'use client';

/**
 * InviteFicheButton — « Inviter sur T2M » posé sur N'IMPORTE QUELLE fiche (Pascal 2026-08-30).
 * Fais découvrir l'appli par ta boutique/resto/service/… : ouvre le partage natif (WhatsApp/mail/
 * SMS/QR via GetAppSheet, context='invite') avec le lien /i/<public_key>. À la 1re ouverture chez
 * l'invité, la fiche sera mise en favori + Enregistrées et l'invitation attribuée au parrain.
 * Générique : brancher un nouveau type de fiche = passer sa public_key, rien d'autre.
 */
import { useState } from 'react';
import GetAppSheet from '@/components/public/GetAppSheet';

export default function InviteFicheButton({ publicKey, className, label = 'Inviter' }: { publicKey: string; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/i/${encodeURIComponent(publicKey)}` : `/i/${publicKey}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Inviter sur Talk2Me"
        className={className || 'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-semibold text-white bg-[#16A34A] active:scale-95'}
      >
        <span aria-hidden>📣</span> {label}
      </button>
      <GetAppSheet open={open} onClose={() => setOpen(false)} context="invite" shareUrl={url} />
    </>
  );
}
