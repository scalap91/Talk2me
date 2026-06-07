/**
 * Talk2Me #379 — Constantes T2M Officiel (Pascal 2026-06-05).
 * Doctrine [[talk2me-officiel-ia]].
 *
 * L'id user T2M Officiel est centralisé ici. Override possible via
 * process.env.T2M_OFFICIEL_USER_ID (utile pour staging / tests).
 */
export const T2M_OFFICIEL_USER_ID =
  process.env.T2M_OFFICIEL_USER_ID ||
  '8f508701-fbdb-460f-bd95-e826873f79e1';

/** Username canonique du compte T2M Officiel. */
export const T2M_OFFICIEL_USERNAME = 't2m';

/** Display name affiché côté UI. */
export const T2M_OFFICIEL_DISPLAY_NAME = 'T2M Officiel';
