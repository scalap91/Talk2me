import 'server-only';
import OpenAI from 'openai';

/**
 * Talk2Me — Reformulation de la description boutique (Pascal 2026-06-11).
 * Le vendeur écrit lui-même un minimum de texte ; l'IA le REMET PROPRE
 * (orthographe, grammaire, formulation) SANS RIEN AJOUTER NI RETIRER.
 * Aucune invention de fait. En cas d'échec → on renvoie le texte d'origine intact.
 */
export async function refineDescription(text: string): Promise<{ refined: string; changed: boolean }> {
  const original = (text || '').trim();
  if (!original) return { refined: '', changed: false };
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { refined: original, changed: false };

  try {
    const client = new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 30000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content:
            "Tu es correcteur. On te donne la description d'une boutique écrite par un vendeur. " +
            "Réécris-la PROPREMENT : corrige l'orthographe, la grammaire, la ponctuation et la formulation pour que ce soit clair et agréable. " +
            "RÈGLES ABSOLUES : n'AJOUTE aucune information, aucun fait, aucun produit, aucun chiffre qui ne soit pas déjà dans le texte. " +
            "Ne RETIRE aucune information présente. Garde la même langue et le même sens. " +
            "Pas de guillemets, pas de préambule, pas de commentaire : renvoie UNIQUEMENT la description corrigée.",
        },
        { role: 'user', content: original },
      ],
    });
    let refined = (res.choices?.[0]?.message?.content || '').trim();
    // Sécurité : enlève d'éventuels guillemets enveloppants.
    refined = refined.replace(/^["«»“”]+|["«»“”]+$/g, '').trim();
    // Garde-fou anti-dérive : si l'IA a beaucoup rallongé (>60% de plus), on
    // suspecte un ajout d'info → on garde l'original (grounding).
    if (!refined || refined.length > original.length * 1.6) return { refined: original, changed: false };
    return { refined, changed: refined !== original };
  } catch {
    return { refined: original, changed: false };
  }
}
