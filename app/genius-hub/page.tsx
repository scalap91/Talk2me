'use client';

/**
 * DÉMO INTÉGRATION — le VRAI feed (PostFeed / vraies SuperCards) branché dans le squelette Genius UI
 * (GeniusAppBar + GeniusBottomNavigation), skin T2M par tokens. Page NEUVE : ne touche pas au feed
 * existant (/home). But : prouver que le chrome Genius héberge le vrai contenu métier, pas un mockup.
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
    <div data-skin="t2m" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', background: 'var(--gu-color-bg)' }}>
      <GeniusAppBar title="Talk2Me">
        <GeniusIconButton icon="search" label="Rechercher" onPress={() => {}} />
      </GeniusAppBar>

      {/* Le VRAI feed : mêmes SuperCards que /home, rendues par le lecteur réel. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <PostFeed scope="all" topPad={8} />
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
