// /lib/db/card_likes.ts — Re-export des helpers card_likes pour cohérence du
// barrel. Les fonctions vivent dans cards_common.ts (likeCard/unlikeCard/
// isLikedByUser/getLikedCardIds/readCardLikesCount) parce qu'elles touchent
// AUSSI les compteurs `likes` sur direct_cards/posts. Ce fichier les re-expose
// sous /lib/db/card_likes pour rester aligné avec le plan de split.

export {
  likeCard,
  unlikeCard,
  isLikedByUser,
  getLikedCardIds,
  readCardLikesCount,
} from './cards_common';
