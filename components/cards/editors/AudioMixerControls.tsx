'use client';

/**
 * AudioMixerControls — sliders volume vidéo / volume musique / offset.
 *
 * Talk2Me #420.
 */

import React from 'react';

interface Props {
  videoVolume: number;       // 0–100
  audioVolume: number;       // 0–100
  audioOffsetSec: number;    // ≥ 0
  /** Durée max de la vidéo, pour borner l'offset. */
  videoDurationS: number;
  onChange: (patch: {
    video_volume?: number;
    audio_volume?: number;
    audio_offset_sec?: number;
  }) => void;
}

export default function AudioMixerControls({
  videoVolume,
  audioVolume,
  audioOffsetSec,
  videoDurationS,
  onChange,
}: Props) {
  const maxOffset = videoDurationS > 0 ? Math.max(0, videoDurationS - 0.5) : 30;

  return (
    <div className="space-y-3" data-testid="audio-mixer-controls">
      <SliderRow
        label="Volume vidéo"
        value={videoVolume}
        min={0}
        max={100}
        step={5}
        suffix="%"
        onChange={(v) => onChange({ video_volume: v })}
        testid="slider-video-volume"
      />
      <SliderRow
        label="Volume musique"
        value={audioVolume}
        min={0}
        max={100}
        step={5}
        suffix="%"
        onChange={(v) => onChange({ audio_volume: v })}
        testid="slider-audio-volume"
      />
      <SliderRow
        label="Début musique"
        value={audioOffsetSec}
        min={0}
        max={Math.ceil(maxOffset)}
        step={0.5}
        suffix="s"
        onChange={(v) => onChange({ audio_offset_sec: v })}
        testid="slider-audio-offset"
        format={(v) => v.toFixed(1)}
      />
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  testid,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
  testid?: string;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : Math.round(value).toString();
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-white/55 mb-1">
        <span>{label}</span>
        <span className="text-white/80 tabular-nums">
          {display}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-red-400"
        data-testid={testid}
      />
    </div>
  );
}
