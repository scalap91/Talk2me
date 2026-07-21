/**
 * In-process pub/sub pour SSE Watch Together.
 *
 * MVP : map mémoire (token → set de subscribers). Pas de Redis, pas de cluster.
 * PM2 fork single-instance suffit pour MVP. Si scale → swap par Redis pubsub.
 *
 * Deux canaux par session :
 *   - 'state'  : { currentTime, isPlaying, leaderId, participantCount, updatedAt }
 *   - 'chat'   : { id, author_id, text, created_at }
 */

export type WatchEventKind =
  | 'state'
  | 'chat'
  | 'ping'
  // Talk2Me — Messagerie façon WhatsApp (Pascal 2026-06-26).
  // 'typing' : { user_id } — le peer est en train d'écrire (transitoire, ~4s).
  // 'read'   : { user_id, at } — le peer a LU jusqu'à `at` → accusés ✓✓.
  | 'typing'
  | 'read'
  // Phase 4 — Appels WebRTC P2P (signaling sur le canal conv:{id})
  | 'call_offer'
  | 'call_answer'
  | 'ice_candidate'
  | 'call_decline'
  | 'call_hangup'
  // Phase 5 — Activités synchronisées greffées sur l'appel
  | 'activity_start'
  | 'activity_state'
  | 'activity_end'
  // Talk2Me #408 — Watch Together consentement (Pascal 2026-06-05).
  // 'watch_invite'   : leader a créé une activité en 'pending', peer reçoit l'overlay
  // 'watch_accepted' : peer a accepté, leader peut commencer à lire
  // 'watch_declined' : peer a refusé, activité auto-ended ~5s plus tard
  // 'watch_sync'     : events leader → peer (play/pause/seek/rate) en passthrough
  | 'watch_invite'
  | 'watch_accepted'
  | 'watch_declined'
  | 'watch_sync'
  // Talk2Me #408 — Jeux interactifs (chess + dames).
  // Diffuse un move pour synchroniser le plateau du peer en temps réel.
  | 'game_move'
  | 'game_end'
  // Talk2Me #416 — Pause / Reprise persistante (Pascal 2026-06-05).
  // 'game_pause'  : un user a pausé la partie, l'autre voit l'overlay
  // 'game_resume' : la partie reprend, MAJ UI
  | 'game_pause'
  | 'game_resume'
  // Talk2Me #418 — Calls v2 tonalité honnête (Pascal 2026-06-05).
  // Émis sur le canal user:{userId} pour cibler une personne précise.
  //  'call:incoming'  → reçu par l'appelé : ouvrir <IncomingCallScreen>
  //  'call:ring_beat' → reçu par l'appelant : 1 cycle de tonalité réelle
  //  'call:accepted'  → reçu par l'appelant : ouvrir le média
  //  'call:busy'      → reçu par l'appelant : décliné
  //  'call:hangup'    → reçu par les 2 : fermer
  //  'call:webrtc'    → relai SDP/ICE entre appelant et appelé (post-accept)
  | 'call:incoming'
  | 'call:ring_beat'
  | 'call:accepted'
  | 'call:busy'
  | 'call:hangup'
  | 'call:webrtc'
  // Talk2Me LIVE — Commentaires + go-live (Pascal 2026-07-04).
  // Diffusés sur le canal `live:{liveId}` (= id du diffuseur), reçus par le
  // diffuseur ET tous les spectateurs abonnés à /api/live/[room].
  //  'live_comment' : { author, text, ts }         — un commentaire du live
  //  'live_join'    : { author, ts }               — « X a rejoint » (système)
  // Talk2Me LIVE SHOPPING (Pascal 2026-07-05) — le vendeur ÉPINGLE un produit :
  //  'live_product' : { card, shopId, shopKey, ts } — SuperCard produit épinglée.
  //  La card PORTE déjà son bouton Acheter (le paiement voyage avec la card).
  //  shopId/shopKey = contexte boutique (résolution prix SERVEUR) — pas de PII.
  // Diffusé sur le canal `user:{friendId}` (notif in-app go-live) :
  //  'live_start'   : { liveId, broadcaster, url }  — un ami passe en direct
  //  'live_end'     : { liveId }                    — le live est terminé
  // Doctrine [[talk2me-pii-air-gap]] : author = { username, display_name } SEULEMENT.
  | 'live_comment'
  | 'live_join'
  | 'live_product'
  | 'live_kick'
  | 'live_start'
  | 'live_end';

export interface WatchEvent {
  kind: WatchEventKind;
  data: unknown;
}

export type WatchSubscriber = (evt: WatchEvent) => void;

interface BusStore {
  subs: Map<string, Set<WatchSubscriber>>;
}

function getStore(): BusStore {
  const g = globalThis as unknown as { __talktomeWatchBus?: BusStore };
  if (!g.__talktomeWatchBus) {
    g.__talktomeWatchBus = { subs: new Map() };
  }
  return g.__talktomeWatchBus;
}

export function subscribe(token: string, sub: WatchSubscriber): () => void {
  const store = getStore();
  let set = store.subs.get(token);
  if (!set) {
    set = new Set();
    store.subs.set(token, set);
  }
  set.add(sub);
  return () => {
    const s = store.subs.get(token);
    if (!s) return;
    s.delete(sub);
    if (s.size === 0) store.subs.delete(token);
  };
}

export function publish(token: string, evt: WatchEvent): number {
  const store = getStore();
  const set = store.subs.get(token);
  if (!set) return 0;
  for (const sub of set) {
    try {
      sub(evt);
    } catch {
      // ignore single subscriber errors
    }
  }
  return set.size;
}

export function subscriberCount(token: string): number {
  return getStore().subs.get(token)?.size ?? 0;
}
