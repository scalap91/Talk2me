'use client';

/**
 * Talk2Me — Card officielle YouTube ~60px (Pascal 2026-06-09, conformité YouTube).
 * Remplace le lecteur audio-only CACHÉ (interdit par les CGU YouTube) sur les
 * cards du feed home. On montre LEUR card : vignette officielle + titre +
 * branding YouTube + lien vers la vidéo. Aucun audio extrait, aucun lecteur
 * masqué. Le clic ouvre la vidéo sur YouTube (lecteur officiel).
 */

function ytThumb(videoId: string, fallback?: string | null): string {
  return fallback || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export default function YouTubeMiniCard({
  videoId,
  title,
  thumbnail,
}: {
  videoId: string;
  title: string;
  thumbnail?: string | null;
}) {
  return (
    <a
      href={`https://www.youtube.com/watch?v=${videoId}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2.5 h-[80px] w-full rounded-xl bg-black/55 backdrop-blur border border-white/15 pl-1.5 pr-2.5 active:scale-[0.99]"
      aria-label="Regarder sur YouTube"
    >
      {/* Vignette officielle 16:9 (l'aperçu de la vidéo) */}
      <span className="relative h-[64px] aspect-video rounded-lg overflow-hidden bg-black shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ytThumb(videoId, thumbnail)} alt="" className="w-full h-full object-cover" draggable={false} />
        <span className="absolute inset-0 grid place-items-center">
          <span className="w-7 h-5 rounded-md bg-[#FF0000] grid place-items-center">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </span>
      </span>
      {/* Titre + branding officiel */}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-white/95 leading-tight line-clamp-1">{title}</span>
        <span className="flex items-center gap-1 mt-0.5 text-[10px] text-white/65">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
            <path fill="#FF0000" d="M23 7.1a3 3 0 0 0-2.1-2.1C19 4.5 12 4.5 12 4.5s-7 0-8.9.5A3 3 0 0 0 1 7.1 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.9 3 3 0 0 0 3.1 19c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.1Z" />
            <path fill="#fff" d="M9.75 15.5v-7L15.5 12z" />
          </svg>
          Regarder sur YouTube
        </span>
      </span>
    </a>
  );
}
