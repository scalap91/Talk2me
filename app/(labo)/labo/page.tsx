'use client';

/**
 * /labo — L'ATELIER (Pascal 2026-07-05).
 * Rassemble les features PARQUÉES ou EN DÉVELOPPEMENT, hors de l'app publique.
 * Accès gaté par le domaine `labo` (cf. layout). C'est ici qu'on teste ce qui
 * n'est pas (encore, ou pas) dans le thème « market du peuple ».
 *
 * Pour ajouter une feature au labo : une ligne dans FEATURES ci-dessous.
 */
import { useRouter } from 'next/navigation';

type Status = 'parqué' | 'en dev' | 'test';
interface LabItem {
  emoji: string;
  title: string;
  desc: string;
  href: string;
  status: Status;
}

// Ordre = du plus « produit potentiel » au plus expérimental.
const FEATURES: LabItem[] = [
  { emoji: '🎓', title: 'Formation', desc: 'PDF → cours en slides (Léa découpe). Pas assez abouti / hors thème local.', href: '/creer/formation', status: 'parqué' },
  { emoji: '✍️', title: 'Texte', desc: 'Card « une pensée, un post ». Pas assez défini pour le grand public.', href: '/creer/texte', status: 'parqué' },
  { emoji: '🧊', title: 'Salle 3D', desc: 'Pièce 3D / avatar. Hors thème, gardé pour recherche.', href: '/piece', status: 'parqué' },
  { emoji: '🧍', title: 'Avatar IA', desc: 'Photo → vidéo photoréaliste (HunyuanVideo GPU).', href: '/rd/avatar', status: 'en dev' },
  { emoji: '🏬', title: 'Boutique 3D', desc: 'Vitrine boutique en 3D. Expérimental.', href: '/boutique3d', status: 'parqué' },
  { emoji: '🧭', title: 'Boussole / Schéma technique', desc: 'Tableau de bord interne (modules, code, Léa).', href: '/schema', status: 'test' },
  { emoji: '🩺', title: 'Diagnostic PWA', desc: 'Version du service worker, cache, push.', href: '/pwa-diag', status: 'test' },
];

const STATUS_STYLE: Record<Status, string> = {
  parqué: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'en dev': 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  test: 'bg-white/10 text-white/70 border-white/20',
};

export default function LaboPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#0b0b0f] text-white px-4 py-6" style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 20px)' }}>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <button type="button" onClick={() => router.push('/home')} aria-label="Retour" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-[18px] active:scale-95">←</button>
          <div>
            <h1 className="text-[22px] font-bold leading-tight" style={{ fontFamily: "'Outfit',sans-serif" }}>🧪 Labo</h1>
            <p className="text-[12.5px] text-white/55">Les features parquées / en dev — invisibles pour les users.</p>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {FEATURES.map((f) => (
            <button
              key={f.href}
              type="button"
              onClick={() => router.push(f.href)}
              className="w-full flex items-center gap-3 text-left bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-2xl p-3.5 active:scale-[0.99] transition"
            >
              <div className="w-11 h-11 rounded-xl bg-white/[0.06] grid place-items-center text-[22px] shrink-0">{f.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold">{f.title}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLE[f.status]}`}>{f.status}</span>
                </div>
                <div className="text-[12.5px] text-white/55 mt-0.5 leading-snug">{f.desc}</div>
              </div>
              <span className="text-white/40 text-[18px] shrink-0">›</span>
            </button>
          ))}
        </div>

        <p className="text-center text-[11.5px] text-white/35 mt-6">Domaine <span className="font-mono text-white/55">labo</span> · gaté côté serveur · ajouter une feature = 1 ligne dans le code.</p>
      </div>
    </div>
  );
}
