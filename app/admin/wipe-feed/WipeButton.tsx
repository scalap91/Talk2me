'use client';

import { useState } from 'react';

type Result = { ok?: boolean; deleted?: { cards: number; unified: number; likes: number; comments: number }; error?: string };

export default function WipeButton() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run() {
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch('/api/cards/wipe-feed?confirm=VIRE-TOUT', { method: 'POST' });
      setRes(await r.json());
    } catch {
      setRes({ error: 'network' });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (res?.ok) {
    const d = res.deleted!;
    return (
      <div style={{ fontSize: 14 }}>
        <p style={{ color: '#10b981', fontWeight: 600, marginBottom: 8 }}>✅ Feed vidé — on part propre.</p>
        <ul style={{ color: '#d4d4d8', lineHeight: 1.6 }}>
          <li>{d.cards} cards supprimées</li>
          <li>{d.unified} miroirs unified_posts</li>
          <li>{d.likes} likes · {d.comments} commentaires</li>
        </ul>
        <p style={{ color: '#888', fontSize: 12, marginTop: 12 }}>
          Tout nouveau post sera désormais du <code>.card</code> propre, lu nativement par le feed.
        </p>
        <a href="/home" style={{ color: '#f87171', fontSize: 13 }}>→ Voir le feed</a>
      </div>
    );
  }

  return (
    <div style={{ fontSize: 14 }}>
      {res?.error && (
        <p style={{ color: '#ef4444', marginBottom: 12 }}>
          Erreur : {res.error}{res.error === 'forbidden' ? ' (tu n\'es pas connecté en super-admin)' : ''}
        </p>
      )}
      {!confirming ? (
        <button onClick={() => setConfirming(true)} style={btnDanger}>
          Vider le feed
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ color: '#fbbf24' }}>
            ⚠️ Irréversible. Supprime tous les posts sociaux du feed (image/vidéo/texte).
            Garde produits de boutique, brouillons, conversations. Confirmer ?
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={run} disabled={busy} style={btnDanger}>
              {busy ? 'Suppression…' : 'Oui, VIRE TOUT'}
            </button>
            <button onClick={() => setConfirming(false)} disabled={busy} style={btnGhost}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnDanger: React.CSSProperties = {
  background: '#dc2626',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: 'transparent',
  color: '#d4d4d8',
  border: '1px solid #333',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 14,
  cursor: 'pointer',
};
