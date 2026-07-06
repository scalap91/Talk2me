'use client';

import { Search, Camera, Heart, ChevronLeft } from '@/lib/icons';

export default function SheinSearchBar(props: {
  value?: string;
  onChange?: (v: string) => void;
  onSubmit?: () => void;
  onBack?: () => void;
}) {
  const { value, onChange, onSubmit, onBack } = props;

  return (
    // Sticky + safe-area en haut : la page remonte sous la barre batterie.
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              aria-label="Retour"
              onClick={onBack}
              className="flex h-10 w-9 shrink-0 items-center justify-center text-neutral-800"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
            </button>
          )}

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" strokeWidth={2} />
            <input
              type="text"
              value={value ?? ''}
              onChange={(e) => onChange?.(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit?.(); }}
              placeholder="Rechercher"
              className="w-full rounded-full border border-neutral-200 bg-neutral-100 py-2.5 pl-9 pr-4 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-red-400"
            />
          </div>

          <button type="button" aria-label="Recherche par image" className="flex h-10 w-9 shrink-0 items-center justify-center text-neutral-700">
            <Camera className="h-5 w-5" strokeWidth={2} />
          </button>
          <button type="button" aria-label="Rechercher" onClick={() => onSubmit?.()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600">
            <Search className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <button type="button" aria-label="Liste de souhaits" className="flex h-10 w-9 shrink-0 items-center justify-center text-neutral-700">
            <Heart className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Bandeau livraison gratuite */}
        <div className="mt-2 flex w-full items-center justify-center rounded-full bg-red-50 px-3 py-1">
          <span className="text-[11px] text-red-600">🚚 Livraison gratuite · Retours sous 30 jours</span>
        </div>
      </div>
    </div>
  );
}
