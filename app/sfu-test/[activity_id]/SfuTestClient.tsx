'use client';

import { useState } from 'react';
import { SfuRoom } from '@/components/sfu/SfuRoom';

interface Props {
  activityId: string;
  convId: string;
  meId: string;
  meLabel: string;
}

export default function SfuTestClient({ activityId, convId, meId, meLabel }: Props) {
  const [joined, setJoined] = useState(false);
  const [withVideo, setWithVideo] = useState(true);

  if (!joined) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex flex-col gap-4 items-center justify-center">
        <h1 className="text-xl font-semibold">SFU test room</h1>
        <p className="text-sm text-gray-400">
          Activity : <code>{activityId}</code>
        </p>
        <p className="text-sm text-gray-400">
          Toi : <strong>{meLabel}</strong>
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withVideo}
            onChange={(e) => setWithVideo(e.target.checked)}
          />
          Activer la caméra
        </label>
        <button
          type="button"
          onClick={() => setJoined(true)}
          className="px-4 py-2 bg-red-600 rounded text-white font-medium hover:bg-red-500"
        >
          Rejoindre la salle
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="p-2 text-xs text-gray-400 flex items-center justify-between">
        <span>
          SFU room <code>{activityId.slice(0, 8)}</code> — toi : {meLabel}
        </span>
        <button
          type="button"
          onClick={() => setJoined(false)}
          className="px-3 py-1 bg-red-700 rounded text-white text-xs hover:bg-red-600"
        >
          Quitter
        </button>
      </div>
      <div className="flex-1">
        <SfuRoom
          activityId={activityId}
          convId={convId}
          meId={meId}
          withVideo={withVideo}
          onClose={() => setJoined(false)}
        />
      </div>
    </div>
  );
}
