/**
 * Talk2Me — FRAÎCHEUR de l'article (page-entité vivante, Pascal 2026-07-08).
 * Un article peut être solide sur le fond mais DATÉ (ex. doc de 1971 : « 57 000 habitants »
 * alors que la ville en compte 300 000+ aujourd'hui). On détecte l'année la plus récente
 * citée → si trop vieille, on signale « à rafraîchir ». Le rafraîchissement (Léa + sources
 * actuelles) vit dans merge.ts (`refreshArticle`).
 */

/** Année la plus récente citée + si l'article est probablement daté (> 6 ans). */
export function articleFreshness(body: string): { latestYear: number | null; stale: boolean } {
  const years = (body || '').match(/\b(19[5-9]\d|20[0-4]\d)\b/g);
  if (!years || years.length === 0) return { latestYear: null, stale: false };
  const latestYear = Math.max(...years.map(Number));
  const currentYear = new Date().getFullYear();
  return { latestYear, stale: currentYear - latestYear > 6 };
}
