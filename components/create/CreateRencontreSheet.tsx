'use client';

/**
 * CreateRencontreSheet — publie un PROFIL Rencontre (Pascal 2026-07-14).
 * Annonce « listing + action chat » comme Service/Emploi : PAS un produit à acheter.
 * Le visiteur clique « Écrire » → conversation P2P (via /api/simple-shop/contact).
 * POST /api/simple-shop { kind:'rencontre' }. Champs mappés sur les colonnes communes :
 * name=prénom, service_mode=âge, address=ville, description=présentation, cover=photo.
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Heart, Loader2, ImagePlus } from '@/lib/icons';

export default function CreateRencontreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pseudo, setPseudo] = useState('');
  const [age, setAge] = useState('');
  const [ville, setVille] = useState('');
  const [desc, setDesc] = useState('');
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

  const isValid = desc.trim().length >= 10;

  const create = async () => {
    if (creating || !isValid) return;
    setCreating(true);
    try {
      const res = await fetch('/api/simple-shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Pseudo OPTIONNEL rattaché au compte (vide → nom du profil, côté serveur). Anti faux profil.
          // 1 SEUL profil Rencontre par compte (le serveur met à jour si déjà créé). Pascal 2026-07-14.
          kind: 'rencontre',
          name: pseudo.trim() || undefined,
          description: desc.trim(),
          serviceMode: age.trim() ? `${age.trim()} ans` : '',
          address: ville.trim(),
          coverUrl,
        }),
      });
      const d = await res.json();
      if (d?.ok) { onClose(); router.push('/rencontre'); }
    } finally { setCreating(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onClick={onClose} role="dialog" aria-label="Créer mon profil Rencontre">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-black/40" />
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 32, stiffness: 320 }} className="relative w-full max-w-[440px] bg-white rounded-t-[28px] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#E7EAF0]">
          <span className="px-1.5 py-0.5 rounded-md bg-pink-600 text-white text-[10px] font-mono font-bold tracking-widest">PROFIL-40</span>
          <Heart size={22} className="text-[#EC4899]" />
          <h2 className="text-[18px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Mon profil Rencontre</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto text-[#9DAAB7] active:scale-95 text-[20px] leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[62vh] overflow-y-auto">
          <p className="text-[13px] text-[#9DAAB7] leading-relaxed">Présente-toi. Les gens t&apos;écrivent en 1 tap — la discussion se fait dans le chat. Aucun numéro affiché.</p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full aspect-[16/9] rounded-2xl border border-dashed border-[#E7EAF0] bg-[#F5F6F8] grid place-items-center overflow-hidden text-[#9DAAB7] active:scale-[0.99]"
            style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            {!coverUrl && (uploading
              ? <span className="text-[13px]">Envoi…</span>
              : <span className="flex flex-col items-center gap-1.5"><ImagePlus size={26} /><span className="text-[13px] font-medium">Ajouter une photo</span></span>)}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Pseudo (optionnel)</label>
            <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Vide = ton prénom du profil"
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EC4899]/50" />
            <p className="text-[11px] text-[#9DAAB7] mt-1">Le pseudo est rattaché à ton compte (pas de faux profil).</p>
          </div>
          <div className="flex gap-3">
            <div className="w-24">
              <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Âge</label>
              <input value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} inputMode="numeric" placeholder="28"
                className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EC4899]/50" />
            </div>
            <div className="flex-1">
              <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Ville</label>
              <input value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ex : Antananarivo"
                className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EC4899]/50" />
            </div>
          </div>
          <div>
            <label className="text-[12px] text-[#9DAAB7] block mb-1.5">Je me présente</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Ex : Sympa, aime la musique et les balades. Je cherche à faire de belles rencontres."
              className="w-full bg-[#F5F6F8] border border-[#E7EAF0] rounded-xl px-3 py-2.5 text-[14px] text-[#2F343A] outline-none focus:border-[#EC4899]/50 resize-none" />
          </div>
        </div>

        {!isValid && (
          <p className="px-5 -mt-1 text-[11.5px] text-[#B0651A]">Mets un <b>prénom</b> et une petite <b>présentation</b> pour publier.</p>
        )}
        <div className="px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-[#E7EAF0] flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[14px] font-medium text-[#6A7585] bg-[#F5F6F8] border border-[#E7EAF0]">Annuler</button>
          <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={create} disabled={creating || !isValid}
            className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white bg-[#EC4899] disabled:opacity-40 inline-flex items-center justify-center gap-1.5 active:scale-95">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
            {creating ? 'Publication…' : 'Publier mon profil'}
          </motion.button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
