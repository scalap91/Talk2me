'use server-only';

/**
 * Talk2Me — TRANSPORTEUR (Pascal 2026-06-10). Faire transporter/déménager un OBJET
 * par n'importe qui de mobile (à pied, vélo, scooter, voiture, camionnette). Cas :
 * déménager un truc, livrer un colis, emmener aux ENCOMBRANTS (collecte mensuelle).
 * 3ᵉ flux logistique (Drive=personnes, Eat=repas, Transporteur=objets).
 */

import { randomUUID } from 'crypto';
import { getDb, createP2PConversation } from '@/lib/db';
import { lockEscrow, releaseEscrow, PLATFORM_USER_ID } from '@/lib/escrow';
import { createShipment, markCourseShipmentStatus } from '@/lib/shipment';
import { missionGate } from '@/lib/transport-profile';
import { getCommissionRate } from '@/lib/app-settings';
import { creditFieldOnSale } from '@/lib/field-earnings';

// Part plateforme sur une course de transport = commission plateforme unique (défaut 3%, réglable),
// DÉDUITE du transporteur — alignée sur colis + passager (Pascal 2026-08-12 ; fini le 10% en dur).

// Étapes de la course (le transporteur les avance, le demandeur confirme à la fin).
export const COURSE_STEPS = ['assigned', 'enroute', 'picked', 'delivered'] as const;

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS transport_requests (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      kind TEXT NOT NULL,          -- 'move' | 'encombrants' (les colis passent par le rail escrow shipments, pas ce board)
      title TEXT NOT NULL,
      photo_url TEXT,
      from_text TEXT,
      to_text TEXT,
      when_text TEXT,
      from_lat REAL, from_lng REAL,
      budget_cents INTEGER,
      status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'taken' | 'done' | 'cancelled'
      transporter_id TEXT,
      escrow_id TEXT,
      agreed_price_cents INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transport_status ON transport_requests(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS transport_offers (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      transporter_id TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'declined'
      created_at INTEGER NOT NULL,
      UNIQUE(request_id, transporter_id)
    );
    CREATE INDEX IF NOT EXISTS idx_offer_request ON transport_offers(request_id, status);
    CREATE INDEX IF NOT EXISTS idx_offer_transporter ON transport_offers(transporter_id);

    CREATE TABLE IF NOT EXISTS transport_messages (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tmsg_request ON transport_messages(request_id, created_at);
  `);
  // Migrations défensives (bases déjà créées avant ces colonnes).
  for (const c of ['escrow_id TEXT', 'agreed_price_cents INTEGER', "progress TEXT DEFAULT 'assigned'", 'handoff_token TEXT', 'conversation_id TEXT']) {
    try { getDb().exec(`ALTER TABLE transport_requests ADD COLUMN ${c}`); } catch { /* déjà là */ }
  }
  ensured = true;
}

export interface TransportRequest {
  id: string; requester_id: string; kind: string; title: string; photo_url: string | null;
  from_text: string | null; to_text: string | null; when_text: string | null;
  from_lat: number | null; from_lng: number | null; budget_cents: number | null;
  status: string; transporter_id: string | null; escrow_id?: string | null; agreed_price_cents?: number | null;
  progress?: string | null; handoff_token?: string | null; conversation_id?: string | null; created_at: number;
  requester_name?: string | null; transporter_name?: string | null; offers_count?: number;
}

export interface TransportOffer {
  id: string; request_id: string; transporter_id: string; price_cents: number;
  note: string | null; status: string; created_at: number; transporter_name?: string | null;
}

export function createTransportRequest(requesterId: string, r: {
  kind: 'move' | 'encombrants'; title: string; photo_url?: string | null;
  from_text?: string | null; to_text?: string | null; when_text?: string | null;
  from_lat?: number | null; from_lng?: number | null; budget_cents?: number | null;
}): TransportRequest {
  ensure();
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare(
    `INSERT INTO transport_requests (id, requester_id, kind, title, photo_url, from_text, to_text, when_text, from_lat, from_lng, budget_cents, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
  ).run(id, requesterId, r.kind, (r.title || '').trim().slice(0, 120) || 'Transport',
    r.photo_url || null, (r.from_text || '').slice(0, 120) || null, (r.to_text || '').slice(0, 120) || null,
    (r.when_text || '').slice(0, 80) || null, r.from_lat ?? null, r.from_lng ?? null,
    r.budget_cents != null ? Math.max(0, Math.round(r.budget_cents)) : null, now);
  return getTransportRequest(id)!;
}

export function getTransportRequest(id: string): TransportRequest | null {
  ensure();
  return (getDb().prepare('SELECT * FROM transport_requests WHERE id = ?').get(id) as TransportRequest) || null;
}

/** Demandes ouvertes (pour les transporteurs), plus récentes d'abord, avec nb d'offres. */
export function listOpenTransportRequests(limit = 50): TransportRequest[] {
  ensure();
  return getDb().prepare(
    `SELECT t.*, u.display_name AS requester_name,
            (SELECT COUNT(*) FROM transport_offers o WHERE o.request_id = t.id AND o.status = 'pending') AS offers_count
       FROM transport_requests t LEFT JOIN users u ON u.id = t.requester_id
      WHERE t.status = 'open' ORDER BY t.created_at DESC LIMIT ?`
  ).all(limit) as TransportRequest[];
}

/** Un transporteur PROPOSE un prix (upsert : une offre par demande). */
export function createOrUpdateOffer(requestId: string, transporterId: string, priceCents: number, note?: string | null):
  { ok: boolean; error?: string; offer?: TransportOffer } {
  ensure();
  const req = getTransportRequest(requestId);
  if (!req) return { ok: false, error: 'not_found' };
  if (req.status !== 'open') return { ok: false, error: 'not_open' };
  if (req.requester_id === transporterId) return { ok: false, error: 'own_request' };
  // Phase 4b-3 — gate PRENDRE UNE MISSION : CNI vérifiée + ≥1 véhicule (comme le colis via agence KYC).
  const gate = missionGate(transporterId);
  if (!gate.ok) return { ok: false, error: gate.reason === 'vehicle' ? 'vehicle_required' : 'cni_required' };
  const price = Math.round(priceCents);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'bad_price' };
  const now = Date.now();
  const id = randomUUID();
  getDb().prepare(
    `INSERT INTO transport_offers (id, request_id, transporter_id, price_cents, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)
     ON CONFLICT(request_id, transporter_id) DO UPDATE SET price_cents=excluded.price_cents,
       note=excluded.note, status='pending', created_at=excluded.created_at`
  ).run(id, requestId, transporterId, price, (note || '').slice(0, 200) || null, now);
  const offer = getDb().prepare('SELECT * FROM transport_offers WHERE request_id = ? AND transporter_id = ?')
    .get(requestId, transporterId) as TransportOffer;
  return { ok: true, offer };
}

/** Offres reçues sur une demande (pour le demandeur). */
export function listOffersForRequest(requestId: string): TransportOffer[] {
  ensure();
  return getDb().prepare(
    `SELECT o.*, u.display_name AS transporter_name
       FROM transport_offers o LEFT JOIN users u ON u.id = o.transporter_id
      WHERE o.request_id = ? ORDER BY o.price_cents ASC, o.created_at ASC`
  ).all(requestId) as TransportOffer[];
}

export function getOffer(id: string): TransportOffer | null {
  ensure();
  return (getDb().prepare('SELECT * FROM transport_offers WHERE id = ?').get(id) as TransportOffer) || null;
}

/**
 * Le DEMANDEUR accepte une offre : on BLOQUE le prix dans son wallet (escrow,
 * transporteur ~90% + plateforme ~10%), la demande passe « taken » et est
 * assignée au transporteur. Les autres offres passent « declined ».
 */
export function acceptOffer(offerId: string, requesterId: string):
  { ok: boolean; error?: string; escrow_id?: string; request?: TransportRequest } {
  ensure();
  const offer = getOffer(offerId);
  if (!offer) return { ok: false, error: 'offer_not_found' };
  const req = getTransportRequest(offer.request_id);
  if (!req) return { ok: false, error: 'not_found' };
  if (req.requester_id !== requesterId) return { ok: false, error: 'forbidden' };
  if (req.status !== 'open') return { ok: false, error: 'not_open' };

  const price = offer.price_cents;
  const platformCut = Math.round(price * getCommissionRate('platform_commission_rate'));
  const transporterCut = price - platformCut;
  const parts = [
    { user_id: offer.transporter_id, role: 'transporter', amount_cents: transporterCut },
    ...(platformCut > 0 ? [{ user_id: PLATFORM_USER_ID, role: 'platform', amount_cents: platformCut }] : []),
  ];
  const lock = lockEscrow(requesterId, price, parts, `transport:${req.id}`);
  if (!lock.ok || !lock.escrow) return { ok: false, error: lock.error || 'escrow_failed' };

  // Code de remise : connu du TRANSPORTEUR seul, transmis au client au moment de
  // la remise (tap NFC, ou dit sur Talk SMS/Phone). Le client confirme avec → release.
  const handoff = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  const db = getDb();
  db.transaction(() => {
    db.prepare('UPDATE transport_offers SET status = ? WHERE id = ?').run('accepted', offer.id);
    db.prepare("UPDATE transport_offers SET status = 'declined' WHERE request_id = ? AND id != ?").run(req.id, offer.id);
    db.prepare("UPDATE transport_requests SET status = 'taken', transporter_id = ?, escrow_id = ?, agreed_price_cents = ?, handoff_token = ? WHERE id = ?")
      .run(offer.transporter_id, lock.escrow!.id, price, handoff, req.id);
  })();

  // Phase 4b — la course tombe dans la FILE UNIQUE du chauffeur : on crée une shipment P2P
  // (pas d'agence, prix négocié, MÊME escrow). seller = transporteur ⇒ custody initiale = lui
  // (il détient la chose) ; buyer = demandeur (le receveur) ⇒ getTrace lui montre le code.
  // Best-effort : jamais bloquer l'acceptation/l'argent (comme createOrderShipment côté boutique).
  try {
    createShipment({
      sellerId: offer.transporter_id, buyerId: req.requester_id,
      orderId: req.id, escrowId: lock.escrow.id, agencyId: null, mode: 'livraison',
      productLabel: req.title, amount: price,
      oLat: req.from_lat ?? 0, oLng: req.from_lng ?? 0, oLabel: req.from_text || 'Départ',
      // Le board n'a pas de coordonnées de destination → on retombe sur le départ (carte approximative,
      // le reste — custody/code/escrow/statuts — exact). À compléter en 4b ultérieur si besoin.
      dLat: req.from_lat ?? 0, dLng: req.from_lng ?? 0, dLabel: req.to_text || 'Destination',
    });
  } catch { /* miroir best-effort */ }

  // Override parrainage transport (Pascal 2026-08-12) : le PARRAIN du transporteur touche sa tranche
  // de nos 3% (une seule chaîne, plafonnée). Best-effort : ne casse jamais l'acceptation.
  creditFieldOnSale({ orderType: req.kind, articleCents: price, sellerId: offer.transporter_id, label: req.title });

  return { ok: true, escrow_id: lock.escrow.id, request: getTransportRequest(req.id)! };
}

export interface CourseMessage { id: string; request_id: string; sender_id: string; body: string; created_at: number; sender_name?: string | null }

/** Renvoie la demande si l'user est partie prenante (demandeur OU transporteur), sinon null. */
export function getCoursePartyRequest(requestId: string, userId: string): TransportRequest | null {
  const req = getTransportRequest(requestId);
  if (!req) return null;
  if (req.requester_id !== userId && req.transporter_id !== userId) return null;
  return req;
}

/**
 * Talk Phone : get-or-create la conversation P2P de la course (livreur ↔ client),
 * SANS exiger l'amitié. On y route l'appel WebRTC (réutilise tout le stack appel
 * éprouvé : offer/answer/ice + sonnerie entrante + CallModal). Stocke conv_id.
 */
export function getCourseConversationId(requestId: string, userId: string):
  { ok: boolean; error?: string; conversation_id?: string } {
  ensure();
  const req = getCoursePartyRequest(requestId, userId);
  if (!req) return { ok: false, error: 'forbidden' };
  if (!req.transporter_id) return { ok: false, error: 'not_assigned' };
  if (req.conversation_id) return { ok: true, conversation_id: req.conversation_id };
  const conv = createP2PConversation(req.requester_id, req.transporter_id);
  getDb().prepare('UPDATE transport_requests SET conversation_id = ? WHERE id = ?').run(conv.id, requestId);
  return { ok: true, conversation_id: conv.id };
}

/** Ajoute un message dans le fil de LA course (livreur ↔ client, pas besoin d'être amis). */
export function addCourseMessage(requestId: string, senderId: string, body: string):
  { ok: boolean; error?: string; message?: CourseMessage } {
  ensure();
  if (!getCoursePartyRequest(requestId, senderId)) return { ok: false, error: 'forbidden' };
  const txt = (body || '').trim().slice(0, 1000);
  if (!txt) return { ok: false, error: 'empty' };
  const id = randomUUID();
  getDb().prepare('INSERT INTO transport_messages (id, request_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, requestId, senderId, txt, Date.now());
  return { ok: true, message: getDb().prepare('SELECT * FROM transport_messages WHERE id = ?').get(id) as CourseMessage };
}

/** Fil de la course (chronologique). */
export function listCourseMessages(requestId: string, limit = 200): CourseMessage[] {
  ensure();
  return getDb().prepare(
    `SELECT m.*, u.display_name AS sender_name
       FROM transport_messages m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.request_id = ? ORDER BY m.created_at ASC LIMIT ?`
  ).all(requestId, limit) as CourseMessage[];
}

/** Mes courses acceptées (en tant que demandeur ET en tant que transporteur). */
export function listMyCourses(userId: string): TransportRequest[] {
  ensure();
  return getDb().prepare(
    `SELECT t.*, u1.display_name AS requester_name, u2.display_name AS transporter_name
       FROM transport_requests t
       LEFT JOIN users u1 ON u1.id = t.requester_id
       LEFT JOIN users u2 ON u2.id = t.transporter_id
      WHERE t.status IN ('taken','done') AND (t.requester_id = ? OR t.transporter_id = ?)
      ORDER BY t.created_at DESC LIMIT 30`
  ).all(userId, userId) as TransportRequest[];
}

/** Le TRANSPORTEUR avance l'étape de sa course (assigned→enroute→picked→delivered). */
export function setCourseProgress(requestId: string, transporterId: string, progress: string):
  { ok: boolean; error?: string; request?: TransportRequest } {
  ensure();
  const req = getTransportRequest(requestId);
  if (!req) return { ok: false, error: 'not_found' };
  if (req.transporter_id !== transporterId) return { ok: false, error: 'forbidden' };
  if (req.status !== 'taken') return { ok: false, error: 'not_active' };
  if (!(COURSE_STEPS as readonly string[]).includes(progress)) return { ok: false, error: 'bad_step' };
  // On n'avance que vers l'avant (pas de retour en arrière).
  const cur = COURSE_STEPS.indexOf((req.progress as typeof COURSE_STEPS[number]) || 'assigned');
  const next = COURSE_STEPS.indexOf(progress as typeof COURSE_STEPS[number]);
  if (next < cur) return { ok: false, error: 'no_rewind' };
  getDb().prepare('UPDATE transport_requests SET progress = ? WHERE id = ?').run(progress, requestId);
  // Miroir file unique : dès que le porteur bouge (enroute/picked/delivered), la shipment passe « En cours ».
  if (progress !== 'assigned') markCourseShipmentStatus(req.escrow_id, 'in_transit');
  return { ok: true, request: getTransportRequest(requestId)! };
}

/** Libération réelle de la course (sans contrôle d'acteur — l'appelant a déjà vérifié qui il est). */
function releaseCourse(req: TransportRequest): { ok: boolean; error?: string; request?: TransportRequest } {
  if (req.status !== 'taken') return { ok: false, error: 'not_active' };
  if (!req.escrow_id) return { ok: false, error: 'no_escrow' };
  const rel = releaseEscrow(req.escrow_id);
  if (!rel.ok) return { ok: false, error: rel.error || 'release_failed' };
  getDb().prepare("UPDATE transport_requests SET status = 'done', progress = 'delivered' WHERE id = ?").run(req.id);
  // Miroir file unique : course livrée → shipment 'delivered' (custody → demandeur) ⇒ sort de la file du chauffeur.
  markCourseShipmentStatus(req.escrow_id, 'delivered');
  return { ok: true, request: getTransportRequest(req.id)! };
}

/** Fallback RECEVEUR : le demandeur confirme la réception sans code → LIBÈRE l'escrow. */
export function completeCourse(requestId: string, requesterId: string):
  { ok: boolean; error?: string; request?: TransportRequest } {
  ensure();
  const req = getTransportRequest(requestId);
  if (!req) return { ok: false, error: 'not_found' };
  if (req.requester_id !== requesterId) return { ok: false, error: 'forbidden' };
  return releaseCourse(req);
}

/**
 * Phase 4b-5 — sens du code aligné sur le COLIS : le RECEVEUR (le demandeur) DÉTIENT le code,
 * le REMETTEUR (le transporteur) le SAISIT à la remise → libère l'escrow. C'est la preuve que la
 * remise a bien eu lieu (le transporteur ne peut se faire payer qu'en obtenant le code du receveur).
 */
export function confirmHandoff(requestId: string, transporterId: string, token: string):
  { ok: boolean; error?: string; request?: TransportRequest } {
  ensure();
  const req = getTransportRequest(requestId);
  if (!req) return { ok: false, error: 'not_found' };
  if (req.transporter_id !== transporterId) return { ok: false, error: 'forbidden' };
  if (req.status !== 'taken') return { ok: false, error: 'not_active' };
  const given = (token || '').trim().toUpperCase();
  if (!given || !req.handoff_token || given !== req.handoff_token) return { ok: false, error: 'bad_code' };
  return releaseCourse(req);
}
