'use client';

/**
 * /demo-p5 — page interne pour screenshot Phase 5.
 *
 * Affiche les composants ActivityPicker / VideoPicker / ActivityVideoSync
 * dans le contexte d'un faux appel actif pour permettre la capture sans
 * monter une vraie session WebRTC (lourde en headless).
 *
 * Page non listée, accessible uniquement aux users authentifiés (middleware).
 * Triée par query param `view`:
 *   - ?view=picker → ActivityPicker bottom-sheet
 *   - ?view=videoPicker → VideoPicker écran direct
 *   - ?view=split → fake call modal split-screen avec ActivityVideoSync
 */

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ActivityPicker from '@/components/activity/ActivityPicker';
import VideoPicker from '@/components/activity/VideoPicker';
import ActivityVideoSync from '@/components/activity/ActivityVideoSync';
import type { Activity, VideoSyncState } from '@/lib/activity-types';
import { HangupButton, MicToggle, CamToggle } from '@/components/call/CallButtons';

const FAKE_CONV = 'demo-conv-id';
const FAKE_ME = 'demo-user-id';

export default function DemoP5Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Chargement…</div>}>
      <DemoP5Inner />
    </Suspense>
  );
}

function DemoP5Inner() {
  const params = useSearchParams();
  const view = params?.get('view') || 'picker';
  const [, setStarted] = useState(false);

  // Fake activity pour vue 'split'
  const fakeActivity: Activity<VideoSyncState> = {
    id: 'demo-act-id',
    conv_id: FAKE_CONV,
    kind: 'video',
    state: {
      video_id: 'aqz-KE-bpKQ',
      title: 'Big Buck Bunny (Blender Open Movie)',
      current_time_s: 0,
      is_playing: true,
      updated_at: Date.now(),
      leader_id: FAKE_ME,
    },
    started_by: FAKE_ME,
    started_at: Date.now(),
    invite_status: 'accepted',
  };

  // Empêche l'API end de partir vers le réseau pour la démo
  useEffect(() => {
    if (view !== 'split') return;
    const orig = window.fetch;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.includes('/api/activities/')) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      return orig(input, init);
    }) as typeof window.fetch;
    return () => {
      window.fetch = orig;
    };
  }, [view]);

  if (view === 'picker') {
    return (
      <div className="fixed inset-0 bg-[#0e0e12]">
        <ActivityPicker
          convId={FAKE_CONV}
          meId={FAKE_ME}
          onClose={() => {
            // re-mount to keep screenshot
            setStarted(true);
          }}
          onActivityStarted={() => {}}
        />
      </div>
    );
  }

  if (view === 'videoPicker') {
    return (
      <div className="fixed inset-0 flex items-end justify-center bg-black/55 backdrop-blur-sm">
        <div className="w-full max-w-md h-[60vh] bg-[#16161c] rounded-t-3xl border-t border-white/10 overflow-hidden">
          <VideoPicker onBack={() => {}} onSelect={() => {}} />
        </div>
      </div>
    );
  }

  if (view === 'split') {
    // Simule le CallModal split-screen : activité au-dessus, contrôles call en bas
    const useStatic = params?.get('static') === '1';
    return (
      <div className="fixed inset-0 z-[100] bg-[#0a0a0d] text-white flex flex-col">
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex-1 min-h-0 flex">
            {useStatic ? (
              <StaticVideoSyncMock activity={fakeActivity} peerLabel="Bob" />
            ) : (
              <ActivityVideoSync
                activity={fakeActivity}
                isLeader
                remoteState={null}
                meId={FAKE_ME}
                peerLabel="Bob"
                onEnd={() => {}}
              />
            )}
          </div>

          {/* Mini call bar */}
          <div className="shrink-0 border-t border-white/10 bg-[#0e0e12]/85 backdrop-blur px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-[12px] font-medium"
                style={{ background: 'linear-gradient(135deg, hsl(220 70% 55% / 0.95), hsl(260 70% 50% / 0.95))' }}
                aria-hidden="true"
              >
                B
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-white/95 truncate">Bob</div>
                <div className="text-[11px] text-white/55 truncate">1:24</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <MicToggle muted={false} onClick={() => {}} />
              <CamToggle off={false} onClick={() => {}} />
              <HangupButton onClick={() => {}} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <div className="p-6 text-white">Unknown view</div>;
}

/**
 * Mock statique du player synchronisé (pour screenshots quand YouTube refuse
 * de charger dans les browsers headless). Identique visuellement au layout
 * réel d'ActivityVideoSync.
 */
function StaticVideoSyncMock({
  activity,
  peerLabel,
}: {
  activity: Activity<VideoSyncState>;
  peerLabel: string;
}) {
  const thumb = `https://i.ytimg.com/vi/${activity.state.video_id}/hqdefault.jpg`;
  return (
    <div className="relative flex flex-col w-full h-full bg-black">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0e0e12]/85 backdrop-blur border-b border-white/8">
        <div className="text-[12px] text-white/70 truncate flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-red-300/80 font-medium bg-red-500/15 px-2 py-0.5 rounded-full border border-red-400/15">
            Vous menez
          </span>
          <span className="truncate">Vidéo partagée · {peerLabel} & toi</span>
        </div>
        <div className="text-[12px] text-white/70 px-2 py-1 rounded-full bg-white/8 border border-white/10">
          × Fin
        </div>
      </div>
      <div className="relative flex-1 bg-black overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/55 border border-white/20 flex items-center justify-center">
            <div
              className="w-0 h-0 ml-1"
              style={{
                borderTop: '12px solid transparent',
                borderBottom: '12px solid transparent',
                borderLeft: '18px solid white',
              }}
            />
          </div>
        </div>
        {/* Progress bar mock */}
        <div className="absolute bottom-3 left-3 right-3">
          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full" style={{ width: '34%' }} />
          </div>
          <div className="flex justify-between text-[10.5px] text-white/70 mt-1 font-mono">
            <span>0:42</span>
            <span>2:03</span>
          </div>
        </div>
      </div>
      <div className="px-3 py-2 bg-[#0e0e12]/85 backdrop-blur border-t border-white/8">
        <div className="text-[12.5px] font-medium text-white/90 truncate">
          {activity.state.title}
        </div>
      </div>
    </div>
  );
}
