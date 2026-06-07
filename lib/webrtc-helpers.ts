/**
 * Helpers WebRTC pour Talk2Me Phase 4.
 *
 * Doctrine : pas de fallback externe. STUN gratuit Google uniquement.
 * Si NAT strict (~20% des cas), Phase 5+ ajoutera coturn self-hosted.
 */

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface CallSignalUrls {
  offer: string;
  answer: string;
  ice: string;
  end: string;
}

export function callSignalUrls(convId: string): CallSignalUrls {
  const base = `/api/call/${encodeURIComponent(convId)}`;
  return {
    offer: `${base}/offer`,
    answer: `${base}/answer`,
    ice: `${base}/ice`,
    end: `${base}/end`,
  };
}

export async function postJson(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (e) {
    console.error('[webrtc] postJson', url, e);
    return false;
  }
}

/**
 * Erreur typée pour permettre à l'UI de produire un toast clair.
 * `code` correspond aux DOMException.name standards :
 *  - NotAllowedError → user a refusé la permission
 *  - NotFoundError   → aucun device présent
 *  - NotReadableError → device occupé par une autre app
 *  - OverconstrainedError → contraintes (facingMode) impossibles → fallback
 *  - NotSecureError  → contexte non-HTTPS (custom)
 *  - UnknownError    → autre
 */
export class GetUserMediaError extends Error {
  code:
    | 'NotAllowedError'
    | 'NotFoundError'
    | 'NotReadableError'
    | 'OverconstrainedError'
    | 'NotSecureError'
    | 'UnknownError';
  userMessage: string;
  constructor(code: GetUserMediaError['code'], userMessage: string, cause?: unknown) {
    super(userMessage);
    this.code = code;
    this.userMessage = userMessage;
    if (cause instanceof Error) this.stack = cause.stack;
  }
}

function mapGumError(e: unknown): GetUserMediaError {
  const name = (e as DOMException | undefined)?.name || 'UnknownError';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new GetUserMediaError(
        'NotAllowedError',
        "Caméra ou micro refusé. Activez l'accès dans les paramètres du navigateur.",
        e
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new GetUserMediaError(
        'NotFoundError',
        'Aucune caméra ou micro détecté sur cet appareil.',
        e
      );
    case 'NotReadableError':
    case 'TrackStartError':
      return new GetUserMediaError(
        'NotReadableError',
        'Caméra/micro déjà utilisé(e) par une autre application.',
        e
      );
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new GetUserMediaError(
        'OverconstrainedError',
        'Aucun device compatible avec ces contraintes.',
        e
      );
    default:
      return new GetUserMediaError(
        'UnknownError',
        "Impossible d'accéder à la caméra ou au micro.",
        e
      );
  }
}

export async function getLocalStream(kind: 'audio' | 'video'): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    console.error('[webrtc] mediaDevices indisponible (HTTPS requis)');
    throw new GetUserMediaError(
      'NotSecureError',
      'Caméra/micro indisponible : ouvrez Talk2Me en HTTPS.'
    );
  }

  // Étape 1 : tentative avec contrainte facingMode 'user' (cam frontale mobile)
  const wantVideo = kind === 'video';
  const primaryConstraints: MediaStreamConstraints = {
    audio: true,
    video: wantVideo ? { facingMode: 'user' } : false,
  };

  try {
    console.log('[webrtc] getUserMedia → primary constraints', primaryConstraints);
    const stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
    console.log(
      '[webrtc] getUserMedia OK',
      'audio=',
      stream.getAudioTracks().length,
      'video=',
      stream.getVideoTracks().length
    );
    return stream;
  } catch (primaryErr) {
    const primaryName = (primaryErr as DOMException | undefined)?.name;
    console.warn('[webrtc] primary getUserMedia failed', primaryName, primaryErr);

    // Fallback : si la contrainte facingMode est rejetée (desktop sans cam frontale,
    // OverconstrainedError), on retente avec `video: true` simple.
    if (
      wantVideo &&
      (primaryName === 'OverconstrainedError' ||
        primaryName === 'ConstraintNotSatisfiedError' ||
        primaryName === 'NotFoundError')
    ) {
      try {
        console.log('[webrtc] getUserMedia → fallback {video:true, audio:true}');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        console.log('[webrtc] fallback getUserMedia OK');
        return stream;
      } catch (fallbackErr) {
        console.error('[webrtc] fallback getUserMedia failed', fallbackErr);
        throw mapGumError(fallbackErr);
      }
    }

    throw mapGumError(primaryErr);
  }
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      // ignore
    }
  });
}

export function formatCallDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Bip ringtone simple via WebAudio API (oscillator), pas de fichier audio.
 * Renvoie une fonction stop.
 */
export function startRingtone(): () => void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    return () => {};
  }
  let stopped = false;
  let ctx: AudioContext | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  try {
    ctx = new AudioContext();
  } catch {
    return () => {};
  }

  const bip = () => {
    if (stopped || !ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 800;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        try {
          osc.stop();
        } catch {
          // ignore
        }
      }, 400);
    } catch {
      // ignore
    }
  };

  bip();
  interval = setInterval(bip, 1800);

  return () => {
    stopped = true;
    if (interval) clearInterval(interval);
    if (ctx) {
      try {
        ctx.close();
      } catch {
        // ignore
      }
    }
  };
}
