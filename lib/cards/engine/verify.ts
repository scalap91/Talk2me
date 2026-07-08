/**
 * Talk2Me — VÉRIFICATION EXTERNE des faits (page-entité vivante, M2, Pascal 2026-07-08).
 * « On vérifie sur d'autres sites que c'est vrai. » Léa extrait les affirmations
 * FACTUELLES d'un texte, les cherche sur le web (searchWeb : Brave/Bing/DDG), et juge
 * chacune : confirmée / contredite / invérifiable — avec la SOURCE. Anti-hallucination
 * bien écrite [[feedback_content_grounding]] : un fait non corroboré ne peut pas passer
 * pour vrai.
 */
import OpenAI from 'openai';
import { searchWeb } from '@/lib/web-search';

export type ClaimStatus = 'confirmed' | 'contradicted' | 'unverifiable';
export interface ClaimCheck {
  claim: string;
  status: ClaimStatus;
  source: string | null; // URL de la meilleure source
  note: string;
}
export interface VerifyResult {
  veracity: number; // 0-100 : part d'affirmations confirmées
  available: boolean; // false si moteur IA/recherche indisponible
  checks: ClaimCheck[];
  sources: string[]; // URLs distinctes retenues
}

function llm(): OpenAI | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeout: 90000,
    maxRetries: 1,
  });
}

/** Étape 1 — extrait les affirmations factuelles vérifiables (dates, chiffres, personnes, événements). */
async function extractClaims(client: OpenAI, text: string, max: number): Promise<string[]> {
  try {
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extrais les AFFIRMATIONS FACTUELLES VÉRIFIABLES de ce texte (dates, chiffres, classements, producteurs, personnes, événements). Ignore le subjectif et le vague. Chaque affirmation doit être une phrase AUTONOME et cherchable sur le web. Maximum ${max}. Réponds en JSON {"claims": ["...", "..."]}.`,
        },
        { role: 'user', content: text.slice(0, 6000) },
      ],
    });
    const j = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    const arr = Array.isArray(j.claims) ? j.claims : [];
    return arr.map((c: unknown) => String(c || '').trim()).filter(Boolean).slice(0, max);
  } catch {
    return [];
  }
}

/** Étape 3 — juge toutes les affirmations d'un coup à partir des preuves collectées. */
async function judgeAll(
  client: OpenAI,
  items: { claim: string; evidence: string }[],
  authoritative: string,
): Promise<ClaimCheck[]> {
  const block = items
    .map((it, i) => `AFFIRMATION ${i + 1} : ${it.claim}\nRÉSULTATS WEB :\n${it.evidence || '(aucun)'}\n`)
    .join('\n---\n');
  const authBlock = authoritative
    ? `\n\nSOURCE OFFICIELLE DE CONFIANCE (données API de la source elle-même — À PRIVILÉGIER sur le web) :\n${authoritative}`
    : '';
  try {
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            "Tu es fact-checkeur. Pour CHAQUE affirmation, juge UNIQUEMENT à partir des preuves fournies (source officielle + résultats web ; ne te fie pas à tes connaissances) : status = \"confirmed\" (corroborée par une source fiable), \"contradicted\" (une source la contredit — ex. un chiffre différent), ou \"unverifiable\" (rien ne permet de trancher). Privilégie la SOURCE OFFICIELLE quand elle existe. Donne l'URL de la meilleure source (sourceUrl) et une note courte (mentionne la vraie valeur si l'affirmation est obsolète/fausse). Réponds en JSON {\"checks\":[{\"index\":1,\"status\":\"...\",\"sourceUrl\":\"...\",\"note\":\"...\"}]}.",
        },
        { role: 'user', content: block + authBlock },
      ],
    });
    const j = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    const checks = Array.isArray(j.checks) ? j.checks : [];
    return items.map((it, i) => {
      const found = checks.find((c: { index?: number }) => Number(c.index) === i + 1) || {};
      const status: ClaimStatus = ['confirmed', 'contradicted', 'unverifiable'].includes(found.status)
        ? found.status
        : 'unverifiable';
      const source = typeof found.sourceUrl === 'string' && /^https?:\/\//.test(found.sourceUrl) ? found.sourceUrl : null;
      return { claim: it.claim, status, source, note: String(found.note || '').slice(0, 200) };
    });
  } catch {
    return items.map((it) => ({ claim: it.claim, status: 'unverifiable' as ClaimStatus, source: null, note: '' }));
  }
}

/**
 * Vérifie les faits d'un texte. `authoritative` = faits officiels de la source elle-même
 * (ex. API YouTube d'une vidéo) → privilégiés sur le web. Pas de clé IA → { available:false }.
 */
export async function verifyText(
  text: string,
  opts: { maxClaims?: number; authoritative?: string } = {},
): Promise<VerifyResult> {
  const maxClaims = opts.maxClaims ?? 6;
  const client = llm();
  if (!client || !(text || '').trim()) {
    return { veracity: 0, available: false, checks: [], sources: [] };
  }
  const claims = await extractClaims(client, text, maxClaims);
  if (claims.length === 0) return { veracity: 0, available: true, checks: [], sources: [] };

  // Étape 2 — une recherche web par affirmation. SÉQUENTIEL + petit délai : les moteurs
  // scrapés (Bing/DDG) bloquent les rafales parallèles depuis une même IP (anti-bot).
  const items: { claim: string; evidence: string }[] = [];
  for (const claim of claims) {
    let evidence = '';
    try {
      const { results } = await searchWeb(claim, 4);
      evidence = results
        .map((r, i) => `[${i + 1}] ${r.title} (${r.source || ''}) — ${r.snippet} — ${r.url}`)
        .join('\n');
    } catch {
      /* pas de preuve → invérifiable */
    }
    items.push({ claim, evidence });
    await new Promise((r) => setTimeout(r, 500));
  }

  const checks = await judgeAll(client, items, opts.authoritative || '');
  const decidable = checks.filter((c) => c.status !== 'unverifiable').length;
  const confirmed = checks.filter((c) => c.status === 'confirmed').length;
  const veracity = decidable > 0 ? Math.round((100 * confirmed) / checks.length) : 0;
  const sources = [...new Set(checks.map((c) => c.source).filter((s): s is string => !!s))];
  return { veracity, available: true, checks, sources };
}
