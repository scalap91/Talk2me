import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Color_Emoji, Playfair_Display, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/chat/ServiceWorkerRegister'
import ConnectionStatus from '@/components/system/ConnectionStatus'
import PresenceHeartbeat from '@/components/presence/PresenceHeartbeat'
import GlobalCardCreationSheet from '@/components/cards/GlobalCardCreationSheet'
import PortraitLock from '@/components/PortraitLock'
import LaunchRouter from '@/components/LaunchRouter'
import PinchZoomBlocker from '@/components/PinchZoomBlocker'
// Talk2Me #418 — Calls v2 tonalité honnête (Pascal 2026-06-05).
// Doctrine [[talk2me-calls-architecture]] + [[modular-no-scattered-patches]].
import CallsRoot from '@/components/calls/CallsRoot'
import AuthorConnectSheet from '@/components/social/AuthorConnectSheet'

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
  // Repère d'environnement : badge DEV visible UNIQUEMENT sur dev.talk2me.fr
  // (détecté par la DB séparée). Beta (talk2me.fr) n'a pas TALKTOME_DB_PATH → pas de badge.
  const IS_DEV_ENV = (process.env.TALKTOME_DB_PATH || '').includes('talktome-dev');
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${notoEmoji.variable} ${playfair.variable} ${barlowCondensed.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {IS_DEV_ENV && (
          <script dangerouslySetInnerHTML={{ __html: 'window.__T2M_DEV=true;' }} />
        )}
        {IS_DEV_ENV && (
          <div
            aria-hidden
            style={{
              position: 'fixed',
              top: 'calc(env(safe-area-inset-top) + 6px)',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2147483647,
              pointerEvents: 'none',
              background: '#dc2626',
              color: '#fff',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              padding: '3px 10px',
              borderRadius: '9999px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}
          >
            DEV · talk2me
          </div>
        )}
        {children}
        <LaunchRouter />
        <PortraitLock />
        <PinchZoomBlocker />
        <ServiceWorkerRegister />
        <ConnectionStatus />
        <PresenceHeartbeat />
        <GlobalCardCreationSheet />
        <CallsRoot />
        <AuthorConnectSheet />
      </body>
    </html>
  )
}
