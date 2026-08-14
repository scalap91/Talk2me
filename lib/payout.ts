import 'server-only';
/**
 * Talk2Me — DÉCAISSEMENT automatique (payout) vers un bénéficiaire (Pascal 2026-06-26).
 *
 * Doctrine [[project_talk2me_payment_doctrine]] : 100% auto, zéro manuel, pas de wallet.
 * On encaisse (PaPi), on tient un REGISTRE, et on reverse AUTOMATIQUEMENT via l'API de
 * décaissement de l'opérateur (Airtel payout self-serve ; MVola/Orange quand clés payout).
 *
 * Tant qu'on n'a pas les accès payout, le connecteur tourne en SIMULATION : la ligne est
 * tracée dans le registre `payouts` (status 'simulated'), et le jour où les clés arrivent
 * il suffit d'implémenter sendViaXxx() — le reste du flux ne bouge pas.
 */
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

let _init = false;
function ensure() {
  const db = getDb();
  if (!_init) {
    db.exec(`CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MGA',
      provider TEXT NOT NULL,          -- airtel | mvola | orange | simulated
      provider_ref TEXT,
      status TEXT NOT NULL,            -- paid | simulated | failed
      label TEXT,
      ref TEXT,                        -- ex: 'rental_day:<bookingId>:<date>'
      created_at INTEGER NOT NULL
    );`);
    db.exec("CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts(user_id, created_at DESC);");
    // Migration (Pascal 2026-08-13) : une table `payouts` ANCIENNE (schéma dérivé) n'a pas ces colonnes
    // → `disburse` échouait (« no such column: ref ») et AUCUN reversement location ne partait. On rattrape.
    for (const col of ['ref TEXT', 'label TEXT', "currency TEXT NOT NULL DEFAULT 'MGA'"]) {
      try { db.exec(`ALTER TABLE payouts ADD COLUMN ${col}`); } catch { /* déjà présente */ }
    }
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_payouts_ref ON payouts(ref);"); } catch { /* */ }
    _init = true;
  }
  return db;
}

/** Choisit l'opérateur de décaissement d'après le numéro (préfixes Madagascar). */
function operatorForPhone(phone: string | null | undefined): 'airtel' | 'mvola' | 'orange' | null {
  const p = (phone || '').replace(/[^\d]/g, '');
  const local = p.startsWith('261') ? '0' + p.slice(3) : p; // E.164 → local
  if (/^03[34]/.test(local)) return 'airtel';   // 033/034 Airtel
  if (/^03[27]/.test(local)) return 'mvola';     // 032/037 Telma MVola
  if (/^03[26]/.test(local)) return 'orange';    // 032? 036 Orange — affiné quand clés
  return 'airtel'; // défaut : Airtel (rail payout prêt)
}

// Connecteurs réels — à implémenter quand les clés payout arrivent. Pour l'instant null.
async function sendViaAirtel(): Promise<{ ok: boolean; ref?: string } | null> { return null; }
async function sendViaMvola(): Promise<{ ok: boolean; ref?: string } | null> { return null; }
async function sendViaOrange(): Promise<{ ok: boolean; ref?: string } | null> { return null; }

/**
 * Reverse `amountCents` au bénéficiaire (mobile money). Auto, idempotent par `ref`
 * (un même ref n'est versé qu'une fois). Simulé tant que les connecteurs ne sont pas câblés.
 */
export async function disburse(args: { userId: string; amountCents: number; currency?: string; label?: string; ref: string }): Promise<{ ok: boolean; simulated: boolean; payoutId?: string }> {
  const db = ensure();
  const currency = args.currency || 'MGA';
  if (args.amountCents <= 0) return { ok: false, simulated: false };
  // Idempotence : déjà versé pour ce ref ?
  const exists = db.prepare("SELECT id, status FROM payouts WHERE ref = ? AND status IN ('paid','simulated') LIMIT 1").get(args.ref) as { id: string } | undefined;
  if (exists) return { ok: true, simulated: true, payoutId: exists.id };

  let phone: string | null = null;
  try { phone = (db.prepare('SELECT phone FROM users WHERE id = ?').get(args.userId) as { phone?: string } | undefined)?.phone || null; } catch { /* */ }
  const op = operatorForPhone(phone);

  // Tente le vrai décaissement (null tant que clés absentes) → sinon SIMULATION.
  let real: { ok: boolean; ref?: string } | null = null;
  try {
    real = op === 'airtel' ? await sendViaAirtel() : op === 'mvola' ? await sendViaMvola() : op === 'orange' ? await sendViaOrange() : null;
  } catch { real = null; }

  const id = randomUUID();
  const status = real?.ok ? 'paid' : 'simulated';
  db.prepare("INSERT INTO payouts (id, user_id, amount_cents, currency, provider, provider_ref, status, label, ref, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, args.userId, Math.round(args.amountCents), currency, real?.ok ? (op || 'op') : 'simulated', real?.ref || null, status, args.label || null, args.ref, Date.now());
  return { ok: true, simulated: status === 'simulated', payoutId: id };
}
