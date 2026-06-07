'use client';

/**
 * <CallButton> — Bouton "Appeler" pour header conv P2P (Talk2Me #418).
 *
 * Pascal 2026-06-05. Bouton 📞 ou 📹 qui initie un appel Calls v2 via
 * POST /api/calls/new. Le <CallsRoot> global monté dans le layout user prend
 * ensuite la main pour afficher <OutgoingCallScreen> plein écran.
 *
 * Communique avec CallsRoot via un CustomEvent global 'ttm:call:start'
 * (évite de devoir prop-drill un setter à travers tout l'arbre).
 */
import { useState } from 'react';
import { Phone, Video } from 'lucide-react';

interface Props {
  calleeId: string;
  /** Si l'appel se déclenche depuis une conv P2P, on transporte son id. */
  convId?: string | null;
  kind?: 'audio' | 'video';
  disabled?: boolean;
  className?: string;
  /** Label optionnel pour accessibilité. */
  ariaLabel?: string;
}

export default function CallButton({
  calleeId,
  convId,
  kind = 'audio',
  disabled,
  className,
  ariaLabel,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/calls/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callee_id: calleeId,
          kind,
          conv_id: convId ?? null,
        }),
      });
      const j = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            call_id?: string;
            callee?: {
              id: string;
              username: string;
              display_name: string | null;
              avatar_url?: string | null;
            };
            error?: string;
          }
        | null;
      if (!res.ok || !j?.ok || !j.call_id || !j.callee) {
        const code = j?.error || `http_${res.status}`;
        setErr(
          code === 'not_friends'
            ? 'Pas encore amis'
            : code === 'callee_busy'
              ? 'Occupé'
              : code === 'caller_already_in_call'
                ? 'Déjà en appel'
                : 'Échec'
        );
        setTimeout(() => setErr(null), 2500);
        return;
      }
      // Dispatch global event → <CallsRoot> ouvre <OutgoingCallScreen>.
      window.dispatchEvent(
        new CustomEvent('ttm:call:start', {
          detail: {
            call_id: j.call_id,
            kind,
            callee: j.callee,
          },
        })
      );
    } catch (e) {
      console.error('[call] new', e);
      setErr('Réseau');
      setTimeout(() => setErr(null), 2500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-label={ariaLabel || (kind === 'video' ? 'Appel vidéo' : 'Appel audio')}
      title={ariaLabel || (kind === 'video' ? 'Appel vidéo' : 'Appel audio')}
      data-testid={`call-button-${kind}`}
      className={
        className ||
        'flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/85 disabled:opacity-50 transition-colors active:scale-95'
      }
    >
      {kind === 'video' ? <Video size={18} /> : <Phone size={18} />}
      {err && (
        <span
          role="status"
          className="absolute -bottom-6 right-0 text-[11px] text-rose-300 whitespace-nowrap"
        >
          {err}
        </span>
      )}
    </button>
  );
}
