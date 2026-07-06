/**
 * lib/cards/providers — REGISTRE DE FOURNISSEURS pour l'hydratation live des cards
 * (Card OS, Pascal 2026-06-30). Le cœur ne connaît AUCUN fournisseur en dur : chacun
 * est un PLUG enregistré. AliExpress aujourd'hui ; Banggood / BigBuy / Booking / Stripe
 * demain = un `registerProvider({...})` de plus, sans toucher aux lecteurs ni à l'endpoint.
 * Doctrine : la Card décrit (provider + ref), le fournisseur AGIT (renvoie la valeur réelle).
 * Server-only (tire les connecteurs). Ne pas importer côté client.
 */
import { aeDropConfigured, aeDropSearch } from '@/lib/aliexpress-dropship';

export interface LiveValue {
  price?: number;
  currency?: string;
  name?: string;
  image?: string | null;
  ref?: string; // identifiant produit résolu côté fournisseur
}

export interface CardProvider {
  key: string;
  label: string;
  configured: () => boolean;                       // clés présentes ?
  resolvePrice: (ref: string) => Promise<LiveValue | null>; // valeur RÉELLE du moment
}

const REGISTRY: Record<string, CardProvider> = {};

export function registerProvider(p: CardProvider): void { REGISTRY[p.key.toLowerCase()] = p; }
export function getProvider(key: string): CardProvider | undefined { return REGISTRY[(key || '').toLowerCase()]; }
export function listProviders(): { key: string; label: string; configured: boolean }[] {
  return Object.values(REGISTRY).map((p) => ({ key: p.key, label: p.label, configured: p.configured() }));
}

// ─── PLUG #1 : AliExpress (clés réelles présentes). Un exemple, pas une dépendance dure. ───
registerProvider({
  key: 'aliexpress',
  label: 'AliExpress',
  configured: aeDropConfigured,
  resolvePrice: async (ref) => {
    const products = await aeDropSearch(ref, 1, 5);
    const p = products.find((x) => typeof x.price === 'number');
    return p ? { price: p.price as number, currency: 'EUR', name: p.name, image: p.image, ref: p.pid } : null;
  },
});

// ─── PLUGS FUTURS (même forme, à activer quand on aura les clés) ───
// registerProvider({ key: 'banggood', label: 'Banggood', configured: () => !!process.env.BANGGOOD_APP_ID, resolvePrice: async (ref) => {/* … */ return null;} });
// registerProvider({ key: 'bigbuy',   label: 'BigBuy',   configured: () => !!process.env.BIGBUY_API_KEY,  resolvePrice: async (ref) => {/* … */ return null;} });
// registerProvider({ key: 'booking',  label: 'Booking',  configured: () => false, resolvePrice: async () => null });
