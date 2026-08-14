'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ConversationView from '@/components/conversation/ConversationView';
import type { ConversationPeer, UnifiedMessage } from '@/components/conversation/types';
import { useChatStore } from '@/lib/store/chat';
import type { ChatMessage } from '@/lib/chat-types';
import SelectionFAB from '@/components/chat/SelectionFAB';
// Talk2Me #419 (Pascal 2026-06-05) — Dock jeu inline aussi sur conv solo Léa.
// Avant : on naviguait vers /c/[id] qui redirige `kind === 'agent'` vers `/`,
// donc le board ne s'ouvrait jamais. Maintenant on monte le dock ici.
import InlineGameDock from '@/components/games/InlineGameDock';

// Seed minimal : juste le message d'accueil de l'agent.
// Doctrine [[talktome-embeds-only]] : zéro data inventée.
const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'seed-1',
    role: 'agent',
    content:
      "Hey ! Je suis Talk2Me, ton agent. Pose-moi n'importe quelle question, ou colle un lien (YouTube, Spotify, article, etc.) — je l'intègre dans la discussion.",
    timestamp: Date.now(),
  },
];

/**
 * Talk2Me #337 — Conv IA solo refactorée sur ConversationView.
 * Pas de logique UI ici : juste chargement data + mapping → ConversationView.
 */
export default function HomePage() {
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendMedia = useChatStore((s) => s.sendMedia);
  const seed = useChatStore((s) => s.seed);
  const loadFromServer = useChatStore((s) => s.loadFromServer);
  const [aiName, setAiName] = useState<string | null>(null);
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(null);
  const [meDisplay, setMeDisplay] = useState<string | null>(null);
  // Talk2Me #419 (Pascal 2026-06-05) — état jeu inline solo Léa.
  // meId : id user pour InlineGameDock (resolveur tour blanc/noir).
  // agentConvId : conv_id solo Léa (target SSE pour game_move).
  // activeGame : {kind, id} si une partie est ouverte → render InlineGameDock.
  // gameRefreshTick : incrémenté sur SSE game_move/pause/resume pour reload.
  const [meId, setMeId] = useState<string | null>(null);
  const [agentConvId, setAgentConvId] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<
    | { kind: 'chess' | 'dame'; id: string }
    | null
  >(null);
  const [gameRefreshTick, setGameRefreshTick] = useState(0);

  useEffect(() => {
    (async () => {
      await loadFromServer();
      const current = useChatStore.getState().messages;
      if (current.length === 0) seed(SEED_MESSAGES);
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (j?.user?.ai_name) setAiName(j.user.ai_name);
          if (j?.user?.ai_avatar_url) setAiAvatarUrl(j.user.ai_avatar_url);
          setMeDisplay(j?.user?.display_name || j?.user?.username || null);
          if (j?.user?.id) setMeId(j.user.id);
        }
      } catch {
        // silent
      }
      // Talk2Me #419 — récupère agent conv id pour SSE game_move
      try {
        const cl = await fetch('/api/conversations/list', { cache: 'no-store' });
        if (cl.ok) {
          const j = await cl.json();
          const agentConv = (j?.conversations || []).find(
            (c: { kind?: string; id: string }) => c?.kind === 'agent'
          );
          if (agentConv?.id) setAgentConvId(agentConv.id);
        }
      } catch {
        // silent
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Talk2Me #419 (Pascal 2026-06-05) — SSE minimal pour MAJ board solo Léa.
  // On écoute UNIQUEMENT les events game_* sur la conv agent, sans charger
  // tout useConversationRealtime (réservé aux conv P2P : chat + calls + activités).
  // Quand Léa joue son coup côté serveur, on incrémente refreshTick → board reload.
  useEffect(() => {
    if (!agentConvId || !activeGame) return;
    const es = new EventSource(`/api/conversations/${agentConvId}/events`);
    const handleGame = (raw: string) => {
      try {
        const data = JSON.parse(raw);
        if (data?.game_id && data.game_id === activeGame.id) {
          setGameRefreshTick((n) => n + 1);
        }
      } catch {
        // ignore
      }
    };
    es.addEventListener('game_move', (evt) =>
      handleGame((evt as MessageEvent).data)
    );
    es.addEventListener('game_pause', (evt) =>
      handleGame((evt as MessageEvent).data)
    );
    es.addEventListener('game_resume', (evt) =>
      handleGame((evt as MessageEvent).data)
    );
    es.addEventListener('game_end', (evt) =>
      handleGame((evt as MessageEvent).data)
    );
    return () => es.close();
  }, [agentConvId, activeGame]);

  const peer: ConversationPeer = useMemo(() => {
    // Défaut sans nom choisi = « IA » (Pascal 2026-08-13). aiName vient déjà de /api/auth/me (défaut IA).
    const name = aiName || 'IA';
    return {
      id: 'ai-self',
      kind: 'ai',
      name,
      avatarUrl: aiAvatarUrl,
      presence: 'online',
      subtitle: 'en ligne',
    };
  }, [aiName, aiAvatarUrl, meDisplay]);

  // Talk2Me #391 (Pascal 2026-06-05) — Badge IA visible AUSSI en conv solo.
  // Verbatim Pascal : "ou sont les tag nom ia de maniere general".
  // Avant : agent → 'peer' (badge implicite/absent).
  // Après : agent → 'peer-ai' (côté gauche, bulle dark, badge "✨ Léa" affiché
  // au-dessus de chaque bulle IA, exactement comme en P2P). Layout préservé,
  // tag IA enfin visible partout.
  const unified: UnifiedMessage[] = useMemo(
    () =>
      messages.map((m) => ({
        id: m.id,
        author: m.role === 'user' ? 'me' : 'peer-ai',
        content: m.content,
        timestamp: m.timestamp,
        author_name: m.role === 'user' ? undefined : peer.name,
        author_avatar_url: m.role === 'user' ? undefined : peer.avatarUrl,
        youtube: m.youtube ?? null,
        places: m.places ?? null,
        intent_query: m.intent_query ?? null,
        user_lat: m.user_lat ?? null,
        user_lng: m.user_lng ?? null,
        recipe: m.recipe ?? null,
        products: m.products ?? null,
        wikipedia: m.wikipedia ?? null,
        weather: m.weather ?? null,
        web_search: m.web_search ?? null,
        tiktok: m.tiktok ?? null,
        requires_geoloc: m.requires_geoloc === true,
        extraLinks: m.links,
        media: m.media ?? null,
      })),
    [messages, peer.name, peer.avatarUrl]
  );

  /**
   * Talk2Me #416/#418/#419 (Pascal 2026-06-05) — Bouton "+ → Lancer un jeu"
   * en conv solo Léa. Mode 'solo' obligatoire (opponent='lea').
   *
   * #419 : on monte InlineGameDock directement ici (au lieu de naviguer vers
   * /c/[id] qui redirige `kind === 'agent'` vers /). Pas de friction, dock
   * inline sticky bottom, l'user continue à discuter dans le même fil.
   */
  const handleStartGame = useCallback(
    async (gameKind: 'chess' | 'dame') => {
      try {
        // Si on n'a pas encore l'agentConvId (initial load), on retry inline.
        let convId = agentConvId;
        if (!convId) {
          const cl = await fetch('/api/conversations/list', { cache: 'no-store' });
          if (!cl.ok) return;
          const j = await cl.json();
          const agentConv = (j?.conversations || []).find(
            (c: { kind?: string; id: string }) => c?.kind === 'agent'
          );
          if (!agentConv?.id) return;
          convId = agentConv.id;
          setAgentConvId(convId);
        }
        const res = await fetch(`/api/${gameKind}/find-or-create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conv_id: convId,
            opponent: 'lea',
            mode: 'solo',
          }),
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!data?.game?.id) return;
        // Note : pour le solo Léa on ignore le picker reprendre/nouvelle
        // (toujours reprendre l'existante si présente). C'est cohérent avec
        // un jeu d'IA personnel : tu ne perds pas ta partie par accident.
        // Si Pascal veut le picker ici aussi, on portera la GameInviteCard.
        setActiveGame({ kind: gameKind, id: data.game.id });
      } catch (e) {
        console.error('[home/start-game]', e);
      }
    },
    [agentConvId]
  );

  return (
    <>
      <ConversationView
        peer={peer}
        messages={unified}
        isTyping={isTyping}
        typingLabel={`${peer.name} écrit...`}
        onSend={(text) => sendMessage(text)}
        onSendMedia={(media, opts) => sendMedia(media, opts?.caption)}
        onStartGame={handleStartGame}
        sending={isTyping}
        backHref="/home"
        aiName={null}
        aiAvatarUrl={null}
        callsEnabled={false}
        enableSwipeReply
        enableSelection
        bottomSlot={
          activeGame && meId ? (
            <InlineGameDock
              gameKind={activeGame.kind}
              gameId={activeGame.id}
              meId={meId}
              refreshTick={gameRefreshTick}
              onClose={() => setActiveGame(null)}
            />
          ) : null
        }
      />
      {/* Talk2Me #351 — Selection → Post : visible UNIQUEMENT en conv IA solo.
          Lit useChatStore (selectionMode) — store qui n'est rempli que par
          cette page (P2P utilise son propre state local). Doctrine confidentialité
          [[talk2me-selection-to-post]] : publication publique uniquement depuis
          espace IA personnel. */}
      <SelectionFAB />
    </>
  );
}
