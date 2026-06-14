'use server-only';

/**
 * Module NICHES (Pascal 2026-06-11 : « il faut qu'il propose des niches
 * rentables »). Comme le VidIQ de la masterclass : l'IA (DeepSeek) propose des
 * niches YouTube faceless « océan bleu » (peu de concurrence, evergreen,
 * monétisables). Doctrine [[project_talk2me_faceless_youtube_engine]].
 */

import OpenAI from 'openai';

export interface Niche {
  name: string;          // nom de la niche
  audience: string;      // pour qui
  why: string;           // pourquoi c'est rentable / océan bleu
  exampleTitles: string[]; // 2-3 titres de vidéos qui cartonnent
  competition: string;   // 'faible' | 'moyenne'
  rpmHint: string;       // potentiel de revenu indicatif
}

function client(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 40000, maxRetries: 1 });
}

const FALLBACK: Niche[] = [
  { name: 'Histoires pour dormir', audience: 'adultes stressés, insomnie', why: 'Demande énorme et constante, peu de concurrence FR, vidéos longues = fort watch time', exampleTitles: ['Une histoire calme pour t’endormir en 10 minutes', 'Pluie et récit apaisant pour un sommeil profond'], competition: 'faible', rpmHint: 'RPM élevé (audience adulte)' },
  { name: 'Sagesse stoïcienne', audience: 'hommes 25-45 en quête de sens', why: 'Communauté fidèle, contenu evergreen, citations intemporelles', exampleTitles: ['5 leçons de Marc Aurèle pour rester calme', 'La routine matinale d’un stoïcien'], competition: 'moyenne', rpmHint: 'RPM correct, forte rétention' },
  { name: 'Remèdes naturels & santé', audience: 'seniors, bien-être', why: 'Audience large, RPM élevé (santé), sujets infinis', exampleTitles: ['Ce que l’ail fait à ton corps après 60 ans', 'Le truc à l’oignon contre les nuits agitées'], competition: 'moyenne', rpmHint: 'RPM très élevé (niche santé)' },
  { name: 'Contes & légendes du monde', audience: 'amateurs d’histoires, familles', why: 'Catalogue infini, peu exploité en FR, visuels IA parfaits', exampleTitles: ['La légende oubliée du royaume englouti', 'Contes africains : la ruse du lièvre'], competition: 'faible', rpmHint: 'RPM moyen, gros volume de vues' },
  { name: 'Faits fascinants & mystères', audience: 'curieux, 18-40', why: 'Très partageable, sujets sans fin, fort taux de clic', exampleTitles: ['10 faits que ton cerveau refuse de croire', 'Le mystère jamais résolu de…'], competition: 'moyenne', rpmHint: 'RPM moyen, viralité' },
];

/**
 * Propose des niches rentables. `theme` optionnel = oriente vers un domaine.
 * Fallback déterministe si DeepSeek indispo.
 */
export async function proposeNiches(theme?: string, count = 6): Promise<Niche[]> {
  const want = Math.min(Math.max(count, 3), 10);
  const c = client();
  if (c) {
    try {
      const completion = await c.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        temperature: 0.8,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Tu es expert en chaînes YouTube faceless monétisées (automatisation IA). ' +
              'Tu proposes des niches « océan bleu » : forte demande, FAIBLE concurrence (surtout en France), evergreen, ' +
              'monétisables, réalisables 100% en IA (script + voix + images, sans montrer son visage). ' +
              'Réponds en JSON {"niches":[{"name","audience","why","exampleTitles":[..],"competition":"faible|moyenne","rpmHint"}]}. ' +
              `${want} niches. Concret, en français, pas de blabla, pas de niche ultra-saturée (gaming, react, vlog).`,
          },
          { role: 'user', content: theme ? `Domaine souhaité : ${theme.slice(0, 200)}` : 'Propose-moi les meilleures niches rentables du moment.' },
        ],
      });
      const raw = completion.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(raw) as { niches?: Niche[] };
      const out = (parsed.niches || [])
        .filter((nz) => nz && nz.name)
        .slice(0, want)
        .map((nz) => ({
          name: String(nz.name).slice(0, 80),
          audience: String(nz.audience || '').slice(0, 120),
          why: String(nz.why || '').slice(0, 240),
          exampleTitles: (nz.exampleTitles || []).slice(0, 3).map((x) => String(x).slice(0, 120)),
          competition: nz.competition === 'moyenne' ? 'moyenne' : 'faible',
          rpmHint: String(nz.rpmHint || '').slice(0, 80),
        }));
      if (out.length >= 3) return out;
    } catch { /* fallback */ }
  }
  return FALLBACK.slice(0, want);
}
