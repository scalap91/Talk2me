/**
 * lib/formation.ts — PDF → VRAIE formation pédagogique (Pascal 2026-07-03, v2).
 *
 * v1 (abandonnée) découpait le texte BRUT du PDF → ce n'était pas une formation.
 * v2 : Léa lit TOUT le PDF (map-reduce si long → aucune troncature), en tire une base de
 * connaissances fidèle, PLANIFIE un curriculum dimensionné à la DURÉE demandée, puis RÉDIGE
 * chaque module en markdown pédagogique (objectif, explications, exemples, récap).
 *
 * Grounding : Léa REFORMULE/STRUCTURE/EXPLIQUE, mais n'utilise QUE les faits du document —
 * aucune invention de fait/chiffre absent. (≠ recopier, ≠ halluciner.)
 */
import OpenAI from 'openai';
import { extractText, getDocumentProxy, extractImages } from 'unpdf';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { SuperCard } from '@/lib/cards/supercard';
import { getDb } from '@/lib/db';

// ─────────── Accès aux modules payants (verrou d'achat) ───────────
let _accessReady = false;
function ensureAccessTable() {
  if (_accessReady) return;
  getDb().prepare(
    'CREATE TABLE IF NOT EXISTS formation_access (user_id TEXT NOT NULL, formation_id TEXT NOT NULL, created_at INTEGER, PRIMARY KEY (user_id, formation_id))'
  ).run();
  _accessReady = true;
}
export function grantFormationAccess(userId: string, formationId: string): void {
  if (!userId || !formationId) return;
  ensureAccessTable();
  getDb().prepare('INSERT OR IGNORE INTO formation_access (user_id, formation_id, created_at) VALUES (?, ?, ?)')
    .run(userId, formationId, Date.now());
}
export function hasFormationAccess(userId: string, formationId: string): boolean {
  if (!userId || !formationId) return false;
  ensureAccessTable();
  return !!getDb().prepare('SELECT 1 FROM formation_access WHERE user_id = ? AND formation_id = ?').get(userId, formationId);
}

/**
 * Applique le VERROU : si l'user n'a pas accès (ni propriétaire ni acheteur), on VIDE le
 * contenu des modules payants (on garde titre + résumé) et on pose `locked: true`.
 */
export function gateFormationForUser(card: SuperCard, viewerId: string | null): SuperCard {
  const c = card as unknown as { owner?: string; id?: string; items?: Array<Record<string, unknown>> };
  const unlocked = !!viewerId && (c.owner === viewerId || hasFormationAccess(viewerId, c.id || ''));
  if (unlocked || !Array.isArray(c.items)) return card;
  c.items = c.items.map((m) => {
    if (m.free) return m;
    const { text: _drop, slides: _drop2, ...rest } = m; // module verrouillé : on masque contenu ET slides
    return { ...rest, locked: true };
  });
  return card;
}

export interface Slide {
  heading: string;    // titre court de la slide
  points: string[];   // 3-4 points clés concis (pas des paragraphes)
  image?: string;     // URL d'une illustration (figure du PDF)
}
export interface FormationModuleDraft {
  title: string;
  summary: string;  // objectif pédagogique
  content: string;  // leçon rédigée (markdown) — gardé pour compat
  slides: Slide[];  // LE format : deck de slides illustrées
  free: boolean;    // 1er module = aperçu gratuit
}
export interface FormationPlan {
  title: string;
  description: string;
  price_suggestion_mga: number;
  modules: FormationModuleDraft[];
  pages: number;
  chars: number;
}

// ─────────── Producteur : plan validé → card FORMATION-conteneur ───────────
export interface FormationCardInput {
  title: string;
  description: string;
  price_mga: number;
  cover?: string;
  modules: { id?: string; title: string; summary?: string; content: string; slides?: Slide[]; free: boolean }[];
}
export function buildFormationCard(cardId: string, input: FormationCardInput, owner: string): SuperCard {
  return {
    format: 't2m.card', spec: 1, id: cardId, version: 1, state: 'published',
    title: input.title || 'Ma formation', types: ['formation'], owner,
    ...(input.cover ? { images: [input.cover] } : {}),
    ...(input.description ? { text: { body: input.description } } : {}),
    ...(input.price_mga > 0 ? { price: { amount: input.price_mga, currency: 'MGA' }, actions: [{ kind: 'buy', label: 'Débloquer la formation' }] } : {}),
    items: input.modules.map((m, i) => ({
      format: 't2m.card', spec: 1, id: m.id || `${cardId}-m${i + 1}`, version: 1, state: 'published',
      title: m.title || `Module ${i + 1}`, types: ['module'], owner,
      free: i === 0 ? true : !!m.free,
      ...(m.summary ? { source: { label: m.summary } } : {}),
      ...(m.content ? { text: { body: m.content } } : {}),
      ...(m.slides && m.slides.length ? { slides: m.slides } : {}),
    })),
  } as unknown as SuperCard;
}

/** Extrait tout le texte d'un PDF (buffer) en une chaîne. */
export async function extractPdfText(buffer: ArrayBuffer | Uint8Array): Promise<{ text: string; pages: number }> {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const res = await extractText(pdf, { mergePages: true });
  const text = (Array.isArray(res.text) ? res.text.join('\n') : res.text || '').replace(/ {2,}/g, ' ').trim();
  return { text, pages: res.totalPages || 0 };
}

export interface PdfFigure { url: string; page: number; w: number; h: number }

/**
 * Extraction des FIGURES (images/schémas/tableaux) du PDF — même pipeline que le texte.
 * NotebookLM : on ingère texte ET images ensemble. L'OCR de ces images se fait ensuite
 * ON-DEVICE (GPU du téléphone). Ici on ne fait QUE l'extraction (serveur), unifiée.
 */
export async function extractPdfFigures(buffer: ArrayBuffer | Uint8Array, opts?: { maxFigures?: number; maxPages?: number }): Promise<PdfFigure[]> {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const MAX_FIGURES = opts?.maxFigures ?? 24;
  const MAX_PAGES = opts?.maxPages ?? 80;
  const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');
  const pdf = await getDocumentProxy(data);
  const pages = Math.min(pdf.numPages || 1, MAX_PAGES);
  await mkdir(UPLOAD_DIR, { recursive: true });

  const figures: PdfFigure[] = [];
  const seen = new Set<string>(); // dédup grossière (logos/bandeaux répétés = même taille)
  const stamp = Date.now();
  for (let p = 1; p <= pages && figures.length < MAX_FIGURES; p++) {
    let imgs: Array<{ data: Uint8Array | Buffer; width: number; height: number; channels: number }> = [];
    try { imgs = await extractImages(pdf, p) as unknown as typeof imgs; } catch { continue; }
    for (const im of imgs) {
      if (figures.length >= MAX_FIGURES) break;
      if (!im.width || !im.height || im.width < 200 || im.height < 140) continue; // pas une vraie figure
      const key = `${im.width}x${im.height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const png = await sharp(Buffer.from(im.data), { raw: { width: im.width, height: im.height, channels: im.channels as 1 | 2 | 3 | 4 } }).png().toBuffer();
        const name = `fig_${stamp}_${p}_${figures.length}.png`;
        await writeFile(path.join(UPLOAD_DIR, name), png);
        figures.push({ url: `/uploads/${name}`, page: p, w: im.width, h: im.height });
      } catch { /* image non encodable → on saute */ }
    }
  }
  return figures;
}

/** INGESTION UNIFIÉE : texte + figures en une passe (NotebookLM style). */
export async function ingestPdfSources(buffer: ArrayBuffer | Uint8Array): Promise<{ text: string; pages: number; figures: PdfFigure[] }> {
  const [{ text, pages }, figures] = await Promise.all([extractPdfText(buffer), extractPdfFigures(buffer)]);
  return { text, pages, figures };
}

// ─────────── Moteur pédagogique (PDF entier → curriculum → leçons rédigées) ───────────
function chunkText(text: string, size = 11000): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [text];
}

async function llm(messages: { role: 'system' | 'user'; content: string }[], maxTokens: number, temperature = 0.3, json = false): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY manquante');
  const openai = new OpenAI({ apiKey, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 120000, maxRetries: 1 });
  const c = await openai.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    messages, temperature, max_tokens: maxTokens,
    ...(json ? { response_format: { type: 'json_object' as const } } : {}),
  });
  return (c.choices[0]?.message?.content || '').trim();
}

export type ProgressFn = (step: string, pct: number) => void;

/** Exécute fn sur chaque item avec au plus `limit` en parallèle ; garde l'ORDRE des résultats. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;
  const worker = async () => { while (idx < items.length) { const i = idx++; results[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  return results;
}

const CONCURRENCY = 6; // appels IA simultanés (assez pour aller vite, sans rate-limit)

/** MAP-REDUCE : condense TOUT le PDF (même long) en base de connaissances fidèle. En PARALLÈLE. */
async function condensePdf(text: string, onProgress?: ProgressFn): Promise<string> {
  const chunks = chunkText(text);
  if (chunks.length === 1) return text;
  let done = 0;
  const parts = await mapLimit(chunks, CONCURRENCY, async (chunk, i) => {
    const r = await llm([
      { role: 'system', content: "Tu résumes FIDÈLEMENT une partie d'un document de formation en points clés structurés, en FRANÇAIS. Garde TOUS les faits, chiffres, étapes et définitions importants. N'invente RIEN." },
      { role: 'user', content: `Partie ${i + 1}/${chunks.length} du document :\n${chunk}` },
    ], 1000, 0.2);
    done++;
    onProgress?.('Léa lit ton document…', 5 + Math.round((done / chunks.length) * 40));
    return r;
  });
  return parts.join('\n\n');
}

interface CurriculumMod { title: string; objective: string; covers: string; free: boolean }

/** Plan de la formation, dimensionné à la durée voulue. */
async function planCurriculum(knowledge: string, durationMin: number): Promise<{ title: string; description: string; price: number; modules: CurriculumMod[] }> {
  const n = durationMin <= 30 ? '3 à 4' : durationMin <= 60 ? '5 à 6' : durationMin <= 120 ? '7 à 9' : '10 à 12';
  const raw = await llm([
    { role: 'system', content:
      `Tu es concepteur pédagogique. À partir de la BASE DE CONNAISSANCES (issue d'un document), conçois le PLAN d'une formation d'environ ${durationMin} minutes, en FRANÇAIS, avec ${n} modules. ` +
      `Le module 1 est une INTRODUCTION (free:true) ; les autres free:false. Chaque module : "title", "objective" (objectif pédagogique), "covers" (points de la base traités). ` +
      `N'invente AUCUN sujet absent de la base. JSON STRICT : {"title","description","price_suggestion_mga",modules:[{"title","objective","covers","free"}]}` },
    { role: 'user', content: `BASE DE CONNAISSANCES :\n${knowledge.slice(0, 40000)}` },
  ], 1600, 0.3, true);
  let p: { title?: string; description?: string; price_suggestion_mga?: number; modules?: CurriculumMod[] };
  try { p = JSON.parse(raw); } catch { throw new Error('Plan IA illisible'); }
  const modules = (p.modules || []).map((m, i) => ({ title: m.title || `Module ${i + 1}`, objective: m.objective || '', covers: m.covers || '', free: i === 0 }));
  if (modules.length === 0) throw new Error('Aucun module proposé');
  return { title: (p.title || 'Ma formation').slice(0, 120), description: (p.description || '').slice(0, 300), price: Number.isFinite(p.price_suggestion_mga) ? Math.max(0, Math.round(p.price_suggestion_mga!)) : 15000, modules };
}

/** Rédige le CONTENU pédagogique d'un module (markdown), reformulé mais fondé. */
async function writeModule(mod: CurriculumMod, knowledge: string, minutesPerMod: number): Promise<string> {
  return llm([
    { role: 'system', content:
      `Tu es formateur. Rédige le CONTENU d'un module de formation, en FRANÇAIS, en MARKDOWN pédagogique : ` +
      `objectif en tête, sections à titres (##), listes à puces, **gras** sur les points clés, au moins un exemple concret, mini récap final. ` +
      `Durée de lecture visée ~${minutesPerMod} min. RÈGLE ABSOLUE : n'utilise QUE les faits de la BASE ci-dessous — reformule, explique, illustre, structure, mais N'INVENTE AUCUN fait/chiffre absent. ` +
      `COMMENCE DIRECTEMENT par le contenu du cours (un titre ## puis les sections). N'écris JAMAIS de phrase d'introduction bavarde du type « Absolument », « Voici le contenu du module », « Bien sûr », « en m'appuyant sur la base de connaissances ». Pas de bloc \`\`\`markdown englobant. Que le cours, rien d'autre.` },
    { role: 'user', content: `BASE DE CONNAISSANCES :\n${knowledge.slice(0, 30000)}\n\nMODULE À RÉDIGER : ${mod.title}\nObjectif : ${mod.objective}\nPoints à couvrir : ${mod.covers}` },
  ], 2200, 0.45);
}

/** Découpe un module en SLIDES (titre + 3-4 points clés) — LE format présentation, pas un pavé. */
async function writeModuleSlides(mod: CurriculumMod, knowledge: string, minutesPerMod: number): Promise<Slide[]> {
  const nSlides = Math.max(3, Math.min(8, Math.round(minutesPerMod / 1.5)));
  const raw = await llm([
    { role: 'system', content:
      `Tu es concepteur de SLIDES de formation. Découpe le module en ${nSlides} slides maximum, en FRANÇAIS. ` +
      `Chaque slide = un TITRE court + 3 à 4 POINTS CLÉS concis (une phrase courte chacun, PAS des paragraphes). ` +
      `Progression logique : on comprend en enchaînant les slides. RÈGLE ABSOLUE : n'utilise QUE les faits de la BASE ci-dessous — reformule et condense, mais N'INVENTE AUCUN fait/chiffre. ` +
      `Réponds en JSON STRICT, rien d'autre : {"slides":[{"heading":"Titre","points":["point 1","point 2","point 3"]}]}` },
    { role: 'user', content: `BASE DE CONNAISSANCES :\n${knowledge.slice(0, 26000)}\n\nMODULE : ${mod.title}\nObjectif : ${mod.objective}\nPoints à couvrir : ${mod.covers}` },
  ], 1800, 0.4, true);
  try {
    const o = JSON.parse(raw) as { slides?: Array<{ heading?: string; points?: unknown[] }> };
    const slides: Slide[] = (Array.isArray(o?.slides) ? o.slides : [])
      .map((s) => ({ heading: String(s?.heading || '').trim(), points: (Array.isArray(s?.points) ? s.points : []).map((p) => String(p || '').trim()).filter(Boolean).slice(0, 5) }))
      .filter((s) => s.heading || s.points.length);
    return slides;
  } catch { return []; }
}

/**
 * NETTOYEUR : supprime le préambule bavard de l'IA ET toute fuite de notre mécanique
 * (« base de connaissances », « rédigé en markdown », « en m'appuyant sur… »). L'utilisateur
 * ne voit JAMAIS comment on fabrique le cours — que le cours.
 */
function cleanModule(text: string): string {
  let t = (text || '').trim();
  // bloc ```markdown englobant
  t = t.replace(/^```(?:markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const LEAK = /^\s*(absolument|bien sûr|bien entendu|d'accord|certainement|avec plaisir|voici|d'ailleurs voici)\b|voici (le|ce|un)\s+(contenu|module|cours)|rédigé en markdown|en m['’]appuyant|base de connaissances|(?:d'après|selon|à partir de) (?:la|les|le) (?:base|document|texte) fourni/i;
  // on retire les lignes "fuite" dans le HAUT du contenu (préambule)
  const lines = t.split('\n');
  while (lines.length && (lines[0].trim() === '' || LEAK.test(lines[0]))) lines.shift();
  return lines.join('\n').trim();
}

/** RELECTURE : Léa relit son propre module et corrige la FORME/CLARTÉ (sans inventer de faits). */
async function reviewModule(content: string, title: string): Promise<string> {
  if (!content || content.length < 30) return content;
  const fixed = await llm([
    { role: 'system', content:
      `Tu es relecteur pédagogique. On te donne le CONTENU markdown d'un module de formation. ` +
      `Corrige et améliore SA FORME et SA CLARTÉ UNIQUEMENT : répare les tableaux markdown mal formés, ` +
      `améliore la structure (titres ##, listes à puces, **gras** sur les points clés), clarifie les phrases ` +
      `confuses, supprime les redites, assure un objectif en tête et un mini récap final. ` +
      `RÈGLE ABSOLUE : n'ajoute AUCUN fait, chiffre ou affirmation nouveau — tu ne touches qu'à la forme et la clarté. ` +
      `Renvoie UNIQUEMENT le module corrigé, en markdown, sans commentaire ni préambule.` },
    { role: 'user', content: `MODULE « ${title} » :\n\n${content}` },
  ], 2400, 0.3);
  const out = (fixed || '').trim();
  // garde-fou : si la relecture a tout cassé (trop court), on garde l'original.
  return out.length > content.length * 0.5 ? out : content;
}

/**
 * Pipeline complet : PDF ENTIER → base de connaissances → curriculum (selon durée) →
 * chaque module RÉDIGÉ pédagogiquement → RELU/corrigé par Léa (markdown, fondé). Une vraie formation.
 */
export async function buildFormationFromPdf(text: string, pages: number, durationMin: number, onProgress?: ProgressFn, figuresText?: string, figuresUrls?: string[]): Promise<FormationPlan> {
  if (!text || text.length < 40) throw new Error('PDF vide ou illisible');
  const dur = Math.max(15, Math.min(600, Math.round(durationMin || 60)));
  onProgress?.('Léa lit ton document…', 5);
  // Le texte des FIGURES (lu sur l'appareil par OCR) est ajouté à la base : Léa "voit" les schémas/tableaux.
  const figs = (figuresText || '').trim();
  const knowledge = (figs ? `=== TEXTE LU DANS LES FIGURES / SCHÉMAS / TABLEAUX DU DOCUMENT ===\n${figs.slice(0, 12000)}\n\n=== TEXTE DU DOCUMENT ===\n` : '') + await condensePdf(text, onProgress);
  onProgress?.('Léa conçoit ton programme…', 48);
  const plan = await planCurriculum(knowledge, dur);
  const perMod = Math.max(3, Math.round(dur / plan.modules.length));
  // LE FORMAT : chaque module → un DECK DE SLIDES (titre + points clés), pas un pavé.
  let sDone = 0;
  const moduleSlides = await mapLimit(plan.modules, CONCURRENCY, async (m) => {
    const s = await writeModuleSlides(m, knowledge, perMod);
    sDone++;
    onProgress?.(`Léa conçoit tes slides… (${sDone}/${plan.modules.length})`, 52 + Math.round((sDone / plan.modules.length) * 44));
    return s;
  });
  // ILLUSTRATIONS : on pose les IMAGES des figures sur les slides (≈ une sur deux tant qu'il en reste).
  const imgs = (figuresUrls || []).filter((u) => typeof u === 'string' && u);
  let imgIdx = 0;
  const modules: FormationModuleDraft[] = plan.modules.map((m, i) => {
    const slides: Slide[] = (moduleSlides[i] && moduleSlides[i].length) ? moduleSlides[i] : [{ heading: m.title, points: [m.objective] }];
    slides.forEach((s, j) => { if (imgIdx < imgs.length && j % 2 === 0) s.image = imgs[imgIdx++]; });
    const content = slides.map((s) => `## ${s.heading}\n${s.points.map((p) => `- ${p}`).join('\n')}`).join('\n\n'); // compat markdown
    return { title: m.title, summary: m.objective, content, slides, free: m.free };
  });
  if (!modules.some((m) => m.free)) modules[0].free = true;
  onProgress?.('Finalisation…', 99);
  return { title: plan.title, description: plan.description, price_suggestion_mga: plan.price, modules, pages, chars: text.length };
}
