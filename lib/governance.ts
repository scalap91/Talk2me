import 'server-only';

/**
 * Talk2Me — GARDE DE PORTÉE de la gouvernance (Pascal 2026-08-02).
 *
 * Les droits (lib/permissions) disent CE QU'on peut faire ; ce module dit SUR QUI et OÙ.
 * Sans lui, un droit est GLOBAL : un chef de zone pourrait sanctionner n'importe qui,
 * n'importe où. Deux règles validées par Pascal, non négociables :
 *
 *  1. Pour SANCTIONNER / JUGER une cible :  rang STRICTEMENT supérieur
 *       + cible dans MA ZONE géographique  ET  dans MA LIGNÉE (arbre de parrainage).
 *     → « zone ET lignée » : les deux obligatoires. Pas de sanction entre pairs de même rang.
 *  2. Pour UTILISER un outil terrain (resto/transport/annonces) : la zone visée doit être
 *     ⊆ mon périmètre (territory_max de mon rang).
 *
 * La RACINE (super-admin AI_OPS_ADMIN) passe partout : au départ elle détient tout et
 * délègue au fur et à mesure que les étages se remplissent. Aucun argent n'est déplacé ici :
 * on autorise ou on refuse un GESTE, c'est tout.
 */
import { getNetworkDb } from '@/lib/network-db';
import { getContributor, type Contributor } from '@/lib/network';
import { hasPermission } from '@/lib/permissions';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';

// Outils « terrain » soumis au périmètre géographique (alignés sur lib/permissions).
const OUTILS_TERRAIN = new Set(['eat', 'transport', 'annonces']);

type Territoire = { country?: string | null; region?: string | null; city?: string | null; quartier?: string | null };

/** territory_max du rang → colonnes territoire à faire correspondre (hiérarchie englobante). */
const CHAMPS_PAR_PORTEE: Record<string, (keyof Territoire)[]> = {
  pays: ['country'],
  region: ['country', 'region'],
  ville: ['country', 'region', 'city'],
  quartier: ['country', 'region', 'city', 'quartier'],
};

const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase();

/** territory_max de l'échelon (mémoïsé le temps du process). */
const _porteeCache = new Map<number, string>();
function porteeDuRang(rank: number): string {
  const hit = _porteeCache.get(rank);
  if (hit) return hit;
  const row = getNetworkDb().prepare('SELECT territory_max FROM contributor_levels WHERE rank = ?').get(rank) as { territory_max: string } | undefined;
  const val = row?.territory_max || 'quartier'; // défaut le plus restrictif = le plus sûr
  _porteeCache.set(rank, val);
  return val;
}

/**
 * La zone `cible` est-elle DANS le périmètre de l'acteur (à la granularité de son rang) ?
 * Tous les champs englobants doivent être renseignés côté acteur ET identiques côté cible.
 * Un champ manquant côté acteur = pas de zone prouvée = refus (on ne présume jamais l'autorité).
 */
function territoireCouvre(acteur: Territoire, cible: Territoire, territoryMax: string): boolean {
  const champs = CHAMPS_PAR_PORTEE[territoryMax] || CHAMPS_PAR_PORTEE.quartier;
  for (const f of champs) {
    const a = norm(acteur[f]);
    if (!a || a !== norm(cible[f])) return false;
  }
  return true;
}

/**
 * L'acteur est-il un ASCENDANT de la cible (la cible est dans sa downline) ?
 * On remonte la chaîne de parrainage depuis la cible ; garde anti-boucle.
 */
export function estDansLignee(acteurId: string, cibleId: string): boolean {
  if (acteurId === cibleId) return false;
  const cible = getContributor(cibleId);
  if (!cible) return false;
  const vus = new Set<string>([cibleId]);
  let up = cible.sponsor_id;
  let garde = 0;
  while (up && !vus.has(up) && garde < 10000) {
    if (up === acteurId) return true;
    vus.add(up);
    up = getContributor(up)?.sponsor_id ?? null;
    garde++;
  }
  return false;
}

/**
 * L'ACTEUR peut-il exercer un pouvoir de gouvernance (juger, geler, rétrograder, retirer) SUR la CIBLE ?
 * Racine = oui. Sinon : acteur actif + rang STRICTEMENT supérieur + cible dans sa ZONE ET sa LIGNÉE.
 */
export function peutAgirSur(
  acteurId: string,
  acteurEmail: string | null | undefined,
  cibleId: string,
): boolean {
  if (isAiOpsAdmin(acteurId, acteurEmail)) return true; // la racine tranche partout
  if (acteurId === cibleId) return false;               // on ne s'auto-sanctionne pas

  const acteur = getContributor(acteurId);
  if (!acteur || acteur.status !== 'active') return false; // un acteur gelé/banni n'a aucun pouvoir
  const cible = getContributor(cibleId);
  if (!cible) return false;

  if (acteur.level_rank <= cible.level_rank) return false;      // rang STRICTEMENT au-dessus (pas de pair)
  if (!estDansLignee(acteurId, cibleId)) return false;         // LIGNÉE obligatoire
  if (!territoireCouvre(acteur, cible, porteeDuRang(acteur.level_rank))) return false; // ZONE obligatoire
  return true; // zone ET lignée ET rang strict
}

/**
 * L'ACTEUR peut-il EMPLOYER `outil` (éventuellement ciblé sur `zone`) ?
 * Fusionne le droit ouvert (lib/permissions) avec le périmètre géographique pour les outils terrain.
 * Nommer un validateur / ouvrir le rail argent restent gouvernés par permissions (staff-only).
 */
export function peutUtiliser(
  acteurId: string,
  acteurEmail: string | null | undefined,
  outil: string,
  zone?: Territoire | null,
): boolean {
  if (isAiOpsAdmin(acteurId, acteurEmail)) return true;
  if (!hasPermission(acteurId, acteurEmail, outil)) return false; // droit non ouvert = non

  if (OUTILS_TERRAIN.has(outil) && zone) {
    const acteur = getContributor(acteurId);
    if (!acteur || acteur.status !== 'active') return false;
    if (!territoireCouvre(acteur, zone, porteeDuRang(acteur.level_rank))) return false; // hors de sa zone
  }
  return true;
}

/** Raison lisible d'un refus (pour l'UI / les logs de gouvernance). Null si autorisé. */
export function refusAgirSur(
  acteurId: string,
  acteurEmail: string | null | undefined,
  cibleId: string,
): string | null {
  if (isAiOpsAdmin(acteurId, acteurEmail)) return null;
  if (acteurId === cibleId) return 'On ne peut pas se sanctionner soi-même.';
  const acteur = getContributor(acteurId);
  if (!acteur || acteur.status !== 'active') return 'Votre rôle est inactif ou gelé.';
  const cible = getContributor(cibleId);
  if (!cible) return 'Cible introuvable dans le réseau.';
  if (acteur.level_rank <= cible.level_rank) return 'Cible de rang égal ou supérieur : seul un supérieur (ou la racine) peut agir.';
  if (!estDansLignee(acteurId, cibleId)) return 'Cette personne n’est pas dans votre lignée.';
  if (!territoireCouvre(acteur, cible, porteeDuRang(acteur.level_rank))) return 'Cette personne est hors de votre zone.';
  return null;
}

export type { Contributor };
