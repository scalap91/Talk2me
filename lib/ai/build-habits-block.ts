/**
 * Talk2Me #338 — Formatte le bloc <habitudes_utilisateur> à injecter dans
 * le system prompt DeepSeek.
 *
 * Doctrine [[talk2me-roadmap-6-phases]] Phase 1 + [[talktome-raisonnement-ia]] :
 *   "L'IA doit CONSULTER les habitudes AVANT d'appeler un tool. Si user écoute
 *    du rap, 'Mets-moi Check' → query enrichie 'Young Thug Check' (jamais
 *    query mot-brut isolé 'Check')."
 *
 * Top N par kind. Si aucune habit : bloc vide (pas d'injection inutile).
 */

import { getUserHabitsGrouped, type DbUserHabit } from '@/lib/db';

const PER_KIND_LIMIT = 5;

function formatHabitLine(h: DbUserHabit): string {
  // Affichage compact : "value (×N)" — la pondération exacte n'aide pas
  // DeepSeek, l'occurrence rapide suffit comme signal.
  return `${h.value} (×${h.occurrences})`;
}

function joinList(habits: DbUserHabit[]): string {
  if (habits.length === 0) return '—';
  return habits.map(formatHabitLine).join(', ');
}

export interface BuildHabitsBlockOpts {
  /** Nom affiché dans le bloc ("Pascal", "Karim"…). Default "l'utilisateur". */
  ownerName?: string;
}

export function buildHabitsBlock(
  userId: string,
  opts?: BuildHabitsBlockOpts,
): string {
  if (!userId) return '';
  const grouped = getUserHabitsGrouped(userId, PER_KIND_LIMIT);
  const totalCount =
    grouped.music_artist.length +
    grouped.music_genre.length +
    grouped.food_pref.length +
    grouped.place_visited.length +
    grouped.topic.length +
    grouped.contact.length +
    grouped.search_pattern.length;
  if (totalCount === 0) return '';

  const ownerName = opts?.ownerName || "l'utilisateur";
  const lines: string[] = [];
  lines.push(`\n\n=== HABITUDES DE ${ownerName.toUpperCase()} (apprises par observation) ===`);
  lines.push(
    'Tu connais cet utilisateur grâce à ses interactions passées. Voici ses préférences (×N = nombre d\'occurrences observées, plus N est élevé plus c\'est ancré) :',
  );
  if (grouped.music_artist.length || grouped.music_genre.length) {
    lines.push(
      `- Musique : ${joinList(grouped.music_artist)} | Genres : ${joinList(grouped.music_genre)}`,
    );
  }
  if (grouped.place_visited.length) {
    lines.push(`- Lieux fréquents : ${joinList(grouped.place_visited)}`);
  }
  if (grouped.food_pref.length) {
    lines.push(`- Cuisine / nourriture : ${joinList(grouped.food_pref)}`);
  }
  if (grouped.topic.length) {
    lines.push(`- Sujets fréquents : ${joinList(grouped.topic)}`);
  }
  if (grouped.contact.length) {
    lines.push(`- Contacts mentionnés : ${joinList(grouped.contact)}`);
  }
  lines.push('');
  lines.push(
    'RÈGLE ABSOLUE : utilise ces habitudes pour DÉSAMBIGUÏSER les requêtes ambiguës AVANT d\'appeler un tool.',
  );
  lines.push(
    'Exemple : "Mets-moi Check" + user écoute Young Thug et rap → search_youtube({query: "Young Thug Check"}) PAS query="Check".',
  );
  lines.push(
    'Exemple : "Resto japonais" + user fréquente Paris → search_place({amenity:"restaurant", city:"Paris"}).',
  );
  lines.push(
    'JAMAIS de tool call avec query=mot-brut isolé sans avoir consulté ces habitudes.',
  );
  lines.push(
    'Si malgré les habitudes la requête reste ambiguë → pose UNE question courte naturelle.',
  );
  lines.push(
    'NE MENTIONNE JAMAIS explicitement à l\'user que tu utilises ses habitudes (ce serait dévoiler ton pipeline interne, INTERDIT).',
  );
  return lines.join('\n');
}
