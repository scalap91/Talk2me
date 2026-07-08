'use client';

/**
 * Talk2Me — JoinButton (module « REJOINDRE », Pascal 2026-07-08). Petit îlot client
 * inséré dans le header SERVEUR de PublicShell : le CTA « Rejoindre » n'envoie plus
 * vers /signin (inutile à un visiteur Google sans compte) mais ouvre la GetAppSheet
 * pour qu'il CHOPE l'app (QR / stores / SMS). Thème CLAIR (tokens --t2m-*).
 */
import { useState } from 'react';
import GetAppSheet from './GetAppSheet';

export default function JoinButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 16px',
          borderRadius: 999,
          border: 'none',
          background: 'var(--t2m-primary)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        Rejoindre
      </button>
      <GetAppSheet open={open} onClose={() => setOpen(false)} context="join" />
    </>
  );
}
