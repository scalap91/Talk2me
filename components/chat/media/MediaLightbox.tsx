'use client';

import React, { useEffect } from 'react';
import { X, Download, Share2 } from '@/lib/icons';

interface MediaLightboxProps {
  url: string;
  filename?: string;
  alt?: string;
  onClose: () => void;
}

/**
 * Talk2Me — Lightbox plein écran pour MediaImageCard.
 * Pascal verbatim 2026-06-04 : "si je partage [...] une image que ce soit
 * visible en carde dans le chat et que le lecteur sactive comme pour youtube
 * mais je peux telecharger".
 *
 * Mobile-first : tap n'importe où ferme, sauf bouton download. Escape ferme.
 */
const MediaLightbox: React.FC<MediaLightboxProps> = ({
  url,
  filename,
  alt,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      data-testid="media-lightbox"
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || filename || 'Image plein écran'}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt || filename || ''}
        className="max-w-[100vw] max-h-[100vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Header actions */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
        <a
          href={url}
          download={filename || true}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white text-[13px] transition-colors"
          aria-label="Télécharger l'image"
        >
          <Download size={16} />
          <span>Télécharger</span>
        </a>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const abs = url.startsWith('http') ? url : `${window.location.origin}${url}`;
              const nav = navigator as Navigator & { canShare?: (d?: unknown) => boolean };
              const res = await fetch(abs);
              const blob = await res.blob();
              const file = new File([blob], filename || 'image', { type: blob.type || 'image/jpeg' });
              if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
                await nav.share({ files: [file] });
              } else if (nav.share) {
                await nav.share({ url: abs });
              } else {
                window.open(abs, '_blank');
              }
            } catch { /* annulé */ }
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white text-[13px] transition-colors"
          aria-label="Exporter l'image"
        >
          <Share2 size={16} />
          <span>Exporter</span>
        </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};

export default MediaLightbox;
