'use client';

/**
 * /genius-hub — le hub reconstruit AVEC LES BRIQUES GENIUS UI (plus aucun clone du web).
 * Chrome 100% Genius : header (Pressable+Row+Column+Icon+Text+Box+Expanded) posé en surimpression
 * transparente, barre du bas GeniusBottomNavigation + GeniusNavItem + GeniusFab central. Le contenu
 * du feed reste le vrai PostFeed (SuperCards). Skin T2M par tokens. Ne touche pas au feed /home.
 */
import { useState } from 'react';
import PostFeed from '@/components/feed/PostFeed';
import {
  GeniusRow, GeniusColumn, GeniusExpanded, GeniusBox, GeniusText, GeniusIcon, GeniusPressable,
  GeniusBottomNavigation, GeniusNavItem, GeniusFab,
} from '@/lib/genius-ui/src/index';
import '@/lib/genius-ui/src/generated/tokens.css';
import '@/lib/genius-ui/src/generated/skin-t2m.css';
import '@/lib/genius-ui/src/genius-ui.css';

function TopItem({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <GeniusPressable label={label} onPress={onPress}>
      <GeniusColumn gap="none" align="center">
        <GeniusIcon name={icon} size="md" color="onPrimary" />
        <GeniusText variant="caption" color="onPrimary">{label}</GeniusText>
      </GeniusColumn>
    </GeniusPressable>
  );
}

export default function GeniusHubPage() {
  const [scope, setScope] = useState<'all' | 'friends' | 'around'>('all');
  const [tab, setTab] = useState(0);

  const scopeTab = (key: 'all' | 'friends' | 'around', label: string) => {
    const on = scope === key;
    return (
      <GeniusPressable label={label} onPress={() => setScope(key)}>
        <GeniusColumn gap="none" align="center">
          <GeniusText variant="label" weight={on ? 'bold' : 'medium'} color={on ? 'onPrimary' : 'inkMuted'}>{label}</GeniusText>
          <GeniusBox width={16} height={3} radius="full" background={on ? 'onPrimary' : undefined} />
        </GeniusColumn>
      </GeniusPressable>
    );
  };

  return (
    <div data-skin="t2m" style={{ height: '100dvh', maxWidth: 480, margin: '0 auto', position: 'relative', background: 'var(--gu-color-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Feed réel plein écran + header Genius transparent en surimpression */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <PostFeed scope={scope} topPad={0} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'calc(env(safe-area-inset-top) + 10px) 14px 30px', background: 'linear-gradient(to bottom, rgba(0,0,0,.85) 0%, rgba(0,0,0,.4) 55%, rgba(0,0,0,0) 100%)' }}>
          <GeniusRow align="center">
            <TopItem icon="menu" label="Achat" onPress={() => {}} />
            <GeniusExpanded>
              <GeniusRow gap="md" justify="center" align="center">
                {scopeTab('all', 'Tout')}{scopeTab('friends', 'Amis')}{scopeTab('around', 'Autour')}
              </GeniusRow>
            </GeniusExpanded>
            <TopItem icon="search" label="Recherche" onPress={() => { window.location.href = '/decouvrir'; }} />
          </GeniusRow>
        </div>
      </div>

      {/* Barre du bas Genius + FAB central */}
      <div style={{ position: 'relative' }}>
        <GeniusBottomNavigation>
          <GeniusNavItem icon="globe" label="Hub" active={tab === 0} onPress={() => setTab(0)} />
          <GeniusNavItem icon="chat" label="Discussions" active={tab === 1} onPress={() => setTab(1)} />
          <div style={{ width: 56, flex: 'none' }} />
          <GeniusNavItem icon="layers" label="Card" active={tab === 2} onPress={() => setTab(2)} />
          <GeniusNavItem icon="user" label="Profil" active={tab === 3} onPress={() => setTab(3)} />
        </GeniusBottomNavigation>
        <div style={{ position: 'absolute', left: '50%', top: -18, transform: 'translateX(-50%)' }}>
          <GeniusFab icon="plus" label="Créer" size="md" onPress={() => {}} />
        </div>
      </div>
    </div>
  );
}
