// /lib/db/index.ts — Barrel re-export de tous les modules /lib/db.
//
// Pascal 2026-06-05 : split du monolithe lib/db.ts en modules par domaine.
// Compat ascendante stricte : `import { X } from '@/lib/db'` continue de
// marcher exactement comme avant (cf lib/db.ts qui re-exporte ce barrel).

export * from './_core';
export * from './users';
export * from './sessions';
export * from './conversations';
export * from './conversation_participants';
export * from './messages';
export * from './friendships';
export * from './direct_cards';
export * from './posts';
export * from './cards_common';
export * from './saved_cards';
// card_likes : volontairement non re-exporté ici pour éviter les conflits de
// duplicate export (les helpers vivent dans cards_common, déjà exportés
// ci-dessus). Le fichier /lib/db/card_likes existe pour ceux qui veulent
// importer explicitement depuis ce chemin.
export * from './habits';
export * from './memories';
export * from './route_learnings';
export * from './drafts';
export * from './tutorial';
export * from './legal';
