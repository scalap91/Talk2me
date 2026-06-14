'use server-only';

/**
 * Talk2Me — cœur de publication d'une sélection dropship (extrait de
 * /api/dropship/publish pour être réutilisé par la validation de curation).
 * Crée/complète une boutique appartenant à `ownerId`, traduit en FR, crée les
 * cards produit. Doctrine : curation PAR L'HUMAIN (l'humain a choisi).
 */

import { getDb, createBoutique, createDirectCard } from '@/lib/db';
import { suggestedPrice } from '@/lib/boutique-oneclick';
import { merchantTranslate } from '@/lib/agent-merchant';

export interface SelItem { pid: string; name: string; image: string; cost?: number | null }

export async function publishSelection(ownerId: string, opts: { name?: string; boutiqueId?: string; category?: string; items: SelItem[] }):
  Promise<{ ok: boolean; error?: string; boutique_id?: string; slug?: string; count?: number }> {
  const items = (opts.items || []).filter((i) => i && i.pid && i.image && i.name).slice(0, 60);
  if (items.length === 0) return { ok: false, error: 'no_items' };

  let boutiqueId = '', slug = '';
  if (opts.boutiqueId) {
    const bq = getDb().prepare('SELECT id, user_id, slug FROM boutiques WHERE id = ?').get(opts.boutiqueId) as { id: string; user_id: string; slug: string } | undefined;
    if (!bq) return { ok: false, error: 'no_boutique' };
    if (bq.user_id !== ownerId) return { ok: false, error: 'forbidden' };
    boutiqueId = bq.id; slug = bq.slug;
  } else {
    const created = createBoutique(ownerId, { name: (opts.name || 'Ma sélection').trim(), kind: 'dropship' }, Date.now());
    boutiqueId = created.id; slug = created.slug || '';
  }

  const fr = await merchantTranslate(items.map((i) => ({ pid: i.pid, name: i.name })));
  let count = 0;
  for (const it of items) {
    const t = fr.get(it.pid);
    const attached = {
      title: t?.fr_title || it.name, image_url: it.image, price_label: suggestedPrice(it.cost ?? null),
      description: t?.fr_description || '', source: 'CJ', source_url: '', cj_pid: it.pid, cost: it.cost ?? null, dropship: true,
    };
    try {
      createDirectCard(ownerId, { type: 'image', media_url: it.image, caption: attached.title, attached_product_json: JSON.stringify(attached), boutique_id: boutiqueId, category: (opts.category || 'Sélection').trim() });
      count++;
    } catch { /* skip */ }
  }
  return { ok: true, boutique_id: boutiqueId, slug, count };
}
