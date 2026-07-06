'use client';

/**
 * BoutiqueQuickSheet — création rapide d'une boutique (source UNIQUE, Pascal 2026-07-03).
 * Rapatrié depuis la modale 🏪 de Discussions (createShop → /api/simple-shop) vers le
 * Composeur (« Créer une card » → tuile Boutique). Titre corrigé (avant : « Messagerie
 * entreprise », trompeur). Design premium clair.
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Store, Loader2, ImagePlus } from '@/lib/icons';

const CATEGORIES = ['Mode', 'Beauté', 'Tech & High-tech', 'Maison & Déco', 'Alimentation', 'Bijoux & Accessoires', 'Bébé & Enfant', 'Sport & Loisirs', 'Auto & Moto', 'Services', 'Autre'];

export default function BoutiqueQuickSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open || typeof document === 'undefined') return null;

  const onPickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const up = await (await fetch('/api/upload', { method: 'POST', body: fd })).json();
      if (up?.url) setCoverUrl(up.url);
    } finally { setUploading(false); }
  };

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/simple-shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Ma boutique', description: desc.trim(), category, kind: 'boutique', coverUrl }),
      });
      const d = await res.json();
      if (d?.ok && d.shop) { onClose(); router.push(`/ma-boutique/${d.shop.id}`); }
    } finally { setCreating(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose} role="dialog" aria-label="Créer ma boutique">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-black/40" />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} className="relative w-full max-w-[440px] bg-white rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#E7EAF0]">
          <Store size={22} className="text-[#E86F00]" />
          <h2 className="text-[18px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Créer ma boutique</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto text-[#9DAAB7] active:scale-95 text-[20px] leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-[13px] text-[#9DAAB7] leading-relaxed">Ta petite boutique : tes <b className="text-[#6A7585]">photos avec prix</b>, tu la mets dans ta <b className="text-[#6A7585]">story</b>, on te paie au Wallet. Boost = audience élargie.</p>
          {/* Devanture (photo de couverture) */}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full aspect-[16/9] rounded-2xl border border-dashed border-[#E7EAF0] bg-[#F5F6F8] grid place-items-center overflow-hidden text-[#9DAAB7] active:scale-[0.99]"
            style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            {!coverUrl && (uploading
              ? <span className="text-[13px]">Envoi…</span>
              : <span className="flex flex-col items-center gap-1.5"><ImagePlus size={26} /><span className="text-[13px] font-medium">Ajouter la devanture (photo)</span></span>)}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Nom de la boutique</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Chez Léa"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#FF7F11]/50" />
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Description <span className="text-[#9DAAB7]">(ce que tu vends)</span></label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Ex : Vêtements & accessoires faits main, sur commande"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#FF7F11]/50 resize-none" />
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Catégorie <span className="text-[#9DAAB7]">(pour les Annonces)</span></label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#FF7F11]/50">
              <option value="">Choisir…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-[#E7EAF0] flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#6A7585] bg-[#F5F6F8] border border-[#E7EAF0]">Annuler</button>
          <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={create} disabled={creating}
            className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white bg-[#FF7F11] disabled:opacity-40 inline-flex items-center justify-center gap-1.5 active:scale-95">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
            {creating ? 'Création…' : 'Créer la boutique'}
          </motion.button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
