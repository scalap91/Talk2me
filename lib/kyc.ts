import 'server-only';
/**
 * KYC PLATEFORME (Pascal 2026-09-03) — façon WISE / banque en ligne.
 *
 * Vérif CIN dès l'inscription. La personne peut s'inscrire, POSTER, acheter, discuter —
 * mais TOUTE la partie BUSINESS est GELÉE tant que la CIN n'est pas `verified`.
 *
 * POURQUOI on gèle l'ACCÈS et pas l'argent : T2M est non-custodial (pas la main sur les
 * portefeuilles) et à Mada les cash points ne vérifient pas l'identité → « geler le payout »
 * n'a aucune dent. Le seul levier qu'on maîtrise à 100% = le DROIT DE FAIRE DU BUSINESS SUR T2M.
 * La carotte (vendre, être vu, escrow, badge confiance) ramène les gens vers l'économie
 * formelle + une identité vérifiée. Vision : demain T2M « fait foi » chez d'autres partenaires.
 *
 * La CIN vit déjà dans `transport_profile` (CNI = compte, ancre d'identité). Ici on la lit
 * comme le KYC de la PERSONNE, indépendamment du rôle transporteur.
 */
import { getDb } from '@/lib/db';

export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface KycView {
  status: KycStatus;
  full_name: string | null;   // nom concordant CIN
  phone: string | null;       // numéro d'inscription (users.phone) — JAMAIS modifiable
  sim_attested: boolean;      // la puce est déclarée au nom de la personne
  can_do_business: boolean;   // status === 'verified'
}

type Row = { cni_status?: string; full_name?: string | null; sim_attested?: number | null };

/** Lit le KYC d'une personne. Table/colonne absente ou pas de dossier → 'none' (fail-closed :
 *  pas de preuve d'identité = business fermé, jamais « ouvert par défaut »). */
export function getKyc(userId: string): KycView {
  let row: Row | undefined;
  let phone: string | null = null;
  try {
    const db = getDb();
    row = db.prepare('SELECT cni_status, full_name, sim_attested FROM transport_profile WHERE user_id = ?').get(userId) as Row | undefined;
    phone = (db.prepare('SELECT phone FROM users WHERE id = ?').get(userId) as { phone?: string } | undefined)?.phone || null;
  } catch { /* table/colonne pas encore créée → 'none' */ }
  const status = ((row?.cni_status as KycStatus) || 'none');
  const valid: KycStatus = (['none', 'pending', 'verified', 'rejected'] as const).includes(status) ? status : 'none';
  return {
    status: valid,
    full_name: row?.full_name ?? null,
    phone,
    sim_attested: !!row?.sim_attested,
    can_do_business: valid === 'verified',
  };
}

/**
 * LE GATE UNIQUE. À consulter à CHAQUE entrée business (vendre, boutique, encaisser via escrow,
 * transport/porter un colis, être listé/visible comme pro, rail de paiement pro, formation
 * vendable…). Retourne false tant que la CIN n'est pas vérifiée.
 */
export function canDoBusiness(userId: string): boolean {
  if (!userId) return false;
  return getKyc(userId).status === 'verified';
}

/** Message standard quand la partie business est gelée (côté UI/API). */
export const KYC_BUSINESS_LOCKED =
  "Vérifiez votre identité (CIN) pour débloquer la partie business : vendre, encaisser, boutique, transport. L'inscription et les publications restent libres.";
