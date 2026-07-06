'use client';

/**
 * CreateServiceSheet — publie une PRESTATION locale (Pascal 2026-07-05).
 * Annonce « listing + action chat » : pas un produit à acheter. Le visiteur clique
 * « Demander un devis » → conversation P2P (via /api/simple-shop/contact). Calqué sur
 * BoutiqueQuickSheet (même style/motion). POST /api/simple-shop { kind:'service' }.
 * Champs stockés dans les colonnes communes : name/category/description + service_mode
 * (=tarif) + address (=zone d'intervention) + coverUrl. Aucune nouvelle colonne.
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Wrench, Loader2, ImagePlus } from '@/lib/icons';

const METIERS = ['Plomberie', 'Électricité', 'Ménage', 'Coiffure', 'Manucure', 'Maçonnerie', 'Peinture', 'Jardinage', 'Cours particuliers', 'Couture', 'Menuiserie', 'Informatique', 'Autre'];

export default function CreateServiceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [tarif, setTarif] = useState('');
  const [zone, setZone] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
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

  // Validation : pas d'annonce vide (Pascal 2026-07-05 : « 1 mot suffisait à publier »).
  const isValid = name.trim().length >= 3 && !!category && desc.trim().length >= 15;

  const create = async () => {
    if (creating || !isValid) return;
    setCreating(true);
    try {
      const res = await fetch('/api/simple-shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'service',
          name: name.trim() || 'Ma prestation',
          description: desc.trim(),
          category,
          serviceMode: tarif.trim() || 'Sur devis',
          address: zone.trim(),
          coverUrl,
        }),
      });
      const d = await res.json();
      // Page 1 = la DEVANTURE. On enchaîne sur la page 2 (gérer mes services), comme la boutique.
      if (d?.ok && d.shop) { onClose(); router.push(`/ma-boutique/${d.shop.id}`); }
    } finally { setCreating(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose} role="dialog" aria-label="Proposer un service">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-black/40" />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} className="relative w-full max-w-[440px] bg-white rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#E7EAF0]">
          <Wrench size={22} className="text-[#0EA5E9]" />
          <h2 className="text-[18px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Proposer un service</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto text-[#9DAAB7] active:scale-95 text-[20px] leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[62vh] overflow-y-auto">
          <p className="text-[13px] text-[#9DAAB7] leading-relaxed">Ta prestation près de chez toi. Les gens te contactent en 1 tap pour un <b className="text-[#6A7585]">devis</b> — la discussion se fait dans le chat.</p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full aspect-[16/9] rounded-2xl border border-dashed border-[#E7EAF0] bg-[#F5F6F8] grid place-items-center overflow-hidden text-[#9DAAB7] active:scale-[0.99]"
            style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            {!coverUrl && (uploading
              ? <span className="text-[13px]">Envoi…</span>
              : <span className="flex flex-col items-center gap-1.5"><ImagePlus size={26} /><span className="text-[13px] font-medium">Ajouter une photo (optionnel)</span></span>)}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Titre de l&apos;annonce</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Plomberie Rakoto"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#0EA5E9]/50" />
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Métier</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#0EA5E9]/50">
              <option value="">Choisir…</option>
              {METIERS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Ex : Dépannage, installation, rénovation. Rapide et soigné."
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#0EA5E9]/50 resize-none" />
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Tarif</label>
            <input value={tarif} onChange={(e) => setTarif(e.target.value)} placeholder="Ex : À partir de 20 000 Ar — ou « sur devis »"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#0EA5E9]/50" />
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Zone d&apos;intervention</label>
            <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Ex : Antananarivo & alentours"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#0EA5E9]/50" />
          </div>
        </div>

        {!isValid && (
          <p className="px-5 -mt-1 text-[11.5px] text-[#B0651A]">Ajoute un <b>titre</b>, choisis un <b>métier</b> et écris une <b>description</b> (au moins une phrase) pour publier.</p>
        )}
        <div className="px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-[#E7EAF0] flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#6A7585] bg-[#F5F6F8] border border-[#E7EAF0]">Annuler</button>
          <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={create} disabled={creating || !isValid}
            className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white bg-[#0EA5E9] disabled:opacity-40 inline-flex items-center justify-center gap-1.5 active:scale-95">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            {creating ? 'Publication…' : 'Publier le service'}
          </motion.button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
