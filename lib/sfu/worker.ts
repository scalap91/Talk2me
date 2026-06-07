/**
 * SFU mediasoup — Worker singleton.
 *
 * Talk2Me #403 (Pascal 2026-06-05) — "IL SERA NATIF CEST NOTRE PIECE
 * MAITRESSE / JE FAIT EN INTEGRATION IL FAUT QUE CE SOIT DANS T2M".
 *
 * Architecture :
 *   - 1 worker mediasoup démarré LAZY au premier sfu_join (évite d'allouer
 *     un process C++ tant qu'aucun appel groupe n'a lieu).
 *   - Vit dans le même process Next.js (pas de PM2 séparé). Un seul worker
 *     gère facilement plusieurs centaines de participants → largement assez
 *     pour MVP "film en groupe demain soir".
 *   - Stocké sur globalThis pour survivre au HMR Next dev / aux re-imports
 *     côté serveur.
 *
 * Doctrines respectées :
 *   - [[talk2me-watch-together-passthrough]] : le SFU NE TRANSPORTE PAS les
 *     vidéos partenaires (YouTube/Netflix/etc.). Uniquement audio+cam des
 *     participants. Codecs limités à opus + VP8.
 *   - [[talk2me-calls-architecture]] : audio prioritaire sur vidéo.
 *
 * Variables d'env :
 *   MEDIASOUP_ANNOUNCED_IP   IP publique OVH (CRITIQUE pour ICE depuis
 *                            l'extérieur). Sans elle → fallback 127.0.0.1
 *                            mode dev local + warning loud.
 *   MEDIASOUP_RTC_MIN_PORT   défaut 40000
 *   MEDIASOUP_RTC_MAX_PORT   défaut 49999
 *   MEDIASOUP_NUM_WORKERS    défaut 1 (MVP)
 *   MEDIASOUP_WORKER_BIN     CRITIQUE en build Next/Turbopack — chemin
 *                            absolu vers le binaire mediasoup-worker.
 *                            Next bundle remplace __dirname → mediasoup
 *                            cherche /ROOT/... et spawn ENOENT. Détecté
 *                            au smoke test #403.
 */
import 'server-only';

import * as mediasoup from 'mediasoup';
import type {
  Worker,
  Router,
  RtpCodecCapability,
  WorkerLogLevel,
} from 'mediasoup/types';

/**
 * Note types : RtpCodecCapability exige `preferredPayloadType` au runtime
 * mais celui-ci est OPTIONNEL côté mediaCodecs de RouterOptions (cf doc TS
 * mediasoup). On le précise explicitement pour satisfaire le type strict.
 */

// ──────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────

const RTC_MIN_PORT = Number(process.env.MEDIASOUP_RTC_MIN_PORT) || 40000;
const RTC_MAX_PORT = Number(process.env.MEDIASOUP_RTC_MAX_PORT) || 49999;

/**
 * Codecs supportés par le router. On reste TRÈS minimal pour MVP :
 *   - opus stéréo 48kHz (voix participants)
 *   - VP8 (cam participants)
 *
 * Pas de simulcast, pas de SVC, pas de H264 (compat plus large iOS Safari
 * mais compilation worker plus lourde). À ajouter si Pascal demande.
 */
export const ROUTER_MEDIA_CODECS: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    preferredPayloadType: 100,
    clockRate: 48000,
    channels: 2,
    parameters: {
      // useinbandfec=1 → résilience perte paquet
      useinbandfec: 1,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    preferredPayloadType: 101,
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 800,
    },
  },
];

/**
 * Récupère l'IP publique annoncée pour ICE. Si MEDIASOUP_ANNOUNCED_IP n'est
 * pas définie → fallback 127.0.0.1 + warning détaillé. Sans cette IP, ICE
 * échouera pour tout client hors machine.
 */
function getAnnouncedIp(): string {
  const ip = (process.env.MEDIASOUP_ANNOUNCED_IP || '').trim();
  if (ip) return ip;
  console.warn(
    '[sfu] ⚠️  MEDIASOUP_ANNOUNCED_IP non définie. Fallback 127.0.0.1 (DEV).\n' +
      '[sfu] ⚠️  Les clients HORS de cette machine ne pourront PAS se connecter.\n' +
      '[sfu] ⚠️  Détectez votre IP publique OVH et exportez :\n' +
      '[sfu] ⚠️    export MEDIASOUP_ANNOUNCED_IP=<IP_PUBLIQUE_OVH>\n' +
      '[sfu] ⚠️  Puis pm2 restart talktome --update-env'
  );
  return '127.0.0.1';
}

export const ANNOUNCED_IP = getAnnouncedIp();

/** Config WebRtcTransport (listenIps + initialAvailableOutgoingBitrate). */
export const WEBRTC_TRANSPORT_OPTIONS = {
  listenIps: [{ ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1_000_000,
};

// ──────────────────────────────────────────────────────────────────────────
// Singleton worker (globalThis pour survivre HMR / multi-import)
// ──────────────────────────────────────────────────────────────────────────

interface SfuGlobal {
  __t2m_sfu_worker?: Worker;
  __t2m_sfu_worker_promise?: Promise<Worker>;
}

function g(): SfuGlobal {
  return globalThis as unknown as SfuGlobal;
}

/**
 * Démarre (ou récupère) le worker mediasoup unique. Idempotent.
 * Throws si le binaire mediasoup-worker ne peut pas démarrer (deps build
 * absentes etc.) — l'API route appelante doit catch et retourner 503.
 */
export async function getWorker(): Promise<Worker> {
  const gl = g();
  if (gl.__t2m_sfu_worker && !gl.__t2m_sfu_worker.closed) {
    return gl.__t2m_sfu_worker;
  }
  if (gl.__t2m_sfu_worker_promise) return gl.__t2m_sfu_worker_promise;

  const logLevel: WorkerLogLevel =
    process.env.NODE_ENV === 'production' ? 'warn' : 'debug';

  if (!process.env.MEDIASOUP_WORKER_BIN) {
    console.warn(
      '[sfu] ⚠️  MEDIASOUP_WORKER_BIN non défini. Next/Turbopack risque de\n' +
        '[sfu] ⚠️  résoudre __dirname vers /ROOT/... et spawn fera ENOENT.\n' +
        '[sfu] ⚠️  Exporte le chemin absolu vers node_modules/mediasoup/worker/\n' +
        '[sfu] ⚠️  out/Release/mediasoup-worker dans .env.local.'
    );
  }
  console.log(
    `[sfu] starting mediasoup worker (rtc ports ${RTC_MIN_PORT}-${RTC_MAX_PORT}, announcedIp=${ANNOUNCED_IP}, bin=${process.env.MEDIASOUP_WORKER_BIN || '(default)'})`
  );

  gl.__t2m_sfu_worker_promise = mediasoup
    .createWorker({
      logLevel,
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      rtcMinPort: RTC_MIN_PORT,
      rtcMaxPort: RTC_MAX_PORT,
    })
    .then((worker) => {
      worker.on('died', (err) => {
        console.error('[sfu] worker DIED, will recreate on next call', err);
        gl.__t2m_sfu_worker = undefined;
        gl.__t2m_sfu_worker_promise = undefined;
      });
      gl.__t2m_sfu_worker = worker;
      console.log(`[sfu] worker started pid=${worker.pid}`);
      return worker;
    })
    .catch((e) => {
      console.error('[sfu] worker failed to start', e);
      gl.__t2m_sfu_worker_promise = undefined;
      throw e;
    });

  return gl.__t2m_sfu_worker_promise;
}

/** Crée un router (par room). Codecs définis ci-dessus. */
export async function createRouter(): Promise<Router> {
  const worker = await getWorker();
  return worker.createRouter({ mediaCodecs: ROUTER_MEDIA_CODECS });
}
