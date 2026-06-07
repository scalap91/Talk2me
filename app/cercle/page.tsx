'use client';

import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';
import PostFeed from '@/components/feed/PostFeed';

/**
 * Talk2Me — Cercle (Pascal 2026-06-07).
 * Cercle = uniquement les posts publiés sur le Hub par MES AMIS (scope=friends).
 * Distinct du Hub (global) et de "Amis" (gestion des contacts, /friends).
 */
export default function CerclePage() {
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-background overflow-hidden">
      <ChatHeader />
      <PostFeed
        scope="friends"
        emptyText={
          <>
            Ton Cercle est calme pour l&apos;instant.<br />
            Les posts publiés par tes amis apparaîtront ici.<br />
            Ajoute des amis depuis l&apos;onglet « Amis ».
          </>
        }
      />
      <BottomNav />
    </div>
  );
}
