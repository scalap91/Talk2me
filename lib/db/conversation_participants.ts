// /lib/db/conversation_participants.ts — La table conversation_participants
// n'a actuellement pas d'API publique dédiée : les inserts et lectures se
// font à l'intérieur des helpers de conversations.ts (getOrCreate*, createP2P,
// listUserConversations, etc.) qui maintiennent l'invariant participants.
//
// Le fichier existe pour respecter le plan de split et accueillir des futurs
// helpers (ex : listParticipants(convId), addParticipant pour les conv group,
// etc.) sans devoir re-toucher conversations.ts.

export {};
