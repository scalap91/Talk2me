'use client';

/**
 * /genius-hub — reproduction EXACTE du hub (option a) : vrai feed immersif (PostFeed), vrai header
 * (☰ Achat · Tout/Amis/Autour · Recherche) et vraie barre du bas (BottomNav, verre + FAB central).
 * But : montrer le rendu exact. NB : ici Genius UI n'apporte que l'hébergement du feed — le chrome
 * est le chrome T2M bespoke. La version « exact ET Genius » = reconstruire ce chrome en briques.
 * Ne touche pas au feed /home.
 */
import { useState } from 'react';
import PostFeed from '@/components/feed/PostFeed';
import BottomNav from '@/components/chat/BottomNav';
import { MagnifyingGlass, List } from '@phosphor-icons/react';

export default function GeniusHubPage() {
  const [scope, setScope] = useState<'all' | 'friends' | 'around'>('all');
  const sh = '0 1px 4px rgba(0,0,0,.55)';
  const ico: React.CSSProperties = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: 0, textShadow: sh };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', color: '#fff', textShadow: sh };
  const tab = (key: 'all' | 'friends' | 'around', label: string) => {
    const on = scope === key;
    return (
      <button type="button" onClick={() => setScope(key)} style={{ background: 'none', border: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0 11px' }}>
        <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: on ? 800 : 500, color: on ? '#fff' : 'rgba(255,255,255,.62)', textShadow: sh }}>{label}</span>
        <span style={{ width: 16, height: 2.5, borderRadius: 2, background: on ? '#fff' : 'transparent' }} />
      </button>
    );
  };

  return (
    <div className="relative flex flex-col" style={{ height: '100dvh', maxWidth: 480, margin: '0 auto', background: 'var(--t2m-feed-bg)' }}>
      <div className="flex-1 min-h-0 flex flex-col">
        <PostFeed scope={scope} topPad={68} />
      </div>

      <div className="absolute top-0 inset-x-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <header style={{ padding: '10px 16px 36px', background: 'linear-gradient(to bottom, rgba(0,0,0,.92) 0%, rgba(0,0,0,.68) 50%, rgba(0,0,0,.34) 80%, rgba(0,0,0,0) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button type="button" aria-label="Achat" style={ico}>
              <List weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Achat</span>
            </button>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              {tab('all', 'Tout')}{tab('friends', 'Amis')}{tab('around', 'Autour')}
            </div>
            <button type="button" aria-label="Rechercher" style={ico}>
              <MagnifyingGlass weight="duotone" style={{ width: 'var(--t2m-ic-nav)', height: 'var(--t2m-ic-nav)' }} /><span style={lbl}>Recherche</span>
            </button>
          </div>
        </header>
      </div>

      <BottomNav />
    </div>
  );
}
