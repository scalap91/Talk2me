import 'server-only';
/**
 * Couche IA du Discovery (Pascal 2026-08-30) — l'IA écrit un PORTRAIT + une ACCROCHE par chapitre, à
 * partir des DONNÉES RÉELLES de la personne (genres écoutés, titres de ses contenus). JAMAIS d'appel IA
 * au chargement de la page : on CACHE le texte (table discovery_ai) ; le SSR sert le cache, et on
 * (re)génère EN FOND quand la signature du contenu a changé. Repli propre sur les libellés statiques si
 * l'IA est indisponible (llmComplete → null). Dire « l'IA », jamais un prénom.
 */
import { getDb } from '@/lib/db';
import { llmComplete, llmAvailable } from '@/lib/ai/llm';

export interface DiscoveryAI { portrait: string | null; captions: Record<string, string> }
export interface DiscoveryAIContext {
  name: string;
  topGenres: string[];
  topArtist: string | null;
  titles: { music: string[]; works: string[]; pub: string[]; likes: string[]; shops: string[] };
  counts: { music: number; works: number; pub: number; likes: number; shops: number };
}

let ensured = false;
function ensure(): void {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS discovery_ai (
      user_id TEXT PRIMARY KEY,
      sig TEXT,
      portrait TEXT,
      captions_json TEXT,
      updated_at INTEGER,
      generating INTEGER NOT NULL DEFAULT 0
    );
  `);
  ensured = true;
}

export function getCachedDiscoveryAI(userId: string): DiscoveryAI | null {
  ensure();
  const row = getDb().prepare('SELECT portrait, captions_json FROM discovery_ai WHERE user_id = ?').get(userId) as { portrait: string | null; captions_json: string | null } | undefined;
  if (!row) return null;
  let captions: Record<string, string> = {};
  try { captions = row.captions_json ? JSON.parse(row.captions_json) : {}; } catch { /* */ }
  return { portrait: row.portrait, captions };
}

const clamp = (s: unknown, n: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

async function generate(ctx: DiscoveryAIContext): Promise<DiscoveryAI | null> {
  const system = "Tu es l'éditorialiste de Talk2Me. Tu présentes une personne avec des accroches COURTES, évocatrices et dignes, UNIQUEMENT à partir des données fournies. Interdits : inventer des faits, superlatifs creux, anglicismes gratuits, emojis, ponctuation excessive. Français chaleureux et concret. Tu réponds STRICTEMENT en JSON valide, rien d'autre.";
  const user = [
    'Données de la personne :',
    JSON.stringify(ctx),
    '',
    'Écris un objet JSON avec ces clés (chaînes en français, sans emoji) :',
    '- "portrait": une phrase (<=140 caractères) qui dit qui est cette personne, ancrée dans ses genres/contenus. Pas de nom propre inventé.',
    '- "music": accroche <=55 car. pour sa musique (évoque les genres si présents). "" si aucune musique.',
    '- "works": accroche <=55 car. pour ses films/vidéos. "" si aucun.',
    '- "pub": accroche <=55 car. pour ses publications/écrits. "" si aucune.',
    '- "likes": accroche <=55 car. pour ses coups de cœur. "" si aucun.',
    '- "shops": accroche <=55 car. pour ses boutiques. "" si aucune.',
    'Chaque accroche remplace un titre de section : concise, sans point final, pas de guillemets.',
    'Réponds UNIQUEMENT le JSON.',
  ].join('\n');

  const raw = await llmComplete(system, user, { temperature: 0.7, maxTokens: 400, tag: 'discovery-ai' });
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(m[0]); } catch { return null; }
  const captions: Record<string, string> = {};
  for (const k of ['music', 'works', 'pub', 'likes', 'shops']) {
    const v = clamp(obj[k], 70);
    if (v) captions[k] = v;
  }
  const portrait = clamp(obj.portrait, 160) || null;
  if (!portrait && Object.keys(captions).length === 0) return null;
  return { portrait, captions };
}

/**
 * Assure la fraîcheur du texte IA SANS bloquer : si la signature du contenu a changé (ou premier passage),
 * lance la génération EN FOND et stocke le résultat. Le SSR n'attend jamais ceci.
 */
export function ensureDiscoveryAI(userId: string, sig: string, ctx: DiscoveryAIContext): void {
  if (!llmAvailable()) return;
  ensure();
  const db = getDb();
  const row = db.prepare('SELECT sig, portrait, generating, updated_at FROM discovery_ai WHERE user_id = ?').get(userId) as { sig: string | null; portrait: string | null; generating: number; updated_at: number | null } | undefined;
  const fresh = row && row.sig === sig && row.portrait !== null;
  if (fresh) return;
  // Anti-doublon : ne relance pas si une génération est en cours depuis < 2 min.
  if (row?.generating && row.updated_at && Date.now() - row.updated_at < 120_000) return;

  db.prepare('INSERT INTO discovery_ai (user_id, sig, generating, updated_at) VALUES (?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET generating=1, updated_at=excluded.updated_at').run(userId, sig, Date.now());

  // Fire-and-forget : process Node persistant (PM2) → la promesse continue après la réponse SSR.
  void (async () => {
    let res: DiscoveryAI | null = null;
    try { res = await generate(ctx); } catch { res = null; }
    try {
      if (res) {
        getDb().prepare('UPDATE discovery_ai SET sig=?, portrait=?, captions_json=?, updated_at=?, generating=0 WHERE user_id=?')
          .run(sig, res.portrait, JSON.stringify(res.captions), Date.now(), userId);
      } else {
        getDb().prepare('UPDATE discovery_ai SET generating=0, updated_at=? WHERE user_id=?').run(Date.now(), userId);
      }
    } catch { /* */ }
  })();
}
