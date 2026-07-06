/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — LOGO OFFICIEL (Pascal 2026-06-26). Logo carré rouge officiel
 * (`public/brand/t2m-logo-square.png`, « T2M », 3 coins arrondis + 1 coin carré)
 * + le nom « TALK2ME » écrit EN TOUTES LETTRES dessous. PAS d'invention, PAS
 * d'oreille (bannie). Source de vérité : public/brand/README.md. `beat` = cœur.
 */
export default function T2MWordmark({ beat = false, size = 84, className = '' }: { beat?: boolean; size?: number; className?: string }) {
  return (
    <div className={'inline-flex flex-col items-center gap-2.5 ' + (beat ? 'animate-ttm-heartbeat ' : '') + className}>
      <img src="/brand/t2m-logo-square.png" alt="Talk2Me" width={size} height={size}
        className="object-contain" style={{ width: size, height: size }} />
      <span className="font-extrabold tracking-[0.32em] text-white leading-none" style={{ fontSize: Math.round(size * 0.2) }}>
        TALK<span className="text-red-500">2</span>ME
      </span>
    </div>
  );
}
