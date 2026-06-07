'use client';

import React from 'react';

interface DateSeparatorProps {
  label: string;
}

/**
 * Talk2Me #337 (Pascal 2026-06-04) — Séparateur de date discret dans le flux
 * de messages. Inseré entre 2 messages quand changement de jour calendaire,
 * et avant le premier message d'une conv.
 *
 * Doctrine [[talktome-design-premium]] : style iMessage/Linear, accent
 * violet subtil. Pas gaming RGB.
 */
const DateSeparator: React.FC<DateSeparatorProps> = ({ label }) => {
  return (
    <div
      data-testid="date-separator"
      data-label={label}
      className="flex items-center gap-3 my-4"
      role="separator"
      aria-label={label}
    >
      <div className="flex-1 h-px bg-white/8" />
      <span className="text-[10.5px] uppercase tracking-wider text-white/40 font-medium">
        {label}
      </span>
      <div className="flex-1 h-px bg-white/8" />
    </div>
  );
};

export default DateSeparator;

/**
 * Helpers — calcul du label séparateur entre deux messages (timestamps ms).
 *
 * - `prevTs` undefined → premier message → label de la date courante.
 * - Même jour calendaire → null (pas de séparateur).
 * - Jour différent → label formaté.
 *
 * Format :
 *  - "Aujourd'hui" si jour = today
 *  - "Hier" si jour = today - 1
 *  - "Lundi 3 juin" (jour de la semaine + date courte) si < 7 jours
 *  - "12 mai 2026" sinon
 */
export function getDateSeparatorLabel(
  prevTs: number | null | undefined,
  currentTs: number | null | undefined
): string | null {
  if (!currentTs) return null;
  const cur = new Date(currentTs);
  if (Number.isNaN(cur.getTime())) return null;

  if (prevTs) {
    const prev = new Date(prevTs);
    if (
      !Number.isNaN(prev.getTime()) &&
      prev.getFullYear() === cur.getFullYear() &&
      prev.getMonth() === cur.getMonth() &&
      prev.getDate() === cur.getDate()
    ) {
      return null;
    }
  }

  return formatDateLabel(cur);
}

export function formatDateLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor(
    (startOfDay(now) - startOfDay(date)) / 86400_000
  );

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays > 1 && diffDays < 7) {
    // Lundi 3 juin
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
  // 12 mai 2026
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
