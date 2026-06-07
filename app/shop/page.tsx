'use client';

import ChatHeader from '@/components/chat/ChatHeader';
import BottomNav from '@/components/chat/BottomNav';
import PostFeed from '@/components/feed/PostFeed';

/**
 * Talk2Me — Shop (Pascal 2026-06-07).
 * Pousse les cards "business" = nos conteneurs commerce (posts contenant une
 * ProductCard : AliExpress/Bing Shopping), visibles par TOUS. Tri tendance par
 * défaut. "Pour le moment" la sélection est poussée par T2M Officiel (produits
 * tendance réels). Doctrine [[content-grounding]] : que des produits réels.
 */
export default function ShopPage() {
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-background overflow-hidden">
      <ChatHeader />
      <PostFeed
        scope="shop"
        sort="popular"
        emptyText={
          <>
            Le Shop se remplit.<br />
            Les produits tendance poussés par T2M Officiel apparaîtront ici.
          </>
        }
      />
      <BottomNav />
    </div>
  );
}
