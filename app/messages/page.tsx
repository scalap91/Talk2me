import { redirect } from 'next/navigation';

// Talk2Me #333 v2 (Pascal 2026-06-04) — /messages a fusionné dans /friends.
// "Amis" est désormais le HUB UNIQUE (liste de toutes les conversations :
// IA solo "T2M de X" + P2P). Cf doctrine [[talk2me-ia-personnelle-integree]].
export const dynamic = 'force-static';

export default function MessagesRedirect() {
  redirect('/friends');
}
