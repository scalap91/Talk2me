'use client';

/**
 * Talk2Me — /music : le hub MUSIC CARD en PAGE AUTONOME plein écran (Pascal 2026-08-15).
 * Sert la MÊME expérience que l'onglet Music de /drafts (liste + Pour moi/Tendance/Artistes +
 * Recherche + lecteur), mais SANS le reste du hub Card — pour être ENCAPSULÉE telle quelle dans
 * une WebView de l'app native (nouvel onglet « Musique »). Même API, même recherche = le web tel quel.
 */
import MusicCardTab from '@/components/cards/MusicCardTab';

export default function MusicPage() {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--t2m-paper, #fff)', color: 'var(--t2m-ink, #16181d)' }}>
      <MusicCardTab />
    </div>
  );
}
