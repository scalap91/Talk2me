/**
 * Talk2Me — AGENT MARCHAND (#25, Pascal 2026-06-08).
 *
 * Ne RAMASSE pas les produits : il les PRODUIT comme un humain marchand.
 * On lui donne un large vivier fournisseur ; il SÉLECTIONNE les meilleurs
 * (exclut le junk/hors-sujet), RÉDIGE le titre + la description en FRANÇAIS.
 * Cerveau = DeepSeek (même client que Léa). Doctrine [[feedback_roles_via_agents]].
 */

import OpenAI from 'openai';

export interface MerchantCandidate {
  pid: string;
  name: string; // titre brut fournisseur (anglais)
  price: number | null;
}
export interface MerchantPick {
  pid: string;
  fr_title: string;
  fr_description: string;
}

/**
 * Sélectionne `count` produits parmi `candidates` qui sont VRAIMENT des `label`
 * de qualité, et rédige titre + description en français. Renvoie [] si l'IA
 * est indispo (l'appelant fera un fallback).
 */
export async function merchantSelect(
  candidates: MerchantCandidate[],
  label: string,
  count: number,
  audience?: string
): Promise<MerchantPick[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || candidates.length === 0) return [];

  const list = candidates
    .slice(0, 40)
    .map((c) => `${c.pid} | ${c.name} | ${c.price != null ? c.price + '$' : '?'}`)
    .join('\n');

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 30000,
      maxRetries: 1,
    });
    const completion = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            `Tu es un acheteur-marchand expert pour une boutique en ligne FRANÇAISE${audience ? ' (audience : ' + audience + ')' : ''}. ` +
            `On te donne une liste de produits fournisseur au format "pid | titre anglais | prix coût". ` +
            `SÉLECTIONNE les ${count} MEILLEURS qui sont VRAIMENT des ${label} de qualité, vendables. ` +
            `EXCLUS sans pitié : accessoires/outils/pièces hors-sujet, articles douteux ou à prix absurde, titres incompréhensibles, doublons. ` +
            `Pour chaque produit retenu, rédige un TITRE accrocheur en FRANÇAIS (max 60 caractères) et une DESCRIPTION en FRANÇAIS (1 à 2 phrases concrètes, sans blabla marketing creux). ` +
            `Réponds UNIQUEMENT par un tableau JSON : [{"pid":"...","fr_title":"...","fr_description":"..."}]. Aucun autre texte.`,
        },
        { role: 'user', content: list },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });
    const raw = completion.choices[0]?.message?.content || '';
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]) as MerchantPick[];
    const validPids = new Set(candidates.map((c) => c.pid));
    return parsed
      .filter((p) => p && typeof p.pid === 'string' && validPids.has(p.pid) && p.fr_title)
      .slice(0, count)
      .map((p) => ({
        pid: p.pid,
        fr_title: String(p.fr_title).slice(0, 80),
        fr_description: String(p.fr_description || '').slice(0, 400),
      }));
  } catch {
    return [];
  }
}

/**
 * TRADUIT une sélection (titres bruts EN) → fiches FR. Ne filtre PAS : on garde
 * tout ce que l'humain a choisi. Renvoie une map pid → {fr_title, fr_description}.
 * En cas d'échec : map vide (l'appelant garde le titre brut).
 */
export async function merchantTranslate(
  items: { pid: string; name: string }[]
): Promise<Map<string, { fr_title: string; fr_description: string }>> {
  const out = new Map<string, { fr_title: string; fr_description: string }>();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || items.length === 0) return out;
  const list = items.slice(0, 40).map((i) => `${i.pid} | ${i.name}`).join('\n');
  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 30000,
      maxRetries: 1,
    });
    const completion = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            `On te donne des produits "pid | titre anglais". Pour CHAQUE produit, rédige un TITRE en FRANÇAIS vendeur (max 60 car) ` +
            `et une DESCRIPTION en FRANÇAIS (1-2 phrases concrètes). Garde TOUS les produits. ` +
            `Réponds UNIQUEMENT en JSON : [{"pid":"...","fr_title":"...","fr_description":"..."}].`,
        },
        { role: 'user', content: list },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });
    const raw = completion.choices[0]?.message?.content || '';
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return out;
    const parsed = JSON.parse(m[0]) as MerchantPick[];
    for (const p of parsed) {
      if (p && typeof p.pid === 'string' && p.fr_title) {
        out.set(p.pid, { fr_title: String(p.fr_title).slice(0, 80), fr_description: String(p.fr_description || '').slice(0, 400) });
      }
    }
    return out;
  } catch {
    return out;
  }
}
