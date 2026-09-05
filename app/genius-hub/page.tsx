'use client';

/**
 * DÉMO INTÉGRATION — le VRAI feed (PostFeed / vraies SuperCards) dans le squelette Genius UI.
 * Reproduit le rendu réel : feed immersif plein écran + AppBar TRANSPARENTE en surimpression
 * (dégradé sombre + icônes blanches) + BottomNavigation. Page neuve : ne touche pas au feed /home.
 */
import { useState } from 'react';
import PostFeed from '@/components/feed/PostFeed';
import { GeniusAppBar, GeniusIconButton, GeniusBottomNavigation, GeniusNavItem } from '@/lib/genius-ui/src/index';
import '@/lib/genius-ui/src/generated/tokens.css';
import '@/lib/genius-ui/src/generated/skin-t2m.css';
import '@/lib/genius-ui/src/genius-ui.css';

export default function GeniusHubPage() {
  const [tab, setTab] = useState(0);
  return (
    <div data-skin="t2m" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', position: 'relative', background: 'var(--gu-color-bg)' }}>
      {/* Feed plein écran + AppBar transparente en surimpression (comme le vrai hub immersif). */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <PostFeed scope="all" topPad={0} />
        <GeniusAppBar variant="transparent" title="Talk2Me">
          <GeniusIconButton icon="search" label="Rechercher" onPress={() => {}} />
        </GeniusAppBar>
      </div>

      <GeniusBottomNavigation>
        <GeniusNavItem icon="home" label="Feed" active={tab === 0} onPress={() => setTab(0)} />
        <GeniusNavItem icon="search" label="Messages" active={tab === 1} onPress={() => setTab(1)} />
        <GeniusNavItem icon="star" label="Cards" active={tab === 2} onPress={() => setTab(2)} />
        <GeniusNavItem icon="user" label="Profil" active={tab === 3} onPress={() => setTab(3)} />
      </GeniusBottomNavigation>
    </div>
  );
}
