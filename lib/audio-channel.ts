/**
 * Talk2Me #337 (Pascal 2026-06-04) — Audio channel exclusif.
 *
 * Singleton client-only qui garantit qu'UNE SEULE source audio joue à la fois
 * dans toute l'app (typiquement dans une conversation). Toute nouvelle source
 * qui demande la parole pause la précédente.
 *
 * Doctrine [[talk2me-consolidation-socle]] : audio exclusif est une fondation
 * UX (sinon cacophonie en scrollant le flux de cards).
 */

export interface AudioParticipant {
  /** ID unique stable côté composant (typiquement `videoId` ou `messageId`). */
  id: string;
  /** Appelé par le canal quand une autre source prend la parole. */
  pause: () => void;
  /** Optionnel : mute sans pause (cas iframe non contrôlable). */
  mute?: () => void;
}

class AudioChannel {
  private current: AudioParticipant | null = null;

  /**
   * Demande à devenir la source active. Si une autre source était active,
   * elle est pausée AVANT le retour de cette méthode.
   */
  request(p: AudioParticipant): void {
    if (this.current && this.current.id !== p.id) {
      try {
        this.current.pause();
      } catch {
        // silencieux : le composant a peut-être déjà unmount
      }
    }
    this.current = p;
  }

  /**
   * Libère le canal si je suis la source active. Sinon no-op (un autre
   * a déjà pris ma place).
   */
  release(id: string): void {
    if (this.current?.id === id) {
      this.current = null;
    }
  }

  /** Pour tests / debug : la source active courante. */
  getCurrentId(): string | null {
    return this.current?.id ?? null;
  }
}

export const audioChannel = new AudioChannel();
