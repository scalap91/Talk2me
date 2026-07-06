'use client';

import React, { useState } from 'react';
import { Download } from '@/lib/icons';
import MediaLightbox from './MediaLightbox';

interface MediaImageCardProps {
  url: string;
  filename?: string;
  alt?: string;
}

/**
 * Talk2Me — Carte image dans le chat (Pascal 2026-06-04).
 * "il faut que si je partage [...] une image que ce soit visible en carde
 * dans le chat et [...] je peux telecharger".
 *
 * Tap image → lightbox plein écran. Bouton download persistant en overlay.
 * Aucune invention de data : on affiche le fichier tel quel.
 */
const MediaImageCard: React.FC<MediaImageCardProps> = ({ url, filename, alt }) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-testid="media-image-card"
      className="relative w-full max-w-[320px] rounded-2xl overflow-hidden bg-black/40 group"
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Agrandir l'image"
        className="block w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt || filename || 'Image partagée'}
          className="w-full max-h-[420px] object-cover"
          loading="lazy"
        />
      </button>

      {/* Bouton download flottant (toujours visible mobile, hover desktop) */}
      <a
        href={url}
        download={filename || true}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 right-2 flex items-center justify-center w-9 h-9 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur text-white transition-colors"
        aria-label="Télécharger l'image"
        data-testid="media-image-download"
      >
        <Download size={16} />
      </a>

      {open && (
        <MediaLightbox
          url={url}
          filename={filename}
          alt={alt}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

export default MediaImageCard;
