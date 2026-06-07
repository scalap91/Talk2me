/**
 * N5 — Snapshot du user owner (Pascal 2026-06-04).
 *
 * Profil + memories + habits + stats cards. Toutes les sources existent déjà :
 *   - getUserById          → profil
 *   - getAiMemories        → mémoires structurées
 *   - getUserHabitsGrouped → habitudes apprises
 *   - getUserPublishedCards / getSavedCards / getDrafts → stats
 *
 * Doctrine [[talktome-raisonnement-ia]] + [[talktome-ia-persistance-isolation]] :
 *   "L'IA doit CONSULTER les habitudes AVANT d'appeler un tool."
 *   "NE MENTIONNE JAMAIS à l'user que tu utilises ses habitudes (pipeline interne)."
 *
 * Strictement scopé user_id : zéro leak cross-user.
 */

import {
  getUserById,
  getAiMemories,
  getUserHabitsGrouped,
  getUserPublishedCards,
  getSavedCards,
  getDrafts,
  type DbUserHabit,
} from '@/lib/db';
import type { ConsciousnessContext } from './types';

const MEMORY_LIMIT = 15;
const PER_KIND_HABIT_LIMIT = 5;

function ownerNameOf(user: { display_name: string | null; username: string }): string {
  const dn = (user.display_name || '').trim();
  if (dn) return dn;
  return user.username || 'l\'utilisateur';
}

function fmtDate(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}

function formatHabitLine(h: DbUserHabit): string {
  return `${h.value} (×${h.occurrences})`;
}

function joinHabits(list: DbUserHabit[]): string {
  if (list.length === 0) return '—';
  return list.map(formatHabitLine).join(', ');
}

export async function buildUserSnapshot(ctx: ConsciousnessContext): Promise<string> {
  const user = getUserById(ctx.userId);
  if (!user) {
    return ['## CET UTILISATEUR', '- (user non résolu)'].join('\n');
  }

  const owner = ownerNameOf(user);

  // Stats : nombre cards publiées, saved, drafts. Helpers retournent listes
  // tronquées (par défaut limit 50) — c'est largement assez pour un compteur
  // affiché en conscience. On évite un COUNT(*) supplémentaire.
  const publishedCount = getUserPublishedCards(ctx.userId, 200, 0).length;
  const savedCount = getSavedCards(ctx.userId, 200, 0).length;
  const draftsCount = getDrafts(ctx.userId, 200, 0).length;

  const memories = getAiMemories(ctx.userId, MEMORY_LIMIT);
  const habits = getUserHabitsGrouped(ctx.userId, PER_KIND_HABIT_LIMIT);

  const lines: string[] = [];
  lines.push(`## CET UTILISATEUR : ${owner}`);
  lines.push('');
  lines.push('Profil :');
  lines.push(`- Nom : ${owner}`);
  lines.push(`- Pseudo : @${user.username}`);
  // Talk2Me PII air-gap Layer 1 (Pascal 2026-06-05) — talk2me_id, email,
  // created_at retirés du system prompt. L'IA n'a pas à connaître ces infos.
  // Doctrine [[talk2me-pii-air-gap]] verbatim : "cette info en general ne
  // dois meme pas passer dans les tuyaux de l'IA". Seules display_name +
  // username + stats publiques sont autorisés.
  lines.push(`- Cards publiées : ${publishedCount}`);
  lines.push(`- Cards saved : ${savedCount}`);
  lines.push(`- Brouillons : ${draftsCount}`);
  lines.push('');

  lines.push('Mémoires sur lui :');
  if (memories.length === 0) {
    lines.push('- (aucune mémoire enregistrée pour le moment)');
  } else {
    for (const m of memories) {
      lines.push(`- [${m.kind}] ${m.content}`);
    }
  }
  lines.push('');

  lines.push('Habitudes apprises (×N = nombre d\'occurrences observées) :');
  const hasAnyHabit =
    habits.music_artist.length +
      habits.music_genre.length +
      habits.food_pref.length +
      habits.place_visited.length +
      habits.topic.length +
      habits.contact.length +
      habits.search_pattern.length >
    0;
  if (!hasAnyHabit) {
    lines.push('- (pas encore d\'habitude détectée)');
  } else {
    if (habits.music_artist.length || habits.music_genre.length) {
      lines.push(`- Musique : ${joinHabits(habits.music_artist)} | Genres : ${joinHabits(habits.music_genre)}`);
    }
    if (habits.place_visited.length) {
      lines.push(`- Lieux fréquents : ${joinHabits(habits.place_visited)}`);
    }
    if (habits.food_pref.length) {
      lines.push(`- Cuisine / nourriture : ${joinHabits(habits.food_pref)}`);
    }
    if (habits.topic.length) {
      lines.push(`- Sujets fréquents : ${joinHabits(habits.topic)}`);
    }
    if (habits.contact.length) {
      lines.push(`- Contacts mentionnés : ${joinHabits(habits.contact)}`);
    }
    if (habits.search_pattern.length) {
      lines.push(`- Patterns de recherche : ${joinHabits(habits.search_pattern)}`);
    }
  }
  lines.push('');

  lines.push(
    `J'utilise cette connaissance pour DÉSAMBIGUÏSER et PERSONNALISER, mais JAMAIS pour verbaliser le pipeline ("D'après tes habitudes..." → INTERDIT).`,
  );

  return lines.join('\n');
}
