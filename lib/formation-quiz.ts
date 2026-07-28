/**
 * Talk2Me — Quiz de fin de formation (Pascal 2026-07-27). Permet au validateur de valider À DISTANCE,
 * sur PREUVE : le recruté doit RÉUSSIR ce test (les règles sacrées). Les bonnes réponses restent
 * CÔTÉ SERVEUR (jamais envoyées au client) ; le client ne reçoit que les questions.
 */
export interface QuizQuestion { q: string; options: string[]; correct: number }

const QUESTIONS: QuizQuestion[] = [
  { q: "À qui appartient la fiche d'un commerce ?", options: ['À toi, le contributeur', "À l'opérateur (le patron)", 'À Talk2Me'], correct: 1 },
  { q: "Un client te propose de payer en cash « pour aller plus vite ». Tu fais quoi ?", options: ["J'accepte, c'est plus simple", 'Je refuse — tout passe par l\'app (escrow)', 'Je demande à mon parrain'], correct: 1 },
  { q: 'Comment es-tu payé ?', options: ["Sur le nombre de fiches que j'inscris", 'Sur les VRAIES ventes des commerces', "Un salaire fixe de Talk2Me"], correct: 1 },
  { q: 'Amener un commerce ≠ le servir. Lequel donne la commission qui DURE ?', options: ['Amener (la prime one-shot)', 'Servir (le référent LOCAL)', 'Les deux pareil'], correct: 1 },
  { q: "Quand l'escrow libère-t-il l'argent au vendeur ?", options: ['Dès que le client paie', 'À la livraison réelle (code + photo)', "Quand le contributeur le décide"], correct: 1 },
  { q: 'Peux-tu être le référent de ta PROPRE boutique ?', options: ['Oui', 'Non — le référent sert un AUTRE'], correct: 1 },
];

export const PASS_SCORE = 5; // sur 6

/** Questions SANS la bonne réponse (pour le client). */
export function publicQuestions(): { q: string; options: string[] }[] {
  return QUESTIONS.map((x) => ({ q: x.q, options: x.options }));
}

/** Corrige : renvoie score / total et si c'est réussi. */
export function gradeQuiz(answers: number[]): { score: number; total: number; passed: boolean } {
  const total = QUESTIONS.length;
  let score = 0;
  for (let i = 0; i < total; i++) if (answers[i] === QUESTIONS[i].correct) score++;
  return { score, total, passed: score >= PASS_SCORE };
}
