'use client';

import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';
import PostFeed from '@/components/feed/PostFeed';

/**
 * Talk2Me — Hub (Pascal 2026-06-07).
 * Le Hub = flux GLOBAL : tous les posts/cards publiés. Anciennement "Accueil".
 * Le feed lui-même vit dans <PostFeed scope="all" /> (partagé avec /cercle).
 */
export default function HubPage() {
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-background overflow-hidden">
      <ChatHeader />
      <PostFeed scope="all" />
      <BottomNav />
    </div>
  );
}
