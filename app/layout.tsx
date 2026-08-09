import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Color_Emoji, Playfair_Display, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/chat/ServiceWorkerRegister'
import ConnectionStatus from '@/components/system/ConnectionStatus'
import PresenceHeartbeat from '@/components/presence/PresenceHeartbeat'
import GlobalCardCreationSheet from '@/components/cards/GlobalCardCreationSheet'
import PortraitLock from '@/components/PortraitLock'
import DesktopShell from '@/components/system/DesktopShell'
import CommentsHost from '@/components/comments/CommentsHost'
import ComputeWorker from '@/components/compute/ComputeWorker'
import CaptureTestButton from '@/components/dev/CaptureTestButton'
import LaunchRouter from '@/components/LaunchRouter'
import PinchZoomBlocker from '@/components/PinchZoomBlocker'
// Talk2Me #418 — Calls v2 tonalité honnête (Pascal 2026-06-05).
// Doctrine [[talk2me-calls-architecture]] + [[modular-no-scattered-patches]].
import CallsRoot from '@/components/calls/CallsRoot'
import GoLiveWatcher from '@/components/live/GoLiveWatcher'
import AuthorConnectSheet from '@/components/social/AuthorConnectSheet'
import NativePush from '@/components/NativePush'
import NativeBadge from '@/components/system/NativeBadge'
import SingleSessionGuard from '@/components/system/SingleSessionGuard'
import PayAuthWatcher from '@/components/pay/PayAuthWatcher'
import E2eeKeyRegister from '@/components/system/E2eeKeyRegister'
import ChunkReloadGuard from '@/components/system/ChunkReloadGuard'
import VersionGuard from '@/components/system/VersionGuard'
import { displayModeState } from '@/lib/app-settings'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

/**
 * Noto Color Emoji : font emoji embarquée, garantit le rendu cross-platform
 * (Linux/Windows sans Apple/Segoe emoji, Chromium headless, etc.).
 * Sans ça, les 🍽️ 👇 ☕ s'affichent en placeholder "□" sur les systèmes
 * dépourvus de font emoji native.
 */
const notoEmoji = Noto_Color_Emoji({
  subsets: ['emoji'],
  variable: '--font-emoji',
  weight: ['400'],
  display: 'swap',
})

/**
 * Charte éditoriale Onyx (cards article = miroir du site onyx-infos.fr) :
 * Playfair Display (titres serif) + Barlow Condensed (kicker/labels uppercase).
 * Exposées en CSS vars, utilisées seulement sur les cards de marque presse.
 */
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-editorial',
  weight: ['700', '900'],
  display: 'swap',
})
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  variable: '--font-kicker',
  weight: ['600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Talk2Me — le hub social augmenté par l\'IA',
  description: 'Parle. Je comprends. J\'agis. Talk2Me, l\'OS social qui s\'adapte à toi.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Talk2Me',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Talk2Me',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Talk2Me — le hub social augmenté par l\'IA',
    description: 'Parle. Je comprends. J\'agis. Talk2Me, l\'OS social qui s\'adapte à toi.',
    type: 'website',
    locale: 'fr_FR',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  themeColor: '#0a0a14',
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Repère d'environnement : badge DEV visible UNIQUEMENT en dev. Drapeau EXPLICITE
  // `T2M_ENV=dev` (défini dans l'ecosystem PM2 du serveur dev), robuste et portable —
  // ne dépend plus d'un chemin de DB (qui changeait selon la machine). Beta ne le définit pas.
  const IS_DEV_ENV = process.env.T2M_ENV === 'dev';
  // Design system : mode d'affichage par section piloté en ADMIN (Carte | Photo), lu
  // côté serveur → posé sur <html> sans flash. Défaut 'cards' partout.
  const dm = displayModeState();
  return (
    <html
      lang="fr"
      data-feed={dm.feed}
      data-d-annonces={dm.annonces}
      data-d-eat={dm.eat}
      data-d-boutique={dm.boutique}
      data-d-service={dm.service}
      data-d-discussions="cards"
      data-d-profil={dm.profil}
      data-d-card={dm.card}
      data-d-drive={dm.drive}
      className={`${inter.variable} ${notoEmoji.variable} ${playfair.variable} ${barlowCondensed.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {/* Thème T2M — rejoue couleur / mode / affichage AVANT le 1ᵉʳ rendu (no-flash). */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var r=document.documentElement;var c=localStorage.getItem('t2m_color');if(c){r.style.setProperty('--t2m-primary',c);r.style.setProperty('--t2m-primary-deep',c);r.style.setProperty('--t2m-primary-grad','linear-gradient(135deg,'+c+','+c+')');}if(localStorage.getItem('t2m_mode')==='dark')r.dataset.theme='dark';var d=localStorage.getItem('t2m_display');if(d==='photo'||d==='cards'){r.dataset.feed=d;['annonces','eat','boutique','service','profil','card','drive'].forEach(function(s){r.setAttribute('data-d-'+s,d);});}r.setAttribute('data-d-discussions','cards');}catch(e){}})();` }} />
        {IS_DEV_ENV && (
          <script dangerouslySetInnerHTML={{ __html: 'window.__T2M_DEV=true;' }} />
        )}
        {IS_DEV_ENV && (
          <div
            aria-hidden
            style={{
              position: 'fixed',
              bottom: 'calc(env(safe-area-inset-bottom) + 72px)', // au-dessus de la barre du bas
              left: '8px',
              zIndex: 2147483647,
              pointerEvents: 'none',
              background: 'rgba(220,38,38,0.85)',
              color: '#fff',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              padding: '2px 7px',
              borderRadius: '9999px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              opacity: 0.85,
            }}
          >
            DEV · talk2me
          </div>
        )}
        <ChunkReloadGuard />
        <VersionGuard />
        <SingleSessionGuard>
          <DesktopShell>{children}</DesktopShell>
          <CommentsHost />
          <ComputeWorker />
          <CaptureTestButton />
          <LaunchRouter />
          <PortraitLock />
          <PinchZoomBlocker />
          <ServiceWorkerRegister />
          <ConnectionStatus />
          <PresenceHeartbeat />
          <GlobalCardCreationSheet />
          <CallsRoot />
          <GoLiveWatcher />
          <AuthorConnectSheet />
          <NativePush />
          <NativeBadge />
          <PayAuthWatcher />
          <E2eeKeyRegister />
        </SingleSessionGuard>
      </body>
    </html>
  )
}
