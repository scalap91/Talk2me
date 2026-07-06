'use client';

/**
 * Boutons d'action partagés pour le CallModal Phase 4.
 *
 * Design premium : ronds, glassy, accents subtils. Pas de gradient violent.
 * Vert = accepter, rouge = raccrocher/refuser, blanc neutre = mute toggles.
 */

import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2 } from '@/lib/icons';

interface BaseProps {
  onClick: () => void;
  label: string;
  active?: boolean; // pour les toggles : true = "on" (état actif)
}

function RoundButton({
  onClick,
  label,
  className,
  children,
}: BaseProps & { className: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center w-14 h-14 rounded-full transition-all active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

export function AcceptButton({ onClick }: { onClick: () => void }) {
  return (
    <RoundButton
      onClick={onClick}
      label="Accepter"
      className="bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_4px_16px_rgba(16,185,129,0.35)]"
    >
      <Phone size={22} />
    </RoundButton>
  );
}

export function DeclineButton({ onClick, label = 'Refuser' }: { onClick: () => void; label?: string }) {
  return (
    <RoundButton
      onClick={onClick}
      label={label}
      className="bg-rose-500 hover:bg-rose-400 text-white shadow-[0_4px_16px_rgba(244,63,94,0.35)]"
    >
      <PhoneOff size={22} />
    </RoundButton>
  );
}

export function HangupButton({ onClick }: { onClick: () => void }) {
  return (
    <RoundButton
      onClick={onClick}
      label="Raccrocher"
      className="bg-rose-500 hover:bg-rose-400 text-white shadow-[0_4px_16px_rgba(244,63,94,0.35)]"
    >
      <PhoneOff size={22} />
    </RoundButton>
  );
}

export function MicToggle({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <RoundButton
      onClick={onClick}
      label={muted ? 'Activer micro' : 'Couper micro'}
      className={
        muted
          ? 'bg-white/90 text-black hover:bg-white'
          : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'
      }
    >
      {muted ? <MicOff size={20} /> : <Mic size={20} />}
    </RoundButton>
  );
}

export function CamToggle({ off, onClick }: { off: boolean; onClick: () => void }) {
  return (
    <RoundButton
      onClick={onClick}
      label={off ? 'Activer caméra' : 'Couper caméra'}
      className={
        off
          ? 'bg-white/90 text-black hover:bg-white'
          : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'
      }
    >
      {off ? <VideoOff size={20} /> : <Video size={20} />}
    </RoundButton>
  );
}

export function SpeakerToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <RoundButton
      onClick={onClick}
      label={active ? 'Désactiver haut-parleur' : 'Activer haut-parleur'}
      className={
        active
          ? 'bg-white/90 text-black hover:bg-white'
          : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'
      }
    >
      <Volume2 size={20} />
    </RoundButton>
  );
}
