/**
 * Talk2Me AI Fuzz Tester #405 — Profile types (Pascal 2026-06-05).
 *
 * Un profile = générateur de prompts + métadonnées d'oracle (expected_intent,
 * expected_tool, expected_card_kind, forbidden_patterns, required_patterns).
 *
 * Doctrine [[talk2me-ai-consciousness-core]] : chaque prompt sait ce qu'il
 * attend (intent / tool / card) → on peut valider la réponse automatiquement.
 *
 * Doctrine [[feedback-fuzz-rapport-obligatoire]] : chaque prompt est tracé,
 * compté, rapporté.
 *
 * Format d'un prompt :
 * {
 *   text: string,                   // ce qu'on envoie à Léa
 *   expected_intent: string|null,   // 'hotel', 'restaurant', 'youtube_video', ...
 *   expected_tool: string|null,     // 'search_place', 'search_youtube', ...
 *   expected_card_kind: string|null,// 'PlaceCard', 'YouTubeCard', null=texte
 *   forbidden_patterns: string[],   // regex-strings que la réponse NE DOIT PAS contenir
 *   required_patterns: string[],    // regex-strings que la réponse DOIT contenir
 *   mode: string,                   // 'chat' (défaut), 'card_editor_video', ...
 *   skip_validators: string[],      // validators à zapper pour ce prompt précis
 * }
 *
 * Un profile expose :
 *   - name: 'novice'|'presse'|...
 *   - description: string court humain
 *   - generate(count: number): Prompt[]  → renvoie `count` prompts (avec rotation/random)
 */

// Re-export rien — ce fichier sert juste de doc/référence type.
export const PROFILE_INTERFACE_VERSION = 1;
