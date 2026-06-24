/**
 * Talk2Me — État public des fonctionnalités globales ON/OFF (ex. pièces 3D).
 * Lu par l'UI pour afficher/masquer les capacités premium. Lecture seule, publique.
 */
import { NextResponse } from 'next/server';
import { featuresState } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, features: featuresState() });
}
