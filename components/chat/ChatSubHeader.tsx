'use client';

import React, { useEffect, useState } from 'react';

interface MeUser {
  display_name: string | null;
  username: string;
  ai_name?: string | null;
  ai_avatar_url?: string | null;
}

/**
 * Sub-header de la conversation agent (page /).
 *
 * Doctrine [[talk2me-ia-personnelle-integree]] (Pascal 2026-06-04) :
 * "Talk2Me n'est PAS un participant. Talk2Me est un assistant personnel
 *  attaché à un utilisateur. Dans une conversation entre amis, les
 *  participants visibles sont uniquement les humains."
 *
 * Conv solo agent (Home) → on n'affiche PAS "Pascal & Talk2Me".
 * À la place : l'IA personnelle du user (ex: "T2M de Pascal") + présence
 * (toujours en ligne — l'IA est un assistant local).
 */
const ChatSubHeader: React.FC = () => {
  const [me, setMe] = useState<MeUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setMe(data.user as MeUser);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Fallback robuste : pattern "T2M de <user>" si ai_name absent.
  const displayName = me?.display_name || (me ? `@${me.username}` : null);
  const aiName =
    me?.ai_name && me.ai_name.trim()
      ? me.ai_name
      : displayName
        ? `T2M de ${displayName.replace(/^@/, '')}`
        : 'Assistant';

  const initial = aiName.trim().charAt(0).toUpperCase() || 'T';

  return (
    <div
      className="
        flex items-center gap-3 px-4 py-3
        bg-white/5 backdrop-blur-md
        border-b border-white/5
      "
      data-testid="chat-sub-header"
    >
      {me?.ai_avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={me.ai_avatar_url}
          alt={aiName}
          className="flex-shrink-0 w-10 h-10 rounded-full object-cover"
        />
      ) : (
        <div
          className="
            flex-shrink-0 w-10 h-10 rounded-full
            bg-gradient-to-br from-red-500 to-red-700
            flex items-center justify-center
          "
          aria-hidden="true"
        >
          <span className="text-white font-bold text-sm">{initial}</span>
        </div>
      )}

      <div className="flex flex-col min-w-0">
        <span
          className="text-sm font-semibold text-foreground truncate"
          data-testid="chat-sub-header-name"
        >
          {aiName}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-muted-foreground">en ligne</span>
        </div>
      </div>
    </div>
  );
};

export default ChatSubHeader;
