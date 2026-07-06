/**
 * GET /api/cards/hydrate?provider=aliexpress&ref=<query> — HYDRATATION LIVE d'une card
 * (Card OS, Pascal 2026-06-30). Une card `price.live` ne stocke pas le prix mort : le
 * lecteur appelle CE point pour récupérer la VRAIE valeur du moment chez le fournisseur.
 * Démo branchée sur AliExpress (clés réelles présentes). Caché 5 min (ne pas spammer l'API).
 * Doctrine grounding : on renvoie le prix RÉEL renvoyé par le fournisseur, jamais inventé.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getProvider } from '@/lib/cards/providers';
import { cacheRemember } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const providerKey = (url.searchParams.get('provider') || '').trim();
  const ref = (url.searchParams.get('ref') || '').trim();
  if (!ref) return NextResponse.json({ ok: false, error: 'ref_required' }, { status: 400 });

  // Aucun fournisseur en dur : on dispatche vers le registre (Card OS providers).
  const provider = getProvider(providerKey);
  if (!provider) return NextResponse.json({ ok: false, error: 'provider_inconnu' }, { status: 400 });
  if (!provider.configured()) return NextResponse.json({ ok: false, error: 'provider_non_configure' }, { status: 503 });

  try {
    const data = await cacheRemember(`hydrate:${provider.key}:${ref.toLowerCase()}`, 300, () => provider.resolvePrice(ref));
    if (!data) return NextResponse.json({ ok: false, error: 'aucun_resultat' }, { status: 404 });
    return NextResponse.json({ ok: true, provider: provider.key, live: true, fetchedAt: Date.now(), ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erreur_fournisseur' }, { status: 502 });
  }
}
