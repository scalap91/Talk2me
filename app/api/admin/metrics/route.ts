/**
 * Talk2Me — Dashboard metrics (admin). Tout branché sur la VRAIE DB (capteur
 * réel, jamais de chiffre inventé — doctrine [[feedback-compteurs-recoupement]]).
 * Commerce + Usage + Engagement + Léa/IA.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getDb, getSignupsByCountry } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAiOpsAdmin(user.id, (user as { email?: string }).email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = getDb();
  const now = Date.now();
  const DAY = 86400000;
  const n = (sql: string, ...args: unknown[]): number => {
    try {
      const row = db.prepare(sql).get(...args) as { c?: number } | undefined;
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  };

  // ---- USAGE / CROISSANCE ----
  const usage = {
    users_total: n('SELECT COUNT(*) c FROM users'),
    users_new_24h: n('SELECT COUNT(*) c FROM users WHERE created_at > ?', now - DAY),
    users_new_7j: n('SELECT COUNT(*) c FROM users WHERE created_at > ?', now - 7 * DAY),
    users_actifs_7j: n('SELECT COUNT(*) c FROM users WHERE last_seen > ?', now - 7 * DAY),
    posts_total: n("SELECT COUNT(*) c FROM posts WHERE deleted_at IS NULL"),
    cards_total: n("SELECT COUNT(*) c FROM direct_cards WHERE deleted_at IS NULL AND boutique_id IS NULL"),
  };

  // ---- COMMERCE / BOUTIQUES ----
  const commerce = {
    boutiques_total: n('SELECT COUNT(*) c FROM boutiques'),
    boutiques_new_7j: n('SELECT COUNT(*) c FROM boutiques WHERE created_at > ?', now - 7 * DAY),
    produits_total: n("SELECT COUNT(*) c FROM shop_products WHERE deleted_at IS NULL"),
    boutiques_avec_produits: n(
      'SELECT COUNT(DISTINCT boutique_id) c FROM shop_products WHERE boutique_id IS NOT NULL AND deleted_at IS NULL'
    ),
    top_boutiques: (() => {
      try {
        return db
          .prepare(
            `SELECT b.name, b.slug, COUNT(d.id) AS produits
             FROM boutiques b
             LEFT JOIN direct_cards d ON d.boutique_id = b.id AND d.deleted_at IS NULL
             GROUP BY b.id ORDER BY produits DESC, b.created_at DESC LIMIT 6`
          )
          .all() as { name: string; slug: string | null; produits: number }[];
      } catch {
        return [];
      }
    })(),
  };

  // ---- ENGAGEMENT CONTENU ----
  const sum = (sql: string): number => {
    try {
      const row = db.prepare(sql).get() as { s?: number } | undefined;
      return row?.s ?? 0;
    } catch {
      return 0;
    }
  };
  const engagement = {
    vues_total:
      sum("SELECT COALESCE(SUM(views),0) s FROM posts WHERE deleted_at IS NULL") +
      sum("SELECT COALESCE(SUM(views),0) s FROM direct_cards WHERE deleted_at IS NULL"),
    likes_total:
      sum("SELECT COALESCE(SUM(likes),0) s FROM posts WHERE deleted_at IS NULL") +
      sum("SELECT COALESCE(SUM(likes),0) s FROM direct_cards WHERE deleted_at IS NULL"),
    partages_total:
      sum("SELECT COALESCE(SUM(share_count),0) s FROM posts WHERE deleted_at IS NULL") +
      sum("SELECT COALESCE(SUM(share_count),0) s FROM direct_cards WHERE deleted_at IS NULL"),
    commentaires_total:
      sum("SELECT COALESCE(SUM(comment_count),0) s FROM posts WHERE deleted_at IS NULL") +
      sum("SELECT COALESCE(SUM(comment_count),0) s FROM direct_cards WHERE deleted_at IS NULL"),
    saves_total: sum("SELECT COALESCE(SUM(save_count),0) s FROM direct_cards WHERE deleted_at IS NULL"),
    // publications/jour (7 derniers jours) = posts + cards
    par_jour: (() => {
      const days: { jour: string; n: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const start = now - (i + 1) * DAY;
        const end = now - i * DAY;
        const c =
          n('SELECT COUNT(*) c FROM posts WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?', start, end) +
          n('SELECT COUNT(*) c FROM direct_cards WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?', start, end);
        days.push({ jour: new Date(end - DAY / 2).toISOString().slice(5, 10), n: c });
      }
      return days;
    })(),
  };

  // ---- IA (LLM MULTI-UTILISATEUR — pas "Léa" qui est le nom perso d'un user) ----
  const ia = {
    conversations: n('SELECT COUNT(*) c FROM conversations'),
    messages_total: n('SELECT COUNT(*) c FROM messages'),
    messages_lea: n("SELECT COUNT(*) c FROM messages WHERE role = 'agent'"),
    outils: {
      recherche_web: n('SELECT COUNT(*) c FROM messages WHERE web_search IS NOT NULL'),
      produits: n('SELECT COUNT(*) c FROM messages WHERE products IS NOT NULL'),
      lieux: n('SELECT COUNT(*) c FROM messages WHERE places IS NOT NULL'),
      recettes: n('SELECT COUNT(*) c FROM messages WHERE recipe IS NOT NULL'),
      youtube: n('SELECT COUNT(*) c FROM messages WHERE youtube IS NOT NULL'),
      meteo: n('SELECT COUNT(*) c FROM messages WHERE weather IS NOT NULL'),
      wikipedia: n('SELECT COUNT(*) c FROM messages WHERE wikipedia IS NOT NULL'),
    },
  };

  // ---- WALLET / MONÉTISATION ----
  const wallet = {
    transactions: n('SELECT COUNT(*) c FROM wallet_transactions'),
    credits_cents: sum("SELECT COALESCE(SUM(amount_cents),0) s FROM wallet_transactions WHERE amount_cents > 0"),
    debits_cents: sum("SELECT COALESCE(SUM(amount_cents),0) s FROM wallet_transactions WHERE amount_cents < 0"),
  };

  // Inscrits par pays (anonyme — on n'a que le pays, jamais l'IP).
  const geo = getSignupsByCountry();

  return NextResponse.json({ ok: true, generated_at: now, usage, commerce, engagement, ia, wallet, geo });
}
