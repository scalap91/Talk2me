/**
 * lib/cards/v2/validate — LE VALIDATEUR canonique (spec:2). LE REMPART anti-dérive.
 *
 * Refonte SuperCard (étape 6, Phase A + durcissement post-revue indépendante 2026-07-20).
 * Valide un objet contre le REGISTRE (registry.ts) — À TOUS LES ÉTAGES (le rempart ne s'arrête
 * plus à la surface) : enveloppe, socle, blocs métier, media.meta, tariff, actions (whitelist),
 * items (dont cartes inline validées RÉCURSIVEMENT), preview, liens. Argent partout en entier+MGA.
 * Doctrine : « une carte invalide n'entre pas ». Pur (browser-safe).
 */
import {
  REGISTRY_SPEC, TOP_LEVEL_FIELDS, REQUIRED_FIELDS, MAX_COMPOSITION_DEPTH, KNOWN_BLOCKS,
  ACTION_KEYS, MEDIA_KEYS, MEDIA_META_KEYS, ITEM_KEYS, PREVIEW_KEYS, LINK_KEYS, LINK_PREVIEW_KEYS,
  LINK_READERS, OFFER_KEYS, PLACE_KEYS, SOURCE_KEYS, RATING_KEYS, GOVERNANCE_KEYS, PROVIDER_REF_KEYS,
  TARIFF_KEYS, PRESENTATION_KEYS, CONTEXT_OVERRIDE_KEYS, BLOCK_SCHEMAS, BLOCK_FIELD_TYPES,
  MEDIA_ROLES, MEDIA_ORIENTATIONS, ACTION_PRIORITIES, ITEM_CARRIERS, ITEM_MODES, SERVICE_MODES,
  PROJECT_DOMAINS, PROJECT_LIFECYCLE, APPROVAL_STAGES, APPROVAL_STATES, NEED_STATUSES,
  CANDIDATE_PROVENANCES, CANDIDATE_STATUSES, CONTRIBUTOR_STATUSES,
  MISSION_COMPENSATION_MODES, MISSION_STATES, APPLICATION_STATUSES,
  isKind, isStatus, isVisibility, isOfferType, isCurrency, isMediaType,
  isActionKind, isItemRole, isPrimitiveType, isLinkRel, isTopLevelField,
} from './registry';

export interface ValidationIssue { path: string; message: string }
export interface ValidationResult { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] }

type Err = (path: string, message: string) => void;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isDate = (v: unknown): boolean => isNum(v) || (isStr(v) && !Number.isNaN(Date.parse(v)));
const isStrArr = (v: unknown): boolean => Array.isArray(v) && v.every(isStr);
const has = (v: unknown): boolean => v !== undefined && v !== null;
const isIn = (v: unknown, arr: readonly string[]): boolean => isStr(v) && arr.includes(v);
const isPosInt = (v: unknown): boolean => isInt(v) && (v as number) >= 0;

/** Rejette toute clé hors du jeu fermé `allowed` sous `prefix`. */
function closedKeys(obj: Record<string, unknown>, allowed: readonly string[], prefix: string, err: Err): void {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(`${prefix}.${k}`, `champ inconnu (hors schéma)`);
}

export function validateCard(input: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err: Err = (path, message) => errors.push({ path, message });
  if (!isObj(input)) return { ok: false, errors: [{ path: '$', message: 'pas un objet' }], warnings };
  validateNode(input, '$', 1, new Set(isStr(input.id) ? [input.id] : []), err);
  return { ok: errors.length === 0, errors, warnings };
}

/** Valide une carte (racine OU enfant inline) à `prefix`, à `depth`, avec `ancestors` (ids du chemin). */
function validateNode(c: Record<string, unknown>, prefix: string, depth: number, ancestors: Set<string>, err: Err): void {
  const P = (k: string) => prefix === '$' ? k : `${prefix}.${k}`;

  // Enveloppe
  if (c.format !== 't2m.card') err(P('format'), `attendu "t2m.card", reçu ${JSON.stringify(c.format)}`);
  if (c.spec !== REGISTRY_SPEC) err(P('spec'), `attendu ${REGISTRY_SPEC}, reçu ${JSON.stringify(c.spec)}`);

  // Obligatoires
  for (const f of REQUIRED_FIELDS) if (c[f] === undefined || c[f] === null || c[f] === '') err(P(f), 'champ obligatoire manquant');

  // Jeu FERMÉ top-level (pas de « champ maison »)
  for (const key of Object.keys(c)) if (!isTopLevelField(key)) err(P(key), `champ inconnu (hors schéma spec:${REGISTRY_SPEC})`);

  // Identité
  if (has(c.id) && !isStr(c.id)) err(P('id'), 'doit être une chaîne');
  if (has(c.kind) && !isKind(c.kind)) err(P('kind'), `kind inconnu du registre : ${JSON.stringify(c.kind)}`);
  if (has(c.owner) && !isStr(c.owner)) err(P('owner'), 'doit être un id (chaîne)');
  if (has(c.status) && !isStatus(c.status)) err(P('status'), `status invalide : ${JSON.stringify(c.status)}`);
  if (has(c.visibility) && !isVisibility(c.visibility)) err(P('visibility'), `visibility invalide : ${JSON.stringify(c.visibility)}`);
  if (has(c.facets) && !isStrArr(c.facets)) err(P('facets'), 'doit être un tableau de chaînes');
  if (has(c.language) && !isStr(c.language)) err(P('language'), 'doit être une chaîne (BCP-47)');
  for (const d of ['created_at', 'updated_at'] as const) if (has(c[d]) && !isDate(c[d])) err(P(d), 'date invalide');
  if (has(c.published_at) && c.published_at !== null && !isDate(c.published_at)) err(P('published_at'), 'date invalide ou null');
  if (has(c.expires_at) && !isDate(c.expires_at)) err(P('expires_at'), 'date invalide');
  if (has(c.governance)) validateClosed(c.governance, GOVERNANCE_KEYS, P('governance'), err, (g, gp) => {
    if (has(g.affiliation)) validateClosed(g.affiliation, ['ownerCut'], `${gp}.affiliation`, err, (af, afp) => { if (has(af.ownerCut) && !isNum(af.ownerCut)) err(`${afp}.ownerCut`, 'nombre attendu'); });
    if (has(g.entityKey) && !isStr(g.entityKey)) err(`${gp}.entityKey`, 'chaîne attendue');
    if (has(g.signature) && !isStr(g.signature)) err(`${gp}.signature`, 'chaîne attendue');
  });

  // Contenu
  if (has(c.title) && !isStr(c.title)) err(P('title'), 'doit être une chaîne');
  if (has(c.text)) validateClosed(c.text, ['body'], P('text'), err, (t, tp) => { if (has(t.body) && !isStr(t.body)) err(`${tp}.body`, 'chaîne attendue'); });
  validateMoney(c.price, P('price'), err);
  validateMoney(c.deposit, P('deposit'), err);
  if (has(c.stock) && !(isInt(c.stock) && c.stock >= 0)) err(P('stock'), 'entier ≥ 0 attendu');
  if (has(c.offer)) validateClosed(c.offer, OFFER_KEYS, P('offer'), err, (o, op) => { if (!isOfferType(o.type)) err(`${op}.type`, `type d'offre invalide : ${JSON.stringify(o.type)}`); });
  if (has(c.place)) validateClosed(c.place, PLACE_KEYS, P('place'), err, (pl, pp) => {
    if (has(pl.lat) && !isNum(pl.lat)) err(`${pp}.lat`, 'nombre attendu');
    if (has(pl.lng) && !isNum(pl.lng)) err(`${pp}.lng`, 'nombre attendu');
    if (has(pl.address) && !isStr(pl.address)) err(`${pp}.address`, 'chaîne attendue');
    if (has(pl.city) && !isStr(pl.city)) err(`${pp}.city`, 'chaîne attendue');
  });
  if (has(c.categories) && !isStrArr(c.categories)) err(P('categories'), 'tableau de chaînes attendu');
  if (has(c.rayon) && !isStr(c.rayon)) err(P('rayon'), 'chaîne attendue');
  if (has(c.specs)) { if (!isObj(c.specs)) err(P('specs'), 'objet clé→valeur attendu'); else for (const [k, v] of Object.entries(c.specs)) if (!(isStr(v) || isNum(v) || isBool(v))) err(`${P('specs')}.${k}`, 'valeur scalaire attendue'); }
  if (has(c.discovery)) validateClosed(c.discovery, ['hashtags', 'keywords', 'mentions'], P('discovery'), err, (d, dp) => {
    for (const k of ['hashtags', 'keywords', 'mentions']) if (has(d[k]) && !isStrArr(d[k])) err(`${dp}.${k}`, 'tableau de chaînes attendu');
  });
  if (has(c.rating)) validateClosed(c.rating, RATING_KEYS, P('rating'), err, (r, rp) => {
    if (has(r.score) && !(isNum(r.score) && (r.score as number) >= 0)) err(`${rp}.score`, 'nombre ≥ 0 attendu');
    if (has(r.count) && !(isInt(r.count) && (r.count as number) >= 0)) err(`${rp}.count`, 'entier ≥ 0 attendu');
  });
  if (has(c.link)) validateClosed(c.link, ['url', 'reader'], P('link'), err, (l, lp) => {
    if (!isStr(l.url)) err(`${lp}.url`, 'url (chaîne) requise');
    if (has(l.reader) && !(LINK_READERS as readonly string[]).includes(l.reader as string)) err(`${lp}.reader`, `reader invalide : ${JSON.stringify(l.reader)}`);
  });
  if (has(c.source)) validateClosed(c.source, SOURCE_KEYS, P('source'), err, (s, sp) => { for (const k of SOURCE_KEYS) if (has(s[k]) && !isStr(s[k])) err(`${sp}.${k}`, 'chaîne attendue'); });
  if (has(c.presentation)) validatePresentation(c.presentation, P('presentation'), err);
  if (has(c.hours)) validateHours(c.hours, P('hours'), err);
  if (has(c.service_modes)) { if (!Array.isArray(c.service_modes)) err(P('service_modes'), 'tableau attendu'); else c.service_modes.forEach((s, i) => { if (!(SERVICE_MODES as readonly string[]).includes(s as string)) err(`${P('service_modes')}[${i}]`, `mode invalide : ${JSON.stringify(s)}`); }); }
  if (has(c.tariff)) { if (!Array.isArray(c.tariff)) err(P('tariff'), 'tableau attendu'); else c.tariff.forEach((t, i) => validateClosed(t, TARIFF_KEYS, `${P('tariff')}[${i}]`, err, (tt, tp) => { if (!isStr(tt.label)) err(`${tp}.label`, 'label (chaîne) requis'); validateMoney(tt.price, `${tp}.price`, err, true); })); }
  if (has(c.availability)) validateClosed(c.availability, ['ref'], P('availability'), err, (a, ap) => { if (!isStr(a.ref)) err(`${ap}.ref`, 'ref (chaîne) requise'); });
  if (has(c.provider_ref)) validateClosed(c.provider_ref, PROVIDER_REF_KEYS, P('provider_ref'), err, (pr, pp) => { if (!isStr(pr.provider)) err(`${pp}.provider`, 'provider (chaîne) requis'); });

  // Média
  if (has(c.media)) { if (!Array.isArray(c.media)) err(P('media'), 'tableau attendu'); else c.media.forEach((m, i) => validateMedia(m, `${P('media')}[${i}]`, err)); }

  // Actions (whitelist stricte des clés + A2)
  if (has(c.actions)) { if (!Array.isArray(c.actions)) err(P('actions'), 'tableau attendu'); else c.actions.forEach((a, i) => validateAction(a, `${P('actions')}[${i}]`, err)); }

  // Blocs métier typés (schéma fermé + argent routé)
  for (const b of KNOWN_BLOCKS) if (has(c[b])) validateBlock(b, c[b], P(b), err);

  // Liens
  if (has(c.links)) { if (!Array.isArray(c.links)) err(P('links'), 'tableau attendu'); else c.links.forEach((l, i) => validateLink(l, `${P('links')}[${i}]`, err)); }

  // Composition
  validateItems(c.items, P('items'), depth, ancestors, err);
}

function validateClosed(v: unknown, allowed: readonly string[], prefix: string, err: Err, inner?: (o: Record<string, unknown>, prefix: string) => void): void {
  if (!isObj(v)) { err(prefix, 'objet attendu'); return; }
  closedKeys(v, allowed, prefix, err);
  if (inner) inner(v, prefix);
}

function validateMoney(v: unknown, path: string, err: Err, required = false): void {
  if (v === undefined) { if (required) err(path, 'montant requis'); return; }
  if (!isObj(v)) { err(path, 'objet { amount, currency } attendu'); return; }
  closedKeys(v, ['amount', 'currency'], path, err);
  if (!isInt(v.amount) || (v.amount as number) < 0) err(`${path}.amount`, 'entier ≥ 0 attendu (unité réelle, pas de centimes)');
  if (!isCurrency(v.currency)) err(`${path}.currency`, `devise non autorisée : ${JSON.stringify(v.currency)} (attendu MGA)`);
}

function validateMedia(m: unknown, path: string, err: Err): void {
  if (!isObj(m)) { err(path, 'élément média invalide'); return; }
  closedKeys(m, MEDIA_KEYS, path, err);
  if (!isStr(m.url)) err(`${path}.url`, 'url (chaîne) requise');
  if (!isMediaType(m.type)) err(`${path}.type`, `type média invalide : ${JSON.stringify(m.type)}`);
  if (has(m.role) && !(MEDIA_ROLES as readonly string[]).includes(m.role as string)) err(`${path}.role`, `rôle média invalide : ${JSON.stringify(m.role)}`);
  if (has(m.orientation) && !(MEDIA_ORIENTATIONS as readonly string[]).includes(m.orientation as string)) err(`${path}.orientation`, `orientation invalide : ${JSON.stringify(m.orientation)}`);
  if (has(m.meta)) validateClosed(m.meta, MEDIA_META_KEYS, `${path}.meta`, err, (mm, mp) => {
    if (has(mm.duration) && !(isNum(mm.duration) && (mm.duration as number) >= 0)) err(`${mp}.duration`, 'nombre ≥ 0 attendu');
    for (const k of ['title', 'thumbnail', 'author', 'external_url', 'track_id', 'lyrics_ref']) if (has(mm[k]) && !isStr(mm[k])) err(`${mp}.${k}`, 'chaîne attendue');
  });
}

function validateAction(a: unknown, path: string, err: Err): void {
  if (!isObj(a)) { err(path, 'action invalide'); return; }
  // WHITELIST stricte (une denylist de noms d'argent est perdante — A2).
  closedKeys(a, ACTION_KEYS, path, err);
  if (!isActionKind(a.kind)) err(`${path}.kind`, `kind d'action invalide : ${JSON.stringify(a.kind)}`);
  if (!isStr(a.label)) err(`${path}.label`, 'label (chaîne) requis');
  if (has(a.target) && !isStr(a.target)) err(`${path}.target`, 'target doit être un id (chaîne)');
  if (has(a.priority) && !(ACTION_PRIORITIES as readonly string[]).includes(a.priority as string)) err(`${path}.priority`, 'priority ∈ {primary, secondary}');
}

function validateLink(l: unknown, path: string, err: Err): void {
  if (!isObj(l)) { err(path, 'lien invalide'); return; }
  closedKeys(l, LINK_KEYS, path, err);
  if (!isLinkRel(l.rel)) err(`${path}.rel`, `rel de lien invalide : ${JSON.stringify(l.rel)}`);
  if (!isStr(l.target_id)) err(`${path}.target_id`, 'target_id (chaîne) requis');
  if (has(l.preview)) validateClosed(l.preview, LINK_PREVIEW_KEYS, `${path}.preview`, err);
}

function validateBlock(name: string, v: unknown, path: string, err: Err): void {
  if (!isObj(v)) { err(path, 'un bloc métier doit être un objet'); return; }
  // Cycle de vie de création : sous-documents imbriqués → validateurs DÉDIÉS (hors BLOCK_FIELD_TYPES plat).
  if (name === 'project') { validateProjectBlock(v, path, err); return; }
  if (name === 'mission') { validateMissionBlock(v, path, err); return; }
  if (name === 'resource') { validateResourceBlock(v, path, err); return; }
  const types = BLOCK_FIELD_TYPES[name];
  if (!types) { // ex. `music` (DDEX riche, non typé) : au moins interdire tout argent caché (P3).
    scanNoStrayMoney(v, path, err);
    return;
  }
  closedKeys(v, Object.keys(types), path, err);                 // clés fermées
  for (const [k, t] of Object.entries(types)) if (has(v[k])) validateBlockField(v[k], t, `${path}.${k}`, err); // + VALEURS contraintes
}

/** Contraint le TYPE de la valeur d'un champ de bloc (le rempart descend des clés aux valeurs). */
function validateBlockField(val: unknown, t: string, path: string, err: Err): void {
  switch (t) {
    case 's': if (!isStr(val)) err(path, 'chaîne attendue'); break;
    case 'n': if (!isNum(val)) err(path, 'nombre attendu'); break;
    case 'b': if (!isBool(val)) err(path, 'booléen attendu'); break;
    case 's[]': if (!isStrArr(val)) err(path, 'tableau de chaînes attendu'); break;
    case 'measure': validateClosed(val, ['value', 'unit'], path, err, (m, mp) => { if (!isNum(m.value)) err(`${mp}.value`, 'nombre attendu'); if (has(m.unit) && !isStr(m.unit)) err(`${mp}.unit`, 'chaîne attendue'); }); break;
    case 'money': validateMoney(val, path, err); break;
    case 'target': validateClosed(val, ['scope', 'zone'], path, err, (tg, tp) => { for (const k of ['scope', 'zone']) if (has(tg[k]) && !isStr(tg[k])) err(`${tp}.${k}`, 'chaîne attendue'); }); break;
    case 'salary': validateClosed(val, ['min', 'max', 'currency'], path, err, (sr, sp) => { if (has(sr.min) && !isNum(sr.min)) err(`${sp}.min`, 'nombre attendu'); if (has(sr.max) && !isNum(sr.max)) err(`${sp}.max`, 'nombre attendu'); if (has(sr.currency) && !isCurrency(sr.currency)) err(`${sp}.currency`, 'devise non autorisée (attendu MGA)'); }); break;
    default: if (isObj(val)) err(path, 'valeur objet interdite ici');
  }
}

/* ── Cycle de vie de création : project / mission / resource (Pascal 2026-07-21) ──
 * Sous-documents imbriqués → validateurs dédiés. Invariants durs : refs = ids OPAQUES (jamais de
 * PII), quantités/scores/bps = entiers, enums fermés, ET scan anti-argent sur TOUT le bloc
 * (aucun {amount,currency} : la rémunération = share_bps + rails affiliation/escrow existants — P3).
 * Les sous-documents de domaine (project.film/album) sont validés « loose » (comme `music`) :
 * structure riche non typée champ par champ, mais couverte par le scan anti-argent. */

/** Itère un tableau d'objets, en signalant chaque élément non-objet. */
function eachObj(v: unknown, path: string, err: Err, fn: (o: Record<string, unknown>, p: string) => void): void {
  if (!Array.isArray(v)) { err(path, 'tableau attendu'); return; }
  v.forEach((el, i) => { if (!isObj(el)) { err(`${path}[${i}]`, 'objet attendu'); return; } fn(el, `${path}[${i}]`); });
}

/** ref = id opaque (chaîne). Jamais de PII, jamais un objet {id, displayName}. */
function checkRef(v: unknown, path: string, err: Err): void {
  if (has(v) && !isStr(v)) err(path, 'id opaque (chaîne) attendu — jamais de PII');
}

function validateCandidate(c: Record<string, unknown>, path: string, err: Err): void {
  closedKeys(c, ['provenance', 'ref', 'external_ref', 'status', 'score', 'quantity'], path, err);
  if (!isIn(c.provenance, CANDIDATE_PROVENANCES)) err(`${path}.provenance`, `provenance invalide : ${JSON.stringify(c.provenance)} (asset|resource|opportunity|mission)`);
  const hasRef = has(c.ref), hasExt = has(c.external_ref);
  if (hasRef && !isStr(c.ref)) err(`${path}.ref`, 'ref (id opaque, chaîne) attendu');
  if (hasExt && !isStr(c.external_ref)) err(`${path}.external_ref`, 'external_ref (chaîne) attendu');
  if (hasRef && hasExt) err(path, 'ref ET external_ref exclusifs (un seul)');
  if (!hasRef && !hasExt) err(path, 'ref OU external_ref requis');
  if (has(c.status) && !isIn(c.status, CANDIDATE_STATUSES)) err(`${path}.status`, `statut invalide : ${JSON.stringify(c.status)}`);
  if (has(c.score) && !(isInt(c.score) && (c.score as number) >= 0 && (c.score as number) <= 100)) err(`${path}.score`, 'entier 0–100 attendu');
  if (has(c.quantity) && !isPosInt(c.quantity)) err(`${path}.quantity`, 'entier ≥ 0 attendu');
}

function validateNeed(n: Record<string, unknown>, path: string, err: Err): void {
  closedKeys(n, ['id', 'kind', 'title', 'description', 'status', 'source', 'quantity', 'location', 'priority', 'requirements', 'candidates', 'auto_created', 'detected_by'], path, err);
  if (!isStr(n.id)) err(`${path}.id`, 'id (chaîne) requis');
  // `kind` = TAG DE CAPACITÉ (chaîne libre) — PAS un card-kind du registre.
  for (const k of ['kind', 'title', 'description', 'location', 'detected_by']) if (has(n[k]) && !isStr(n[k])) err(`${path}.${k}`, 'chaîne attendue');
  if (has(n.status) && !isIn(n.status, NEED_STATUSES)) err(`${path}.status`, `statut invalide : ${JSON.stringify(n.status)}`);
  if (has(n.priority) && !isInt(n.priority)) err(`${path}.priority`, 'entier attendu');
  if (has(n.auto_created) && !isBool(n.auto_created)) err(`${path}.auto_created`, 'booléen attendu');
  if (has(n.source)) validateClosed(n.source, ['type', 'id'], `${path}.source`, err, (s, sp) => { for (const k of ['type', 'id']) if (has(s[k]) && !isStr(s[k])) err(`${sp}.${k}`, 'chaîne attendue'); });
  if (has(n.quantity)) validateClosed(n.quantity, ['required', 'filled', 'unit'], `${path}.quantity`, err, (q, qp) => {
    for (const k of ['required', 'filled']) if (has(q[k]) && !isPosInt(q[k])) err(`${qp}.${k}`, 'entier ≥ 0 attendu');
    if (has(q.unit) && !isStr(q.unit)) err(`${qp}.unit`, 'chaîne attendue');
  });
  if (has(n.requirements) && !isObj(n.requirements)) err(`${path}.requirements`, 'objet attendu');
  if (has(n.candidates)) eachObj(n.candidates, `${path}.candidates`, err, (c, cp) => validateCandidate(c, cp, err));
}

function validateProjectBlock(v: Record<string, unknown>, path: string, err: Err): void {
  closedKeys(v, BLOCK_SCHEMAS.project.keys, path, err);
  scanNoStrayMoney(v, path, err); // AUCUN argent dans `project` — P3
  if (has(v.domain) && !isIn(v.domain, PROJECT_DOMAINS)) err(`${path}.domain`, `domaine invalide : ${JSON.stringify(v.domain)}`);
  if (has(v.lifecycle) && !isIn(v.lifecycle, PROJECT_LIFECYCLE)) err(`${path}.lifecycle`, `lifecycle invalide : ${JSON.stringify(v.lifecycle)}`);
  if (has(v.intent) && !isStr(v.intent)) err(`${path}.intent`, 'chaîne attendue');
  checkRef(v.source_card_id, `${path}.source_card_id`, err);
  if (has(v.constraints)) validateClosed(v.constraints, ['locations', 'people', 'devices', 'target_duration_ms'], `${path}.constraints`, err, (c, cp) => {
    if (has(c.locations) && !isStrArr(c.locations)) err(`${cp}.locations`, 'tableau de chaînes attendu');
    for (const k of ['people', 'devices', 'target_duration_ms']) if (has(c[k]) && !isPosInt(c[k])) err(`${cp}.${k}`, 'entier ≥ 0 attendu');
  });
  if (has(v.approvals)) eachObj(v.approvals, `${path}.approvals`, err, (a, ap) => validateClosed(a, ['stage', 'state', 'by_ref', 'at'], ap, err, (o, op) => {
    if (!isIn(o.stage, APPROVAL_STAGES)) err(`${op}.stage`, `étape invalide : ${JSON.stringify(o.stage)}`);
    if (!isIn(o.state, APPROVAL_STATES)) err(`${op}.state`, `état invalide : ${JSON.stringify(o.state)}`);
    checkRef(o.by_ref, `${op}.by_ref`, err);
    if (has(o.at) && !isDate(o.at)) err(`${op}.at`, 'date invalide');
  }));
  if (has(v.contributors)) eachObj(v.contributors, `${path}.contributors`, err, (c, cp) => validateClosed(c, ['ref', 'roles', 'share_bps', 'status'], cp, err, (o, op) => {
    if (!isStr(o.ref)) err(`${op}.ref`, 'ref opaque (chaîne) requise'); // id opaque, jamais de PII
    if (has(o.roles) && !isStrArr(o.roles)) err(`${op}.roles`, 'tableau de chaînes attendu');
    if (has(o.share_bps) && !isPosInt(o.share_bps)) err(`${op}.share_bps`, 'entier ≥ 0 (bps) attendu');
    if (has(o.status) && !isIn(o.status, CONTRIBUTOR_STATUSES)) err(`${op}.status`, `statut invalide : ${JSON.stringify(o.status)}`);
  }));
  if (has(v.needs)) eachObj(v.needs, `${path}.needs`, err, (n, np) => validateNeed(n, np, err));
  // Sous-documents de domaine : structure riche → objet (le scan anti-argent couvre déjà tout `v`).
  if (has(v.film) && !isObj(v.film)) err(`${path}.film`, 'objet attendu');
  if (has(v.album) && !isObj(v.album)) err(`${path}.album`, 'objet attendu');
}

function validateMissionBlock(v: Record<string, unknown>, path: string, err: Err): void {
  closedKeys(v, BLOCK_SCHEMAS.mission.keys, path, err);
  scanNoStrayMoney(v, path, err); // compensation = share_bps entier, aucun {amount,currency} — P3
  checkRef(v.project_card_id, `${path}.project_card_id`, err);
  for (const k of ['need_id', 'kind', 'location']) if (has(v[k]) && !isStr(v[k])) err(`${path}.${k}`, 'chaîne attendue');
  for (const k of ['quantity_required', 'quantity_filled']) if (has(v[k]) && !isPosInt(v[k])) err(`${path}.${k}`, 'entier ≥ 0 attendu');
  if (has(v.date_window)) validateClosed(v.date_window, ['start', 'end'], `${path}.date_window`, err, (d, dp) => { for (const k of ['start', 'end']) if (has(d[k]) && !isDate(d[k])) err(`${dp}.${k}`, 'date invalide'); });
  if (has(v.requirements) && !isObj(v.requirements)) err(`${path}.requirements`, 'objet attendu');
  if (has(v.compensation)) validateClosed(v.compensation, ['mode', 'share_bps'], `${path}.compensation`, err, (co, cop) => {
    if (has(co.mode) && !isIn(co.mode, MISSION_COMPENSATION_MODES)) err(`${cop}.mode`, `mode invalide : ${JSON.stringify(co.mode)}`);
    if (has(co.share_bps) && !isPosInt(co.share_bps)) err(`${cop}.share_bps`, 'entier ≥ 0 (bps) attendu');
  });
  if (has(v.applications)) eachObj(v.applications, `${path}.applications`, err, (a, ap) => validateClosed(a, ['ref', 'resource_card_id', 'quantity_offered', 'status'], ap, err, (o, op) => {
    if (!isStr(o.ref)) err(`${op}.ref`, 'ref opaque (chaîne) requise');
    checkRef(o.resource_card_id, `${op}.resource_card_id`, err);
    if (has(o.quantity_offered) && !isPosInt(o.quantity_offered)) err(`${op}.quantity_offered`, 'entier ≥ 0 attendu');
    if (has(o.status) && !isIn(o.status, APPLICATION_STATUSES)) err(`${op}.status`, `statut invalide : ${JSON.stringify(o.status)}`);
  }));
  if (has(v.state) && !isIn(v.state, MISSION_STATES)) err(`${path}.state`, `état invalide : ${JSON.stringify(v.state)}`);
}

function validateResourceBlock(v: Record<string, unknown>, path: string, err: Err): void {
  closedKeys(v, BLOCK_SCHEMAS.resource.keys, path, err);
  scanNoStrayMoney(v, path, err);
  for (const k of ['kind', 'unit', 'location']) if (has(v[k]) && !isStr(v[k])) err(`${path}.${k}`, 'chaîne attendue');
  if (has(v.quantity_available) && !isPosInt(v.quantity_available)) err(`${path}.quantity_available`, 'entier ≥ 0 attendu');
  if (has(v.capabilities) && !isStrArr(v.capabilities)) err(`${path}.capabilities`, 'tableau de chaînes attendu');
  if (has(v.availability)) eachObj(v.availability, `${path}.availability`, err, (a, ap) => validateClosed(a, ['start', 'end'], ap, err, (o, op) => { for (const k of ['start', 'end']) if (has(o[k]) && !isDate(o[k])) err(`${op}.${k}`, 'date invalide'); }));
  if (has(v.metadata) && !isObj(v.metadata)) err(`${path}.metadata`, 'objet attendu');
}

/** Interdit tout objet { amount, currency } (argent) caché dans un sous-arbre « loose » (music, content). */
function scanNoStrayMoney(v: unknown, path: string, err: Err, depth = 0): void {
  if (depth > 8) return;
  if (Array.isArray(v)) { v.forEach((x, i) => scanNoStrayMoney(x, `${path}[${i}]`, err, depth + 1)); return; }
  if (!isObj(v)) return;
  if ('amount' in v && 'currency' in v) err(path, 'argent interdit ici — le prix est au socle (price/deposit/tariff/budget/salary) — P3');
  for (const [k, x] of Object.entries(v)) scanNoStrayMoney(x, `${path}.${k}`, err, depth + 1);
}

function validatePresentation(v: unknown, path: string, err: Err): void {
  validateClosed(v, PRESENTATION_KEYS, path, err, (pr, pp) => { for (const k of PRESENTATION_KEYS) if (has(pr[k]) && !isStr(pr[k])) err(`${pp}.${k}`, 'chaîne attendue'); });
}

/** hours : objet dont les valeurs sont scalaires ou tableaux de chaînes, et JAMAIS de forme argent. */
function validateHours(v: unknown, path: string, err: Err): void {
  if (!isObj(v)) { err(path, 'objet attendu'); return; }
  scanNoStrayMoney(v, path, err); // pas de { amount, currency } déguisé en « horaires »
  for (const [k, val] of Object.entries(v)) if (!(isStr(val) || isNum(val) || isBool(val) || isStrArr(val))) err(`${path}.${k}`, 'valeur scalaire ou tableau de chaînes attendue');
}

/** items[] : invariants de composition (C1 acyclique, C2 profondeur) + validation RÉCURSIVE. */
function validateItems(items: unknown, path: string, depth: number, ancestors: Set<string>, err: Err): void {
  if (items === undefined) return;
  if (!Array.isArray(items)) { err(path, 'tableau attendu'); return; }
  if (depth > MAX_COMPOSITION_DEPTH) { err(path, `profondeur de composition dépassée (max ${MAX_COMPOSITION_DEPTH}) — référencer au lieu d'imbriquer (C2)`); return; }

  items.forEach((it, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(it)) { err(p, 'élément de composition invalide'); return; }
    closedKeys(it, ITEM_KEYS, p, err);
    if (!isItemRole(it.role)) err(`${p}.role`, `rôle invalide : ${JSON.stringify(it.role)}`);
    if (has(it.order) && !isInt(it.order)) err(`${p}.order`, 'entier attendu');
    if (has(it.context_overrides)) validateClosed(it.context_overrides, CONTEXT_OVERRIDE_KEYS, `${p}.context_overrides`, err, (co, cop) => { if (has(co.presentation)) validatePresentation(co.presentation, `${cop}.presentation`, err); });
    if (has(it.preview)) validateClosed(it.preview, PREVIEW_KEYS, `${p}.preview`, err, (pv, pp) => { if (has(pv.price)) validateMoney(pv.price, `${pp}.price`, err); });

    if (it.carrier === 'card') {
      // Cohérence carrier/mode : pas de champs de primitive.
      if (has(it.primitive_type) || has(it.content)) err(p, 'carrier card : primitive_type/content interdits');
      if (!(ITEM_MODES as readonly string[]).includes(it.mode as string)) { err(`${p}.mode`, 'mode ∈ {inline, ref} requis'); return; }
      if (it.mode === 'ref') {
        if (has(it.card)) err(`${p}.card`, 'mode ref : pas de card inline');
        if (!isStr(it.ref)) err(`${p}.ref`, 'ref (id) requis en mode ref');
        else if (ancestors.has(it.ref)) err(`${p}.ref`, `CYCLE de composition (C1) : réfère un ancêtre ${JSON.stringify(it.ref)}`);
      } else { // inline
        if (has(it.ref)) err(`${p}.ref`, 'mode inline : pas de ref');
        if (!isObj(it.card)) { err(`${p}.card`, 'card (SuperCard) requise en mode inline'); return; }
        const childId = (it.card as Record<string, unknown>).id;
        if (isStr(childId) && ancestors.has(childId)) { err(`${p}.card.id`, `CYCLE de composition (C1) : ${JSON.stringify(childId)} déjà dans le chemin`); return; }
        const nextAncestors = new Set(ancestors); if (isStr(childId)) nextAncestors.add(childId);
        // ← RÉCURSION : la carte inline est validée ENTIÈREMENT (rempart à tous les étages).
        validateNode(it.card as Record<string, unknown>, `${p}.card`, depth + 1, nextAncestors, err);
      }
    } else if (it.carrier === 'primitive') {
      if (has(it.card) || has(it.ref) || has(it.mode)) err(p, 'carrier primitive : card/ref/mode interdits');
      if (!isPrimitiveType(it.primitive_type)) err(`${p}.primitive_type`, `type de primitive invalide : ${JSON.stringify(it.primitive_type)}`);
      if (has(it.content)) { if (!isObj(it.content)) err(`${p}.content`, 'objet attendu'); else scanNoStrayMoney(it.content, `${p}.content`, err); }
    } else {
      err(`${p}.carrier`, `carrier invalide : ${JSON.stringify(it.carrier)} (card|primitive)`);
    }
  });
}
