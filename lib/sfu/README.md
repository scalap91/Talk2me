# SFU mediasoup natif — Talk2Me #403

Pièce maîtresse Watch Together groupe (Pascal 2026-06-05).

## Architecture

```
[Browser A] ───┐                         ┌─── [Browser B]
mediasoup-     │   /api/sfu/*  (HTTP)    │   mediasoup-
client         ├─────────────────────────┤   client
               │                         │
               │   SSE conv:{convId}     │
               │   (new producers,       │
               │    peer joined/left)    │
               │                         │
               └────────► Next.js ◄──────┘
                            │
                            ▼
                   lib/sfu/worker.ts  (singleton lazy)
                            │
                            ▼
                   lib/sfu/rooms.ts   (Map<activity_id, Room>)
                            │
                            ▼
                   mediasoup Worker C++ (1 process)
                            │
                            ▼
                   UDP/TCP RTC 40000-49999 ◄── browsers via ICE
```

- 1 worker mediasoup unique (process C++ enfant) démarré LAZY au premier `/api/sfu/join`.
- 1 Router par activity (= 1 Room).
- Signaling sur HTTP POST + SSE existant (canal `conv:{convId}`).
- Rooms vivent en mémoire serveur, indexées par `activity_id`.
- Cleanup auto : `closeRoom` quand `endActivity` ou quand 0 peer restant.

## Variables d'env (`.env.local`)

```bash
MEDIASOUP_ANNOUNCED_IP=141.95.7.170    # IP publique OVH
MEDIASOUP_RTC_MIN_PORT=40000
MEDIASOUP_RTC_MAX_PORT=49999
MEDIASOUP_NUM_WORKERS=1
# CRITIQUE en build Next/Turbopack : sans ça, spawn ENOENT sur /ROOT/...
MEDIASOUP_WORKER_BIN=/home/ubuntu/talktome/node_modules/mediasoup/worker/out/Release/mediasoup-worker
```

## Firewall (ufw)

```bash
sudo ufw allow 40000:49999/udp comment 'Talk2Me #403 mediasoup RTC UDP'
# Port 443 TCP nginx déjà ouvert pour le signaling HTTPS.
# Port 443 TCP est ÉGALEMENT utilisé par mediasoup en fallback ICE-TCP si
# UDP bloqué côté client → laisser ouvert (déjà le cas pour nginx).
```

## Routes API

| Méthode | Path | Body | Réponse |
|---|---|---|---|
| POST | `/api/sfu/join` | `{ activity_id }` | `{ routerRtpCapabilities, peerId, existingProducers }` |
| POST | `/api/sfu/transport/create` | `{ activity_id, direction }` | `{ transport: { id, iceParameters, iceCandidates, dtlsParameters } }` |
| POST | `/api/sfu/transport/connect` | `{ activity_id, transport_id, dtlsParameters }` | `{ ok: true }` |
| POST | `/api/sfu/produce` | `{ activity_id, transport_id, kind, rtpParameters }` | `{ producer_id }` |
| POST | `/api/sfu/consume` | `{ activity_id, transport_id, producer_id, rtpCapabilities }` | `{ consumer: { id, producerId, kind, rtpParameters } }` |
| POST | `/api/sfu/consume/resume` | `{ activity_id, consumer_id }` | `{ ok: true }` |
| POST | `/api/sfu/leave` | `{ activity_id }` | `{ ok: true }` |
| GET | `/api/sfu/producers?activity_id=` | — | `{ producers: [{ producerId, userId, kind }] }` |

**Auth** : cookie `talk2me_session` requis. User doit être participant de la conversation de l'activity.

## Composant React

`<SfuRoom activityId convId meId withVideo>` dans `components/sfu/SfuRoom.tsx`.

## Page de test

`/sfu-test/[activity_id]` — Pascal peut tester en 2 onglets / 2 devices avec une activity kind='video' déjà créée.

## Doctrines respectées

- [[talk2me-watch-together-passthrough]] : le SFU NE TRANSPORTE PAS les vidéos partenaires. Codecs uniquement audio/opus + video/VP8. Pas de data channel pour vidéo partenaire.
- [[talk2me-audio-anti-echo]] : `getMicCamStream` force `echoCancellation + noiseSuppression + autoGainControl` partout.
- [[talk2me-calls-architecture]] : WebRTC P2P 1-to-1 conservé pour les appels privés ; SFU activé pour groupes (kind='video' activity).
- [[modular-no-scattered-patches]] : tout le SFU vit dans `lib/sfu/*` + `app/api/sfu/*` + `components/sfu/*`.

## Limites MVP honnêtes

- Pas de simulcast (1 layer VP8 unique).
- Pas de bandwidth adaptation dynamique.
- Pas de SVC.
- Pas de mute/unmute UI (Pascal validera post-E2E).
- Pas de reconnect après transport DTLS down (page reload requise).
- Max 10 participants vidéo (mosaïque 2x5 mobile MVP).
- 1 seul worker mediasoup (MVP). Scale futur : 1 worker par CPU core via `MEDIASOUP_NUM_WORKERS` (pas implémenté).
- Pas de TURN. Doctrine talk2me-calls-architecture le prévoit (coturn self-hosted). Pour MVP, les clients derrière NAT strict utiliseront ICE-TCP (port 443 fallback) — devrait suffire pour 80%+ des réseaux.

## Smoke test serveur

```bash
node scripts/test-sfu-mediasoup-403.mjs
```

Vérifie pipeline complet sans browser : join, transport create avec announcedIp, leave, end activity. Tous checks doivent passer ✅.
