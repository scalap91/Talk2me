import 'server-only';
/**
 * karaoke-ai — RECONSTRUCTION du karaoké depuis les fragments OCR (Pascal 2026-07-13).
 *
 * Doctrine (Pascal) : les sous-titres SCANNÉS de LA vidéo = la vérité terrain (texte + timing de
 * CETTE performance — live, remix, reprise inclus, contrairement à lrclib qui est l'album). L'IA
 * prend les fragments OCR bruts (sales, en double, coupés) + leur temps vidéo, et RECONSTRUIT des
 * lignes propres timées. lrclib ne sert QUE de référence d'orthographe quand la chanson correspond.
 */
import OpenAI from 'openai';
import type { LrcLine } from './lyrics';
import { norm, coverage } from './lyrics-sync';

export interface OcrFrag { text: string; t: number } // texte OCR brut + temps vidéo (s)

/**
 * Reconstruit des lignes karaoké propres [{t, text}] à partir des fragments OCR d'une chanson.
 * - Fusionne les fragments d'une même ligne, corrige les fautes OCR, retire nav/UI parasites.
 * - Le TIMING vient des fragments (temps vidéo réels) → exact, pas d'offset.
 * - `reference` (lrclib, optionnel) aide l'orthographe SANS imposer son timing ni son texte.
 * Renvoie [] si pas assez de matière ou échec (l'appelant garde l'existant).
 */
export async function reconstructKaraoke(frags: OcrFrag[], reference?: LrcLine[]): Promise<LrcLine[]> {
  const clean = (frags || []).filter((f) => f && typeof f.t === 'number' && typeof f.text === 'string' && f.text.trim().length > 2);
  if (clean.length < 6) return [];
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return [];
  // On borne l'entrée (chansons longues) : on garde ~180 fragments répartis, triés par temps.
  const sorted = [...clean].sort((a, b) => a.t - b.t).slice(0, 180);
  const fragsText = sorted.map((f) => `[${f.t.toFixed(1)}] ${f.text.replace(/\s+/g, ' ').slice(0, 120)}`).join('\n');
  const ref = (reference || []).slice(0, 120).map((l) => l.text).join('\n');
  try {
    const client = new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 60000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.1,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            "Tu reconstruis un KARAOKÉ à partir de fragments de sous-titres OCR (bruts, sales, répétés, coupés) d'UNE vidéo. " +
            "Chaque fragment est `[temps_video] texte`. Le texte OCR contient AUSSI du bruit d'interface (nav, boutons, titre, 'Annonces', 'Titre officiel', pseudo…) — IGNORE-le. " +
            "OBJECTIF : ressortir les VRAIES lignes de paroles, dans l'ordre, chacune avec SON temps (celui du 1er fragment où elle apparaît). " +
            "Fusionne les fragments d'une même ligne, corrige les fautes d'OCR, ne garde QUE des lignes de paroles chantées. " +
            "TIMING : utilise les temps des fragments (temps vidéo réels de CETTE performance) — n'invente pas de temps. " +
            "ORTHOGRAPHE : si un champ 'reference' (paroles album) est fourni ET correspond, sers-t'en pour corriger l'orthographe, MAIS garde le texte et le timing de la VIDÉO (une performance live peut différer de l'album). " +
            "N'invente AUCUNE ligne absente des fragments. " +
            "Réponds UNIQUEMENT en JSON : {\"lines\":[{\"t\":<secondes>,\"text\":\"…\"}, …]} trié par t croissant.",
        },
        { role: 'user', content: `reference (orthographe seulement, peut ne pas correspondre):\n${ref || '(aucune)'}\n\nfragments OCR:\n${fragsText}` },
      ],
    });
    const raw = (res.choices?.[0]?.message?.content || '').trim();
    const parsed = JSON.parse(raw) as { lines?: { t?: unknown; text?: unknown }[] };
    const aiLines = (parsed.lines || [])
      .map((l) => String(l.text || '').trim())
      .filter((t) => t.length > 0);

    // RE-TIMING : on ne fait PAS confiance au timing de l'IA (elle en invente). Pour CHAQUE ligne
    // propre, on retrouve le fragment OCR (trié par temps) qui la contient le plus TÔT → son temps
    // RÉEL. Timing = vraie capture, jamais inventé. Grounding : une ligne sans fragment = jetée.
    const fragWords = sorted.map((f) => ({ t: f.t, words: new Set(norm(f.text).split(' ').filter(Boolean)), used: false }));
    const timed: LrcLine[] = [];
    for (const text of aiLines) {
      // Seuil STRICT (0,7) → une ligne de 3 mots doit avoir ~tous ses mots (évite "shawty my beyonce"
      // qui matcherait "shawty my baby"). Et on prend le 1er fragment NON ENCORE utilisé → chaque
      // occurrence d'un refrain se cale sur SON passage, pas toutes au même temps. Pascal 2026-07-13.
      let pick: (typeof fragWords)[number] | null = null;
      for (const f of fragWords) {
        if (!f.used && coverage(text, f.words) >= 0.7) { pick = f; break; }
      }
      if (pick) { pick.used = true; timed.push({ t: Math.round(pick.t * 100) / 100, text }); }
    }
    timed.sort((a, b) => a.t - b.t);
    // Dédup : 2 lignes IDENTIQUES trop proches (<5 s) = même passage capturé 2× (pas un vrai
    // refrain) → on garde la 1re. Au-delà de 5 s = vrai refrain répété → on garde. Pascal 2026-07-13.
    const deduped: LrcLine[] = [];
    for (const l of timed) {
      const prev = deduped[deduped.length - 1];
      if (prev && norm(prev.text) === norm(l.text) && l.t - prev.t < 5) continue;
      deduped.push(l);
    }
    return deduped.length >= 4 ? deduped : [];
  } catch {
    return [];
  }
}
