'use client';

/**
 * Talk2Me — Studio Avatar IA (Pascal 2026-06-18) — 100% INTERNE, ZÉRO API EXTERNE.
 *
 * Plus de Streamoji / Avaturn / RPM. Deux voies, toutes les deux chez nous :
 *  1. « Depuis ma photo » : upload d'un selfie → NOTRE GPU (Hunyuan3D) génère le
 *     modèle 3D → hébergé chez nous → corps de l'avatar IA dans /piece.
 *  2. « Importer .glb » : on dépose un modèle déjà fait → hébergé chez nous.
 *
 * Aucun service externe au runtime.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AvatarStudioPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [step, setStep] = useState('');

  async function fileToB64(file: File): Promise<string> {
    return new Promise((res) => {
      const fr = new FileReader();
      fr.onloadend = () => res(String(fr.result || '').split(',')[1] || '');
      fr.readAsDataURL(file);
    });
  }

  // Depuis une photo → NOTRE GPU (Hunyuan) → GLB → corps de l'avatar IA
  async function onPhoto(file: File | null) {
    if (!file || busy) return;
    setBusy(true); setMsg(''); setStep('Lecture de la photo…');
    try {
      const b64 = await fileToB64(file);
      if (!b64) { setMsg('Photo illisible.'); setBusy(false); return; }
      setStep('Génération de la vidéo sur notre GPU… (3-5 min, ne ferme pas)');
      const r = await fetch('/api/avatar/from-photo-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_b64: b64 }),
      });
      const j = await r.json();
      if (j?.ok && j.url) {
        setStep('Vidéo prête — entrée dans ta pièce…');
        setTimeout(() => router.push('/piece'), 900);
      } else {
        setMsg(
          j?.error === 'gpu_unavailable' ? 'Le GPU est indisponible, réessaie dans un instant.'
          : j?.error === 'timeout' ? 'La génération a été trop longue, réessaie.'
          : 'Génération impossible. Réessaie.'
        );
        setBusy(false); setStep('');
      }
    } catch {
      setMsg('Échec réseau.'); setBusy(false); setStep('');
    }
  }

  // Importer un .glb déjà prêt → hébergé chez nous
  async function onGlb(file: File | null) {
    if (!file || busy) return;
    setBusy(true); setMsg(''); setStep('Import du modèle…');
    try {
      const b64 = await fileToB64(file);
      const r = await fetch('/api/avatar/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glb_b64: b64 }),
      });
      const j = await r.json();
      if (j?.ok) { setStep('Importé — entrée dans ta pièce…'); setTimeout(() => router.push('/piece'), 800); }
      else { setMsg(j?.error === 'not_a_glb' ? 'Ce n’est pas un .glb valide.' : 'Import impossible.'); setBusy(false); setStep(''); }
    } catch { setMsg('Échec.'); setBusy(false); setStep(''); }
  }

  return (
    <div className="flex flex-col h-[100svh] w-full max-w-md mx-auto bg-[#0e0e12] text-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <button onClick={() => router.push('/piece')} className="text-white/60 hover:text-white text-sm">← Pièce</button>
        <div className="flex-1">
          <div className="text-sm font-semibold">Mon avatar IA</div>
          <div className="text-[11px] text-white/40">Généré sur notre GPU — aucun service externe.</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 px-8 text-center">
        {busy ? (
          <>
            <div className="text-4xl animate-pulse">🧬</div>
            <div className="text-sm text-white/85">{step}</div>
            <div className="text-[11px] text-white/40">Tout se passe sur notre propre machine.</div>
          </>
        ) : (
          <>
            <div className="text-5xl">🎬</div>
            <div className="text-sm text-white/80">Crée ton avatar <b>vidéo photoréaliste</b> depuis une photo.<br />La génération tourne <b>sur notre GPU</b>, rien n’est envoyé à un service externe.</div>

            <label className="w-full max-w-xs px-5 py-4 rounded-xl bg-white text-black text-sm font-semibold cursor-pointer">
              📸 Depuis ma photo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0] || null)} />
            </label>

            <div className="text-[11px] text-white/30">— ou —</div>

            <label className="w-full max-w-xs px-5 py-3 rounded-xl bg-white/10 text-white/80 text-sm font-medium cursor-pointer border border-white/15">
              📦 Importer un .glb
              <input type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={(e) => onGlb(e.target.files?.[0] || null)} />
            </label>

            {msg && <div className="text-[12px] text-red-400">{msg}</div>}
          </>
        )}
      </div>
    </div>
  );
}
