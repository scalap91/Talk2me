/**
 * Talk2Me — État public des sous-sections du Shop (Eat / Annonces / Boutique).
 * Lu par AcheterHub pour afficher/masquer chaque onglet. Lecture seule, publique.
 */
import { NextResponse } from 'next/server';
import { shopSectionsState } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, sections: shopSectionsState() });
}
