/**
 * Talk2Me — RÉPUTATION contributeur + BADGES (page-entité vivante, M4, Pascal 2026-07-08).
 * La réputation se CALCULE des signaux existants (pas de compteur à maintenir) :
 * + contributions retenues, + fiabilité moyenne des entités enrichies, − entités signalées.
 * « Un bon contributeur monte, un pollueur descend. » Badges = paliers de qualité.
 */
import { getDb } from '@/lib/db';
import { getRatingSummary } from './ratings';

export interface Badge {
  key: string;
  label: string;
}
export interface Reputation {
  userId: string;
  contributions: number;
  score: number;
  avgFiability: number | null;
  flaggedCount: number;
  badges: Badge[];
}

export function getReputation(userId: string): Reputation {
  // NB : card_contributors stocke l'entityRef dans la colonne `card_id` (nom historique).
  let contribs: { card_id: string }[] = [];
  try {
    contribs = getDb()
      .prepare('SELECT card_id FROM card_contributors WHERE user_id = ?')
      .all(userId) as { card_id: string }[];
  } catch {
    contribs = [];
  }
  const contributions = contribs.length;

  let fiableSum = 0;
  let rated = 0;
  let flaggedCount = 0;
  for (const c of contribs) {
    const s = getRatingSummary(c.card_id);
    if (s.total > 0) {
      fiableSum += s.score;
      rated += 1;
    }
    if (s.flagged) flaggedCount += 1;
  }
  const avgFiability = rated > 0 ? Math.round(fiableSum / rated) : null;

  // Score : contributions valorisées, bonus/malus selon la fiabilité, pénalité par entité signalée.
  let score = contributions * 10;
  if (avgFiability != null) score += Math.round((avgFiability - 50) / 2);
  score -= flaggedCount * 15;
  score = Math.max(0, score);

  const badges: Badge[] = [];
  if (contributions >= 1) badges.push({ key: 'contributeur', label: 'Contributeur' });
  if (contributions >= 10) badges.push({ key: 'actif', label: 'Contributeur actif' });
  if (contributions >= 5 && (avgFiability ?? 0) >= 70) badges.push({ key: 'confiance', label: 'Éditeur de confiance' });
  if (contributions >= 25 && (avgFiability ?? 0) >= 75) badges.push({ key: 'expert', label: 'Expert' });

  return { userId, contributions, score, avgFiability, flaggedCount, badges };
}

/** Badge le plus prestigieux d'un user (pour affichage compact, ex. byline). Ou null. */
export function topBadge(userId: string): Badge | null {
  const b = getReputation(userId).badges;
  return b.length ? b[b.length - 1] : null;
}
