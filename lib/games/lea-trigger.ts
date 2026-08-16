/**
 * Talk2Me #416 (Pascal 2026-06-05) — Helper triggerGameFromConv.
 *
 * Cible : invocation depuis /lib/ai/lea/tools.ts (à brancher après #414).
 * Pour l'instant : utilisable directement depuis l'UI (bouton menu "+" →
 * "Lancer un jeu") pour tester le flow complet sans dépendre du tool Léa.
 *
 * Pascal verbatim (chat) :
 *  - "Je finis ma partie avec Léa…" → solo, intent='auto' (cherche existante)
 *  - "@Léa sort le jeu d'échec" en conv P2P → arbiter, intent='new'
 *  - "@Léa on reprend notre partie ?" → intent='resume'
 *
 * Sémantique 3 intents :
 *  - 'new'    : crée TOUJOURS une nouvelle (force_new si existante)
 *  - 'resume' : reprend l'existante (ouvre Resume), erreur si pas trouvée
 *  - 'auto'   : reprend si existante, crée sinon (= comportement par défaut
 *               find-or-create sans force_new)
 *
 * Architecture : helper PURE LOGIQUE serveur (pas de fetch HTTP), appelle
 * directement les DB helpers et publie le message message_card dans la conv.
 * Compatible utilisation par tool Léa (server-side) OU par route HTTP UI.
 *
 * NB : ce module DOIT rester pur (pas d'import /lib/ai/*) pour éviter le
 * cycle de dépendance avec l'agent #414 qui livre /lib/ai/lea/tools.ts.
 */

import { Chess } from 'chess.js';
import {
  abandonChessGame,
  abandonDameGame,
  appendMessage,
  createChessGame,
  createDameGame,
  getConversation,
  getInProgressGameBetween,
  getInProgressGameForUser,
  getUserById,
  startActivity,
  type ChessGame,
  type DameGame,
} from '@/lib/db';
import { initialDameState } from './dame-engine';
import { LEA_PLAYER_ID } from './types';
import { leaPlayNextChess, leaPlayNextDame } from './lea';
import { publish } from '@/lib/realtime-bus';

export interface TriggerGameOptions {
  user_id: string;
  conv_id: string;
  /**
   * Si null → mode solo (conv 'agent' ou peer absent), opponent = Léa.
   * Sinon → mode arbitre, opponent = ce user_id (humain ami).
   */
  conv_peer_id: string | null;
  game_kind: 'chess' | 'dame';
  /** Voir doc en-tête. */
  intent: 'new' | 'resume' | 'auto';
  /** Couleur de l'user appelant (default 'random'). */
  my_color?: 'white' | 'black' | 'random';
}

export interface TriggerGameResult {
  ok: true;
  game_id: string;
  existing: boolean;
  card_message_id: string;
  mode: 'solo' | 'arbiter';
}

export interface TriggerGameError {
  ok: false;
  error: string;
}

/**
 * Crée ou retrouve une partie + injecte un message "carte jeu" dans la conv
 * pour que tous les participants la voient. Pas de validation auth (le
 * caller — tool Léa ou route HTTP — est responsable).
 */
export async function triggerGameFromConv(
  opts: TriggerGameOptions
): Promise<TriggerGameResult | TriggerGameError> {
  const { user_id, conv_id, conv_peer_id, game_kind, intent } = opts;
  if (!user_id) return { ok: false, error: 'user_id_required' };
  if (!conv_id) return { ok: false, error: 'conv_id_required' };

  const conv = getConversation(conv_id, user_id);
  if (!conv) return { ok: false, error: 'conv_not_found' };

  const me = getUserById(user_id);
  if (!me) return { ok: false, error: 'user_not_found' };

  const mode: 'solo' | 'arbiter' = conv_peer_id ? 'arbiter' : 'solo';

  if (mode === 'arbiter') {
    if (!conv.participants.some((p) => p.id === conv_peer_id)) {
      return { ok: false, error: 'peer_not_in_conv' };
    }
    const peer = getUserById(conv_peer_id as string);
    if (!peer) return { ok: false, error: 'peer_not_found' };
  }

  // ---- Lookup ----
  let existing: ChessGame | DameGame | null = null;
  const table = game_kind === 'chess' ? 'chess_games' : 'dame_games';
  if (mode === 'solo') {
    existing = getInProgressGameForUser(table, user_id, conv_id);
  } else {
    existing = getInProgressGameBetween(table, user_id, conv_peer_id as string, conv_id);
  }

  if (intent === 'resume' && !existing) {
    return { ok: false, error: 'no_game_to_resume' };
  }

  // ---- force_new si intent='new' et existante ----
  if (existing && intent === 'new') {
    if (game_kind === 'chess') abandonChessGame(existing.id);
    else abandonDameGame(existing.id);
    publish(`conv:${conv_id}`, {
      kind: 'game_end',
      data: {
        conversation_id: conv_id,
        game_id: existing.id,
        game_kind,
        winner: null,
        status: 'draw',
        reason: 'abandoned_for_new',
        from_user_id: user_id,
      },
    });
    existing = null;
  }

  let game: ChessGame | DameGame;
  let wasExisting: boolean;
  if (existing) {
    game = existing;
    wasExisting = true;
  } else {
    // ---- Création ----
    const myColor: 'white' | 'black' =
      opts.my_color === 'white' || opts.my_color === 'black'
        ? opts.my_color
        : Math.random() < 0.5
          ? 'white'
          : 'black';
    const opponent = mode === 'solo' ? LEA_PLAYER_ID : (conv_peer_id as string);
    const playerWhite = myColor === 'white' ? user_id : opponent;
    const playerBlack = myColor === 'black' ? user_id : opponent;

    let activityId: string | null = null;
    if (mode === 'arbiter' && conv.kind === 'p2p') {
      const activity = startActivity(
        conv.id,
        game_kind,
        {
          game_label:
            game_kind === 'chess'
              ? "Partie d'échecs (l’IA arbitre)"
              : 'Partie de dames (l’IA arbitre)',
          leader_id: user_id,
        },
        user_id,
        'accepted'
      );
      activityId = activity.id;
      publish(`conv:${conv.id}`, {
        kind: 'activity_start',
        data: {
          conversation_id: conv.id,
          activity,
          from_user_id: user_id,
          sent_at: Date.now(),
        },
      });
    }

    if (game_kind === 'chess') {
      const chess = new Chess();
      game = createChessGame({
        convId: conv.id,
        activityId,
        playerWhite,
        playerBlack,
        startFen: chess.fen(),
        arbiter: mode === 'arbiter' ? LEA_PLAYER_ID : null,
      });
      if (mode === 'solo' && playerWhite === LEA_PLAYER_ID) {
        void leaPlayNextChess(game.id);
      }
    } else {
      game = createDameGame({
        convId: conv.id,
        activityId,
        playerWhite,
        playerBlack,
        initialState: initialDameState(),
        arbiter: mode === 'arbiter' ? LEA_PLAYER_ID : null,
      });
      if (mode === 'solo' && playerWhite === LEA_PLAYER_ID) {
        void leaPlayNextDame(game.id);
      }
    }
    wasExisting = false;
  }

  // ---- Message "carte jeu" dans la conv ----
  // On utilise un message texte court qui sert d'ancrage pour la card. La
  // card riche est rendue par le board modal côté client à partir de game.id
  // (la conv UI ne sait pas encore lire une "attached_game" — on garde simple :
  // un message marker "🎮 Léa a sorti le jeu d'échecs"). Ouverture du board :
  // par le clickListener du onGameMove ou via le bouton menu UI.
  const gameLabelFr =
    game_kind === 'chess' ? "le jeu d'échecs" : 'le jeu de dames';
  const verbResume = wasExisting && intent !== 'new' ? 'reprend' : 'a sorti';
  // Pascal verbatim : "Elle fait apparaître le jeu et joue la partie avec mon
  // pote" → message court visible par tous les participants.
  const text =
    mode === 'arbiter'
      ? `${me.ai_name || 'L’IA'} ${verbResume} ${gameLabelFr} pour vous deux.`
      : `${me.ai_name || 'L’IA'} ${verbResume} ${gameLabelFr}.`;

  let cardMessageId = '';
  try {
    const msg = appendMessage(
      conv.id,
      'agent',
      text,
      [],
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
      {
        kind: 'ai_reply',
        aiForUserId: user_id, // C'est l'IA du user qui agit
        aiName: me.ai_name || 'IA',
        aiAvatarUrl: me.ai_avatar_url || null,
        senderId: null,
      }
    );
    cardMessageId = msg.id;
    publish(`conv:${conv.id}`, {
      kind: 'chat',
      data: {
        id: msg.id,
        conversation_id: conv.id,
        sender_id: null,
        ai_for_user_id: user_id,
        ai_name: me.ai_name || 'IA',
        ai_avatar_url: me.ai_avatar_url || null,
        kind: 'ai_reply',
        text: msg.text,
        created_at: msg.created_at,
      },
    });
  } catch (e) {
    console.error('[lea-trigger] append message failed', e);
    // On continue même si le message echoue, la partie est créée.
  }

  return {
    ok: true,
    game_id: game.id,
    existing: wasExisting,
    card_message_id: cardMessageId,
    mode,
  };
}
