'use client';

/**
 * WikipediaCard — résumé Wikipedia (titre, extrait, thumbnail).
 *
 * Doctrine talktome-cards-primaute : card riche, text="".
 * Doctrine no-excuses : si data===null, le parent ne rend rien.
 * Doctrine retranscrire-api : extract affiché tel quel (truncate côté serveur 800 char).
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { WikipediaCardData } from '@/lib/wikipedia-search';

interface WikipediaCardProps {
  page: WikipediaCardData;
}

const WikipediaCard: React.FC<WikipediaCardProps> = ({ page }) => {
  const [imgError, setImgError] = useState(false);

  const handleShare = useCallback(async () => {
    const shareData = { title: page.title, url: page.page_url };
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // ignore
      }
    }
    try {
      await navigator.clipboard?.writeText(page.page_url);
    } catch {
      // ignore
    }
  }, [page]);

  const hasImage = !!page.thumbnail && !imgError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      {hasImage && (
        <div className="w-full h-36 bg-black/20 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={page.thumbnail as string}
            alt={page.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </div>
      )}
      <div className="p-4">
        <div className="text-base font-medium text-white leading-snug">
          {page.title}
        </div>
        <p className="mt-2 text-[13px] text-white/70 leading-relaxed line-clamp-5">
          {page.extract}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <a
            href={page.page_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-red-200/90 hover:text-red-100 underline underline-offset-2"
          >
            Lire sur Wikipedia
          </a>
          <button
            type="button"
            onClick={handleShare}
            className="text-[12px] text-white/55 hover:text-white/80"
          >
            Partager
          </button>
        </div>
        <div className="mt-2 text-[10px] text-white/35">
          via Wikipedia ({page.lang})
        </div>
      </div>
    </motion.div>
  );
};

export default WikipediaCard;
