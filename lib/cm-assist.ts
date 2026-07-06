import 'server-only';

/**
 * Talk2Me — CM ASSISTÉ pour le groupe Facebook (Pascal 2026-06-22).
 * L'API groupe est fermée par Meta → on n'auto-poste PAS (risque de ban). À la place :
 * l'IA prépare un post PRÊT (texte + image) depuis les annonces publiées ; le CM humain
 * copie en 1 tap et colle dans le groupe. 90% du travail fait, zéro risque de ban.
 */
import { getDb } from '@/lib/db';

const SITE = 'https://talk2me.fr';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec('CREATE TABLE IF NOT EXISTS cm_posted (annonce_id TEXT PRIMARY KEY, posted_at INTEGER NOT NULL)');
  ensured = true;
}

interface AnnRow { id: string; title: string; description: string | null; category: string | null; price_cents: number | null; city: string | null; image_url: string | null; created_at: number }
export interface GroupPost { annonce_id: string; title: string; text: string; comment: string; image_abs: string | null; created_at: number }

function fmt(a: AnnRow): GroupPost {
  const price = a.price_cents != null ? `${(a.price_cents / 100).toLocaleString('fr-FR')} Ar` : 'Prix à discuter';
  const city = a.city ? `📍 ${a.city}` : '';
  const desc = (a.description || '').trim().slice(0, 200);
  const tag = (s: string) => '#' + s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '');
  const tags = ['#Madagascar', a.city ? tag(a.city) : '', a.category ? tag(a.category) : '', '#PetitesAnnonces', '#Talk2Me'].filter(Boolean).join(' ');
  // CORPS du post : annonce complète + CTA valeur (achat sécurisé + livraison), SANS lien externe
  // (FB bride les posts qui sortent de FB → le lien part en 1er commentaire).
  const text = [
    `🛍️ ${a.title}`,
    [price, city].filter(Boolean).join('  ·  '),
    desc,
    '',
    '🔒 Achat sécurisé (paiement bloqué jusqu’à réception) + 🛵 livraison à domicile partout à Mada, via Talk2Me.',
    tags,
  ].filter((x) => x !== '').join('\n');
  // 1er COMMENTAIRE : le lien (placé en commentaire pour ne pas brider la portée du post).
  const comment = `👉 Voir l’annonce, contacter le vendeur et commander avec livraison ici : ${SITE}\n(Installe l’appli Talk2Me — c’est gratuit.)`;
  return { annonce_id: a.id, title: a.title, text, comment, image_abs: a.image_url ? SITE + a.image_url : null, created_at: a.created_at };
}

/** Annonces publiées pas encore marquées "postées dans le groupe". */
export function listPendingGroupPosts(limit = 30): GroupPost[] {
  ensure();
  let rows: AnnRow[] = [];
  try {
    rows = getDb().prepare(`
      SELECT a.* FROM deposit_annonces a
      LEFT JOIN cm_posted p ON p.annonce_id = a.id
      WHERE a.status = 'published' AND p.annonce_id IS NULL
      ORDER BY a.created_at DESC LIMIT ?
    `).all(limit) as AnnRow[];
  } catch { rows = []; }
  return rows.map(fmt);
}

export function markGroupPosted(annonceId: string) {
  ensure();
  getDb().prepare('INSERT OR REPLACE INTO cm_posted (annonce_id, posted_at) VALUES (?, ?)').run(annonceId, Date.now());
}
