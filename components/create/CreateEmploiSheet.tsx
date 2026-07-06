'use client';

/**
 * CreateEmploiSheet — publie une OFFRE D'EMPLOI locale (Pascal 2026-07-05).
 * Annonce « listing + action chat » : pas un produit à acheter. Le candidat clique
 * « Postuler » → conversation P2P (via /api/simple-shop/contact). Calqué sur
 * BoutiqueQuickSheet (même style/motion). POST /api/simple-shop { kind:'emploi' }.
 * Champs stockés dans les colonnes communes : name/category/description + service_mode
 * (=rémunération) + address (=lieu) + coverUrl. Aucune nouvelle colonne.
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Briefcase, Loader2, ImagePlus } from '@/lib/icons';

const TYPES = ['CDI', 'CDD', 'Mission', 'Petit boulot', 'Stage', 'Temps partiel'];

export default function CreateEmploiSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [remu, setRemu] = useState('');
  const [lieu, setLieu] = useState('');
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

  const create = async () => {
    if (creating || !name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/simple-shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'emploi',
          name: name.trim() || 'Offre d’emploi',
          description: desc.trim(),
          category,
          serviceMode: remu.trim() || 'À négocier',
          address: lieu.trim(),
          coverUrl,
        }),
      });
      const d = await res.json();
      if (d?.ok && d.shop) { onClose(); router.push(`/ma-boutique/${d.shop.id}`); }
    } finally { setCreating(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose} role="dialog" aria-label="Proposer un emploi">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-black/40" />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} className="relative w-full max-w-[440px] bg-white rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#E7EAF0]">
          <Briefcase size={22} className="text-[#EF4444]" />
          <h2 className="text-[18px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Proposer un emploi</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto text-[#9DAAB7] active:scale-95 text-[20px] leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[62vh] overflow-y-auto">
          <p className="text-[13px] text-[#9DAAB7] leading-relaxed">Ton offre près de chez toi. Les candidats <b className="text-[#6A7585]">postulent</b> en 1 tap — l&apos;échange se fait dans le chat.</p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full aspect-[16/9] rounded-2xl border border-dashed border-[#E7EAF0] bg-[#F5F6F8] grid place-items-center overflow-hidden text-[#9DAAB7] active:scale-[0.99]"
            style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            {!coverUrl && (uploading
              ? <span className="text-[13px]">Envoi…</span>
              : <span className="flex flex-col items-center gap-1.5"><ImagePlus size={26} /><span className="text-[13px] font-medium">Ajouter une photo (optionnel)</span></span>)}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Intitulé du poste</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Serveur / serveuse"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EF4444]/50" />
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Type de contrat</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EF4444]/50">
              <option value="">Choisir…</option>
              {TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Description du poste</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Ex : Service en salle, expérience appréciée, horaires du soir."
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EF4444]/50 resize-none" />
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Rémunération</label>
            <input value={remu} onChange={(e) => setRemu(e.target.value)} placeholder="Ex : 500 000 Ar / mois — ou « à négocier »"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EF4444]/50" />
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Lieu</label>
            <input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Ex : Antananarivo, Analakely"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EF4444]/50" />
          </div>
        </div>

        <div className="px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-[#E7EAF0] flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#6A7585] bg-[#F5F6F8] border border-[#E7EAF0]">Annuler</button>
          <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={create} disabled={creating || !name.trim()}
            className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white bg-[#EF4444] disabled:opacity-40 inline-flex items-center justify-center gap-1.5 active:scale-95">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
            {creating ? 'Publication…' : 'Publier l’offre'}
          </motion.button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
