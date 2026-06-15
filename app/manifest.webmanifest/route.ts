/**
 * Manifest PWA dynamique (Pascal 2026-06-15).
 * Sur DEV (dev.talk2me.fr, détecté par la DB séparée), on renomme l'app
 * « T2M DEV », on lui donne des icônes à bandeau ROUGE et un id distinct →
 * c'est une PWA SÉPARÉE et reconnaissable sur l'écran d'accueil, impossible à
 * confondre avec la beta. Sur BETA, manifest normal inchangé.
 */
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const base = JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'manifest.json'), 'utf8'));
  const isDev = (process.env.TALKTOME_DB_PATH || '').includes('talktome-dev');

  if (isDev) {
    base.id = '/?pwa=dev';
    base.name = 'Talk2Me DEV';
    base.short_name = 'T2M DEV';
    base.theme_color = '#dc2626';
    base.background_color = '#1a0a0a';
    base.icons = [
      { src: '/icons/dev-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/dev-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/dev-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/dev-apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ];
  }

  return new NextResponse(JSON.stringify(base), {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' },
  });
}
