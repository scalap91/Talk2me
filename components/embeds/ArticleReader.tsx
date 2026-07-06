'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink, Loader2 } from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  url: string;
  open: boolean;
  onClose: () => void;
}

interface ArticleData {
  title: string;
  byline?: string | null;
  content: string; // HTML sanitized
  siteName?: string | null;
  publishedTime?: string | null;
  lang?: string | null;
  length?: number | null;
  url: string;
}

export default function ArticleReader({ url, open, onClose }: Props) {
  const [data, setData] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch article when modal opens
  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/article-reader?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; data?: ArticleData; reason?: string }) => {
        if (cancelled) return;
        if (j.ok && j.data) setData(j.data);
        else setError(j.reason || 'extract_failed');
      })
      .catch(() => {
        if (!cancelled) setError('network');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, url]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Prevent body scroll when modal open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  const minutesRead = data?.length
    ? Math.max(1, Math.round(data.length / 1500))
    : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] bg-[#0a0a0b]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#0a0a0b]/95 backdrop-blur-md border-b border-white/8">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/5 transition-colors -ml-2"
              aria-label="Fermer"
            >
              <X size={20} className="text-white/80" />
            </button>
            <div className="text-[11px] uppercase tracking-wider text-white/40 truncate max-w-[40%]">
              {data?.siteName || hostname}
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-white/65 hover:text-white px-3 py-1.5 rounded-full border border-white/12 hover:border-white/25 transition-colors"
            >
              <ExternalLink size={12} />
              <span>Original</span>
            </a>
          </div>

          {/* Scroll area */}
          <div className="h-[calc(100svh-56px)] overflow-y-auto">
            <motion.div
              className="px-5 py-8 max-w-[680px] mx-auto"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.22, delay: 0.04 }}
            >
              {loading && (
                <div className="flex flex-col items-center justify-center py-20 text-white/55">
                  <Loader2 size={22} className="animate-spin mb-3 text-white/40" />
                  <span className="text-sm">Extraction de l&apos;article…</span>
                </div>
              )}

              {error && !loading && (
                <div className="text-center py-20">
                  <p className="text-white/65 text-sm mb-4">
                    Impossible d&apos;extraire l&apos;article.
                  </p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/8 hover:bg-white/12 text-white/85 text-sm transition-colors"
                  >
                    <ExternalLink size={14} />
                    Ouvrir directement
                  </a>
                </div>
              )}

              {data && !loading && !error && (
                <article className="article-body">
                  <h1 className="text-[26px] sm:text-[30px] font-bold leading-[1.2] text-white mb-3 tracking-tight">
                    {data.title}
                  </h1>
                  <div className="flex items-center gap-2 text-[12px] text-white/45 mb-8 flex-wrap">
                    {data.byline && <span>{data.byline}</span>}
                    {data.byline && (data.publishedTime || minutesRead) && (
                      <span className="text-white/25">·</span>
                    )}
                    {data.publishedTime && (
                      <span>{formatDate(data.publishedTime)}</span>
                    )}
                    {minutesRead && (data.byline || data.publishedTime) && (
                      <span className="text-white/25">·</span>
                    )}
                    {minutesRead && <span>{minutesRead} min de lecture</span>}
                  </div>
                  <div
                    className="article-body-content"
                    dangerouslySetInnerHTML={{ __html: data.content }}
                  />
                </article>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}
