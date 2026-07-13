import 'server-only';
import OpenAI from 'openai';

/**
 * Talk2Me — Reformulation de la description boutique (Pascal 2026-06-11).
 * Le vendeur écrit lui-même un minimum de texte ; l'IA le REMET PROPRE
 * (orthographe, grammaire, formulation) SANS RIEN AJOUTER NI RETIRER.
 * Aucune invention de fait. En cas d'échec → on renvoie le texte d'origine intact.
 */
/**
 * Corrige une ANNONCE ENTIÈRE (Pascal 2026-07-12) : regarde TOUS les champs (titre, catégorie,
 * ville, prix) pour comprendre de quoi il s'agit — une description seule peut être incomplète —
 * puis réécrit PROPREMENT le titre ET la description. Garde la langue (FR/malgache), n'invente rien.
 */
export async function refineAnnonce(fields: { title?: string; description?: string; category?: string; city?: string; price?: string; visionLabels?: string[] }): Promise<{ title: string; description: string }> {
  const title = (fields.title || '').trim();
  const description = (fields.description || '').trim();
  const fallback = { title, description };
  if (!title && !description) return fallback;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return fallback;
  try {
    const client = new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 30000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            "Tu es correcteur de PETITES ANNONCES (marketplace). On te donne les champs d'une annonce, souvent mal orthographiés et parfois INCOMPLETS. " +
            "Regarde l'ENSEMBLE des champs (titre, catégorie, ville, prix, description) pour comprendre DE QUOI il s'agit, puis réécris PROPREMENT le TITRE et la DESCRIPTION : orthographe, grammaire, ponctuation, formulation claire et sobre. " +
            "LANGUE : garde EXACTEMENT la langue d'origine (français OU malgache), ne traduis JAMAIS. " +
            "VISION : si un champ \"vision_photo\" liste ce que la caméra a DÉTECTÉ sur la photo (objets/couleurs), sers-t'en pour COMPRENDRE l'intention et CONFIRMER/compléter le produit et la couleur (ex. l'user écrit 'noi' + la photo montre 'Black' → 'noir'). Mais reste cohérent avec le texte de l'user : la vision AIDE, elle ne remplace pas. " +
            "GROUNDING STRICT : n'invente AUCUN fait, chiffre ou caractéristique qui ne soit pas présent dans les champs OU détecté sur la photo. Ne retire aucune info présente. " +
            "Réponds UNIQUEMENT en JSON : {\"title\": \"…\", \"description\": \"…\"}.",
        },
        { role: 'user', content: JSON.stringify({ titre: title, categorie: fields.category || '', ville: fields.city || '', prix: fields.price || '', description, vision_photo: (fields.visionLabels || []).slice(0, 12) }) },
      ],
    });
    const raw = (res.choices?.[0]?.message?.content || '').trim();
    const parsed = JSON.parse(raw) as { title?: unknown; description?: unknown };
    const t = typeof parsed.title === 'string' ? parsed.title.replace(/^["«»“”]+|["«»“”]+$/g, '').trim() : '';
    const d = typeof parsed.description === 'string' ? parsed.description.replace(/^["«»“”]+|["«»“”]+$/g, '').trim() : '';
    return { title: (t || title).slice(0, 200), description: (d || description).slice(0, 2000) };
  } catch {
    return fallback;
  }
}

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
            "Tu es correcteur. On te donne un texte écrit par un utilisateur (description d'annonce, de boutique, légende…), souvent mal orthographié. " +
            "Réécris-le PROPREMENT : corrige l'orthographe, la grammaire, la ponctuation et la formulation pour que ce soit clair et agréable. " +
            "LANGUE : le texte peut être en FRANÇAIS ou en MALGACHE (ou un mélange) — garde EXACTEMENT la langue d'origine, ne traduis JAMAIS. " +
            "RÈGLES ABSOLUES : n'AJOUTE aucune information, aucun fait, aucun produit, aucun chiffre qui ne soit pas déjà dans le texte. " +
            "Ne RETIRE aucune information présente. Garde le même sens. " +
            "Pas de guillemets, pas de préambule, pas de commentaire : renvoie UNIQUEMENT le texte corrigé.",
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
