'use client';

/**
 * SearchResultCard — liste verticale de résultats de recherche web.
 *
 * Doctrine talktome-cards-primaute : ce composant EST la réponse à une
 * question factuelle ("genius diagnostic", "OVH"). Texte agent vide.
 * Doctrine talktome-no-excuses : si results vide → parent ne rend rien.
 * Doctrine retranscrire-api : title/snippet/url affichés tels que reçus.
 * Doctrine talktome-embeds-only : aucun résultat inventé, tap = vrai URL.
 *
 * Liste verticale (pas carousel) car les résultats web sont denses :
 * lecture top→bottom plus lisible que swipe horizontal.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { WebSearchData, WebSearchResultData } from '@/lib/chat-types';

interface SearchResultCardProps {
  data: WebSearchData;
}

const SOURCE_LABEL: Record<WebSearchData['source'], string> = {
  brave: 'Brave Search',
  bing: 'Bing',
  ddg: 'DuckDuckGo',
  none: 'aucune source',
};

const SearchResultCard: React.FC<SearchResultCardProps> = ({ data }) => {
  const { results, source } = data;
  if (!results || results.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <div className="divide-y divide-white/[0.06]">
        {results.map((r, i) => (
          <SearchResultRow key={`${i}-${r.url}`} result={r} index={i} />
        ))}
      </div>
      <div className="px-4 py-2 text-[10px] text-white/35 flex items-center justify-between border-t border-white/[0.06]">
        <span>
          {results.length} résultat{results.length > 1 ? 's' : ''}
        </span>
        <span>via {SOURCE_LABEL[source]}</span>
      </div>
    </motion.div>
  );
};

interface SearchResultRowProps {
  result: WebSearchResultData;
  index: number;
}

function SearchResultRow({ result, index }: SearchResultRowProps) {
  const [iconError, setIconError] = useState(false);
  const showIcon = !!result.favicon && !iconError;
  return (
    <motion.a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 + index * 0.04 }}
      className="block px-4 py-3 hover:bg-white/[0.04] transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1">
        {showIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.favicon}
            alt=""
            width={16}
            height={16}
            className="w-4 h-4 rounded-sm shrink-0"
            onError={() => setIconError(true)}
            loading="lazy"
          />
        ) : (
          <span className="w-4 h-4 rounded-sm bg-white/10 shrink-0 inline-block" />
        )}
        <span className="text-[11px] text-white/45 truncate">
          {result.source || hostnameOf(result.url) || result.url}
        </span>
      </div>
      <div className="text-[14px] font-medium text-red-200/95 group-hover:text-red-100 leading-snug line-clamp-2">
        {result.title}
      </div>
      {result.snippet && (
        <p className="mt-1 text-[12.5px] text-white/65 leading-relaxed line-clamp-2">
          {result.snippet}
        </p>
      )}
    </motion.a>
  );
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export default SearchResultCard;
