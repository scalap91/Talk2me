/**
 * Talk2Me — Mode d'affichage public par section (Carte | Photo). Design system.
 * Lu par le boot client pour poser data-display-* sur <html>. Lecture seule, publique.
 */
import { NextResponse } from 'next/server';
import { displayModeState } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, modes: displayModeState() });
}
