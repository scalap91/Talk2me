/**
 * 404 GLOBALE Talk2Me (Pascal 2026-06-29). Logo T2M + UN SEUL lien → le feed
 * (/home). NB : '/' = conversation avec Léa, PAS le feed ; le feed c'est /home.
 */
export default function NotFound() {
  return (
    <div className="min-h-[100svh] bg-[#0a0a0d] text-white flex flex-col items-center justify-center gap-5 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/t2m-logo-square.png" alt="Talk2Me" className="w-20 h-20 rounded-2xl" />
      <p className="text-[22px] font-semibold">Page introuvable</p>
      <p className="text-white/55 text-[14px] max-w-xs">
        La page que tu cherches n&apos;existe pas (ou a été déplacée).
      </p>
      {/* Lien DUR (recharge complète) → jamais bloqué dans une 404 SPA. */}
      <a
        href="/home"
        className="mt-1 px-6 py-3 rounded-full bg-red-600 text-white text-[15px] font-semibold active:scale-95"
      >
        ← Retour au feed
      </a>
    </div>
  );
}
