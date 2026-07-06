'use client';

/**
 * AudioPickerTab — onglet "🎵 Musique" de l'éditeur VideoCard.
 *
 * Talk2Me #420.
 *
 * Doctrine [[talk2me-card-editor-ia]] : humain valide.
 * Doctrine [[talktome-design-premium]] : dark sobre, accents violet subtils.
 *
 * Sous-onglets :
 *  - 📁 Lib : AudioLibraryBrowser
 *  - ⬆️ Upload : <input type="file"> (mp3/m4a/wav)
 *
 * Au-dessous :
 *  - Sélection courante (nom track + bouton ✕ pour retirer)
 *  - AudioMixerControls (sliders volumes + offset)
 *  - [Preview] (génère MP4 temp et le passe au callback)
 */

import React, { useRef, useState } from 'react';
import { Music, Upload, X, Loader2, Eye } from '@/lib/icons';
import AudioLibraryBrowser, { type LibTrack } from './AudioLibraryBrowser';
import AudioMixerControls from './AudioMixerControls';
import { useCardDraftStore, type VideoAudio } from '@/lib/card-draft-store';

interface Props {
  /** URL de la vidéo source (pour la preview ffmpeg). */
  videoUrl: string | null;
  /** Durée totale de la vidéo (s). */
  videoDurationS: number;
  /** Callback déclenché par "Preview" : passe l'URL du MP4 temp mixé. */
  onPreview?: (mixedVideoUrl: string) => void;
}

const ACCEPTED_AUDIO_MIME = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
];

const MAX_UPLOAD_MB = 20;

export default function AudioPickerTab({
  videoUrl,
  videoDurationS,
  onPreview,
}: Props) {
  const [sub, setSub] = useState<'lib' | 'upload'>('lib');
  const [uploading, setUploading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const draft = useCardDraftStore((s) => s.draft);
  const setAudio = useCardDraftStore((s) => s.setAudio);
  const updateAudio = useCardDraftStore((s) => s.updateAudio);
  const clearAudio = useCardDraftStore((s) => s.clearAudio);

  const audio = draft?.audio ?? null;
  const selectedLibId =
    audio && audio.source === 'lib' ? audio.audio_id ?? null : null;

  const handleSelectLib = (track: LibTrack) => {
    const next: VideoAudio = {
      source: 'lib',
      audio_id: track.id,
      audio_name: track.name,
      audio_url: track.file,
      audio_duration_s: track.duration_sec,
      video_volume: audio?.video_volume ?? 80,
      audio_volume: audio?.audio_volume ?? 60,
      audio_offset_sec: audio?.audio_offset_sec ?? 0,
    };
    setAudio(next);
  };

  const handleUpload = async (file: File) => {
    setError(null);
    if (!ACCEPTED_AUDIO_MIME.includes((file.type || '').toLowerCase())) {
      setError('Format audio non supporté (mp3, m4a, wav, ogg).');
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Fichier trop lourd (max ${MAX_UPLOAD_MB} Mo).`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || 'Upload échoué');
      }
      const next: VideoAudio = {
        source: 'upload',
        audio_id: null,
        audio_name: file.name,
        audio_url: json.url,
        audio_duration_s: null,
        video_volume: audio?.video_volume ?? 80,
        audio_volume: audio?.audio_volume ?? 60,
        audio_offset_sec: audio?.audio_offset_sec ?? 0,
      };
      setAudio(next);
    } catch (e: any) {
      setError(e?.message || 'Upload échoué');
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async () => {
    if (!audio || !videoUrl) return;
    setError(null);
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/cards/editor/add-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_path: videoUrl,
          audio_source: audio.source,
          audio_id: audio.audio_id ?? undefined,
          audio_path: audio.source === 'upload' ? audio.audio_url : undefined,
          audio_url: audio.audio_url,
          video_volume: audio.video_volume,
          audio_volume: audio.audio_volume,
          audio_offset_sec: audio.audio_offset_sec,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.detail || json?.error || 'Preview échouée');
      }
      onPreview?.(json.preview_url);
    } catch (e: any) {
      setError(e?.message || 'Preview échouée');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div
      className="space-y-3"
      data-testid="audio-picker-tab"
      data-audio-selected={audio ? 'yes' : 'no'}
    >
      {/* Sous-onglets Lib / Upload */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setSub('lib')}
          className={
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors ' +
            (sub === 'lib'
              ? 'bg-white/[0.10] border border-white/15 text-white'
              : 'bg-white/[0.03] border border-white/8 text-white/60 hover:text-white')
          }
          data-testid="audio-sub-lib"
        >
          <Music className="w-3.5 h-3.5" />
          Bibliothèque
        </button>
        <button
          type="button"
          onClick={() => setSub('upload')}
          className={
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors ' +
            (sub === 'upload'
              ? 'bg-white/[0.10] border border-white/15 text-white'
              : 'bg-white/[0.03] border border-white/8 text-white/60 hover:text-white')
          }
          data-testid="audio-sub-upload"
        >
          <Upload className="w-3.5 h-3.5" />
          Mon fichier
        </button>
      </div>

      {sub === 'lib' && (
        <AudioLibraryBrowser
          selectedId={selectedLibId}
          onSelect={handleSelectLib}
        />
      )}

      {sub === 'upload' && (
        <div className="rounded-2xl bg-white/[0.02] border border-dashed border-white/15 p-5 flex flex-col items-center justify-center gap-2 text-center">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 rounded-full bg-white/[0.08] border border-white/12 text-white text-sm flex items-center gap-2 disabled:opacity-40"
            data-testid="audio-upload-btn"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {uploading ? 'Upload…' : 'Choisir un fichier'}
          </button>
          <span className="text-[11px] text-white/40">
            mp3, m4a, wav, ogg — max {MAX_UPLOAD_MB} Mo
          </span>
          <a
            href="/credits/audio"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-white/40 underline mt-1"
          >
            ⓘ Crédits & licences
          </a>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_AUDIO_MIME.join(',')}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.currentTarget.value = '';
            }}
          />
        </div>
      )}

      {/* Sélection courante + sliders */}
      {audio && (
        <div
          className="rounded-2xl bg-red-500/8 border border-red-300/20 p-3 space-y-3"
          data-testid="audio-selection"
        >
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-red-200" />
            <span className="flex-1 text-[13px] text-white/90 truncate">
              {audio.audio_name || 'Musique sélectionnée'}
            </span>
            <button
              type="button"
              onClick={() => clearAudio()}
              className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/12 text-white/70 hover:text-white flex items-center justify-center"
              aria-label="Retirer la musique"
              data-testid="audio-clear-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <AudioMixerControls
            videoVolume={audio.video_volume}
            audioVolume={audio.audio_volume}
            audioOffsetSec={audio.audio_offset_sec}
            videoDurationS={videoDurationS}
            onChange={(patch) => updateAudio(patch)}
          />

          <button
            type="button"
            onClick={handlePreview}
            disabled={!videoUrl || previewLoading}
            className="w-full px-4 py-2 rounded-full bg-white/[0.06] border border-white/12 text-white text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            data-testid="audio-preview-btn"
          >
            {previewLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération preview…
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                Preview audio
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-[12px] px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
