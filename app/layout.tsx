import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Color_Emoji } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegister } from '@/components/chat/ServiceWorkerRegister'
import PresenceHeartbeat from '@/components/presence/PresenceHeartbeat'
import GlobalCardCreationSheet from '@/components/cards/GlobalCardCreationSheet'
import PortraitLock from '@/components/PortraitLock'
import PinchZoomBlocker from '@/components/PinchZoomBlocker'
// Talk2Me #418 — Calls v2 tonalité honnête (Pascal 2026-06-05).
// Doctrine [[talk2me-calls-architecture]] + [[modular-no-scattered-patches]].
import CallsRoot from '@/components/calls/CallsRoot'

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

export const metadata: Metadata = {
  title: 'Talk2Me — le réseau social augmenté par l\'IA',
  description: 'Parle. Je comprends. J\'agis. Talk2Me, l\'OS social qui s\'adapte à toi.',
  manifest: '/manifest.json',
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
    title: 'Talk2Me — le réseau social augmenté par l\'IA',
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
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${notoEmoji.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <PortraitLock />
        <PinchZoomBlocker />
        <ServiceWorkerRegister />
        <PresenceHeartbeat />
        <GlobalCardCreationSheet />
        <CallsRoot />
      </body>
    </html>
  )
}
