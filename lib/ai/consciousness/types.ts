/**
 * Talk2Me #339 — AI Consciousness Core (Pascal 2026-06-04).
 *
 * Doctrine [[talk2me-ai-consciousness-core]] :
 *   "Talk2Me n'est pas un chatbot. Talk2Me repose sur des IA personnelles.
 *    Créer un module central obligatoire chargé avant toute réponse :
 *    AI CONSCIOUSNESS CORE. Ce module devient le cerveau permanent de chaque IA."
 *
 * Le bloc consciousness est injecté EN TÊTE du system prompt avant chaque appel
 * DeepSeek. Il rappelle à l'IA qui elle est, à qui elle appartient, quels outils
 * elle a, quelles cards elle peut produire, qui est l'user, ses habitudes, ses
 * amis, et l'isolation stricte vis-à-vis des autres IA Talk2Me.
 *
 * Lot 1 = niveaux 1-7. Lots suivants : context-mode (N8), skills-by-mode (N9),
 * limits (N10), reasoning-checklist (N11), visual-qa (N12).
 */

/**
 * Mode actif de l'IA — détermine les skills gelées (Lot 2 N8/N9).
 * DOIT rester aligné avec `Mode` dans /lib/ai/mode-gate.ts.
 */
export type ConsciousnessMode =
  | 'chat'
  | 'card_editor_video'
  | 'card_editor_image'
  | 'card_editor_text'
  | 'watch_together';

export interface ConsciousnessContext {
  /** ID strictement scope du user owner — sert de clé d'isolation. */
  userId: string;
  /** Mode actif du frontend appelant. Défaut 'chat'. */
  mode?: ConsciousnessMode;
  /** ID conv courante (utile pour debug + futurs niveaux). */
  conversationId?: string;
  /** Si conv P2P : ID du pair (sert N6+N7 pour rappeler l'isolation). */
  peerUserId?: string;
}

export interface ConsciousnessSection {
  /** Identifiant du niveau (1..7 pour Lot 1). */
  level: number;
  /** Titre court du bloc, utilisé pour debug/log. */
  name: string;
  /** Bloc markdown formatté inséré dans le prompt. Vide = bloc skip. */
  body: string;
}
