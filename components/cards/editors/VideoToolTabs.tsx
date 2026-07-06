'use client';

/**
 * VideoToolTabs — onglets outils de l'éditeur VideoCard (Textes / Musique /
 * Filtres), extraits de VideoCardEditor (#51 modularisation, Pascal 2026-06-29).
 * AUCUN changement de comportement : même JSX, piloté par props. Embarque aussi
 * AddVideoTextRow (utilisé uniquement ici).
 */
import { Dispatch, SetStateAction, useState } from 'react';
import { Type, X, Plus } from '@/lib/icons';
import { type CardDraft, type VideoClip, type TextPos, totalClipsDuration } from '@/lib/card-draft-store';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import type { FilterPreset } from '@/lib/video-filters';
import AudioPickerTab from './AudioPickerTab';
import VideoFiltersTab from './VideoFiltersTab';
import MusicExtractPicker from './MusicExtractPicker';
import MusicMixer from './MusicMixer';

interface Props {
  toolTab: 'texts' | 'music' | 'filters';
  setToolTab: (t: 'texts' | 'music' | 'filters') => void;
  draft: CardDraft;
  clips: VideoClip[];
  currentTime: number;
  addText: (content: string, position: TextPos, opts?: { start_s?: number; end_s?: number }) => void;
  removeText: (id: string) => void;
  attachedMusic: UnifiedCard | null;
  setAttachedMusic: Dispatch<SetStateAction<UnifiedCard | null>>;
  setMusicPickerOpen: (v: boolean) => void;
  serverUrl: string | null;
  setAudioPreviewUrl: (url: string | null) => void;
  selectedClipId: string | null;
  setClipFilter: (id: string, f: FilterPreset) => void;
  setAllClipsFilter: (f: FilterPreset) => void;
}

function videoDuration(draft: CardDraft, clips: VideoClip[]): number {
  return clips.length > 0
    ? totalClipsDuration(clips)
    : draft.trim
      ? draft.trim.end_s - draft.trim.start_s
      : draft.duration_s ?? 0;
}

export default function VideoToolTabs({
  toolTab, setToolTab, draft, clips, currentTime, addText, removeText,
  attachedMusic, setAttachedMusic, setMusicPickerOpen, serverUrl, setAudioPreviewUrl,
  selectedClipId, setClipFilter, setAllClipsFilter,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5" data-testid="tool-tabs">
        <button
          type="button"
          onClick={() => setToolTab('texts')}
          className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors ' + (toolTab === 'texts' ? 'bg-white/[0.10] border border-white/15 text-white' : 'bg-white/[0.03] border border-white/8 text-white/60 hover:text-white')}
          data-testid="tool-tab-texts"
        >
          <Type className="w-3.5 h-3.5" />
          Textes
          {draft.texts.length > 0 && <span className="ml-1 text-[10px] text-white/55">({draft.texts.length})</span>}
        </button>
        <button
          type="button"
          onClick={() => setToolTab('music')}
          className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors ' + (toolTab === 'music' ? 'bg-white/[0.10] border border-white/15 text-white' : 'bg-white/[0.03] border border-white/8 text-white/60 hover:text-white')}
          data-testid="tool-tab-music"
        >
          <span aria-hidden="true">🎵</span>
          Musique
          {draft.audio && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-red-300" aria-label="musique sélectionnée" />}
        </button>
        <button
          type="button"
          onClick={() => setToolTab('filters')}
          className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors ' + (toolTab === 'filters' ? 'bg-white/[0.10] border border-white/15 text-white' : 'bg-white/[0.03] border border-white/8 text-white/60 hover:text-white')}
          data-testid="tool-tab-filters"
        >
          <span aria-hidden="true">🎨</span>
          Filtres
          {clips.some((c) => c.filter && c.filter !== 'none') && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-red-300" aria-label="filtre actif" />}
        </button>
      </div>

      {toolTab === 'texts' && (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-white/40">Textes overlay</div>
          <AddVideoTextRow
            duration={draft.duration_s ?? 0}
            currentTime={currentTime - (draft.trim?.start_s ?? 0)}
            onAdd={(content, position, start_s, end_s) => addText(content, position, { start_s, end_s })}
          />
          {draft.texts.length > 0 && (
            <div className="space-y-1 mt-1">
              {draft.texts.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/8 px-3 py-1.5 text-[12px] text-white/85">
                  <span className="truncate">
                    <span className="text-white/40 mr-1.5">[{t.position}]</span>
                    {t.content}
                    {typeof t.start_s === 'number' || typeof t.end_s === 'number' ? (
                      <span className="text-white/40 ml-1.5">
                        ({typeof t.start_s === 'number' ? `${t.start_s.toFixed(1)}s` : '0s'}→
                        {typeof t.end_s === 'number' ? `${t.end_s.toFixed(1)}s` : 'fin'})
                      </span>
                    ) : null}
                  </span>
                  <button type="button" onClick={() => removeText(t.id)} className="text-white/50 hover:text-white" aria-label="Supprimer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toolTab === 'music' && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] text-white/70">🎵 Music-Hub (overlay disque rotatif)</div>
              <button type="button" onClick={() => setMusicPickerOpen(true)} className="text-[11px] text-red-200 bg-red-500/15 border border-red-400/30 rounded-full px-2.5 py-1 hover:bg-red-500/25">
                {attachedMusic ? 'Changer' : 'Ajouter'}
              </button>
            </div>
            {attachedMusic ? (
              <>
                <div className="flex items-center gap-2.5">
                  {attachedMusic.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachedMusic.thumbnail_url} alt="" className="w-10 h-10 rounded-md object-cover bg-white/5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-white truncate">{attachedMusic.title}</div>
                    <div className="text-[10px] text-white/50 truncate">{attachedMusic.author?.name ?? ''}</div>
                  </div>
                  <button type="button" onClick={() => setAttachedMusic(null)} className="text-[11px] text-white/60 hover:text-white" aria-label="Retirer la musique">
                    Retirer
                  </button>
                </div>
                <MusicExtractPicker
                  music={attachedMusic}
                  videoDurationS={videoDuration(draft, clips)}
                  startSec={((attachedMusic.meta as { start_sec?: number } | undefined)?.start_sec) ?? 0}
                  onChange={(start) => setAttachedMusic((prev) => (prev ? { ...prev, meta: { ...(prev.meta || {}), start_sec: start } } : prev))}
                />
                <MusicMixer
                  videoVolume={((attachedMusic.meta as { video_volume?: number } | undefined)?.video_volume) ?? 1}
                  musicVolume={((attachedMusic.meta as { volume?: number } | undefined)?.volume) ?? 0.3}
                  onChange={(vv, mv) => setAttachedMusic((prev) => (prev ? { ...prev, meta: { ...(prev.meta || {}), video_volume: vv, volume: mv } } : prev))}
                />
              </>
            ) : (
              <div className="text-[11px] text-white/40">Aucune musique attachée. Le disque ne s&apos;affichera pas.</div>
            )}
          </div>
          <AudioPickerTab
            videoUrl={serverUrl}
            videoDurationS={videoDuration(draft, clips)}
            onPreview={(url) => setAudioPreviewUrl(url)}
          />
        </div>
      )}

      {toolTab === 'filters' && (
        <VideoFiltersTab
          clips={clips}
          selectedClipId={selectedClipId}
          onApplyToSelected={(id, f) => setClipFilter(id, f)}
          onApplyToAll={(f) => setAllClipsFilter(f)}
        />
      )}
    </div>
  );
}

/* AddVideoTextRow — ajout manuel d'un texte overlay (avec fenêtre temps). */
function AddVideoTextRow({
  duration,
  currentTime,
  onAdd,
}: {
  duration: number;
  currentTime: number;
  onAdd: (content: string, position: TextPos, start_s?: number, end_s?: number) => void;
}) {
  const [val, setVal] = useState('');
  const [pos, setPos] = useState<TextPos>('top');
  const [withRange, setWithRange] = useState(false);

  const submit = () => {
    const t = val.trim();
    if (!t) return;
    if (withRange) {
      const s = Math.max(0, currentTime);
      const e = Math.max(s + 1, Math.min(s + 3, Math.max(s + 1, duration)));
      onAdd(t.slice(0, 60), pos, s, e);
    } else {
      onAdd(t.slice(0, 60), pos);
    }
    setVal('');
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Type className="w-3.5 h-3.5 text-white/40" />
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        placeholder="Texte à ajouter"
        maxLength={60}
        className="flex-1 min-w-[120px] rounded-full bg-white/[0.04] border border-white/8 px-3 py-1.5 text-[12.5px] text-white placeholder-white/30 outline-none focus:border-white/20"
      />
      <select
        value={pos}
        onChange={(e) => setPos(e.target.value as TextPos)}
        className="rounded-full bg-white/[0.04] border border-white/8 px-2 py-1.5 text-[12px] text-white/80 outline-none"
      >
        <option value="top" className="bg-[#12121a]">Haut</option>
        <option value="center" className="bg-[#12121a]">Centre</option>
        <option value="bottom" className="bg-[#12121a]">Bas</option>
      </select>
      <label className="flex items-center gap-1 text-[11px] text-white/60 select-none cursor-pointer">
        <input type="checkbox" checked={withRange} onChange={(e) => setWithRange(e.target.checked)} className="accent-red-500" />
        3s
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={val.trim().length === 0}
        className="w-8 h-8 rounded-full bg-white/[0.08] border border-white/12 text-white flex items-center justify-center disabled:opacity-40"
        aria-label="Ajouter le texte"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
