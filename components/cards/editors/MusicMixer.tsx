'use client';

/**
 * Talk2Me #422 (Pascal 2026-06-06) — Mixeur audio de l'éditeur VideoCard.
 *
 * Quand une musique est attachée, il y a 2 pistes audio : le son d'origine de
 * la vidéo + la musique. Sans mixeur, elles jouent par-dessus sans contrôle.
 * Ce mixeur donne, pour CHAQUE piste : un volume (0-100) + un mute.
 *
 * Pascal verbatim : "on peut même pas varier les volumes des médias ou les
 * muter quand ils sont en cours d'édition" + "les 2 sons dans la card finale".
 * Les volumes sont stockés dans attached_audio.meta (video_volume + volume) et
 * respectés à la lecture de la card publiée.
 */

import { Video as VideoIcon, Music2, Volume2, VolumeX } from 'lucide-react';

interface Props {
  videoVolume: number; // 0..1
  musicVolume: number; // 0..1
  onChange: (videoVolume: number, musicVolume: number) => void;
}

function Track({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const muted = value <= 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 w-5 text-white/60">{icon}</span>
      <span className="shrink-0 w-14 text-[12px] text-white/70">{label}</span>
      <button
        type="button"
        onClick={() => onChange(muted ? 1 : 0)}
        aria-label={muted ? 'Activer' : 'Couper'}
        className={
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center border ' +
          (muted
            ? 'bg-white/[0.04] border-white/10 text-white/40'
            : 'bg-red-500/15 border-red-400/30 text-red-100')
        }
      >
        {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(e) => onChange((parseInt(e.target.value, 10) || 0) / 100)}
        className="flex-1 accent-red-400"
        aria-label={`Volume ${label}`}
      />
      <span className="shrink-0 w-8 text-right text-[11px] text-white/45 tabular-nums">
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

export default function MusicMixer({ videoVolume, musicVolume, onChange }: Props) {
  return (
    <div className="mt-3 rounded-xl bg-white/[0.03] border border-white/8 p-3 space-y-2.5">
      <div className="text-[12px] text-white/70 mb-0.5">🎛️ Mixage audio</div>
      <Track
        icon={<VideoIcon className="w-4 h-4" />}
        label="Vidéo"
        value={videoVolume}
        onChange={(v) => onChange(v, musicVolume)}
      />
      <Track
        icon={<Music2 className="w-4 h-4" />}
        label="Musique"
        value={musicVolume}
        onChange={(v) => onChange(videoVolume, v)}
      />
    </div>
  );
}
