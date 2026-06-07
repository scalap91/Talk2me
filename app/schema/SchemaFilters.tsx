'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CATEGORY_LABELS,
  STATUS_DOTS,
  STATUS_LABELS,
  type ModuleCategory,
  type ModuleSpec,
} from '@/lib/schema/modules';

interface Props {
  modules: ModuleSpec[];
  orderedCategories: ModuleCategory[];
  countsByCategory: Record<ModuleCategory, number>;
}

export default function SchemaFilters({
  modules,
  orderedCategories,
  countsByCategory,
}: Props) {
  const [active, setActive] = useState<ModuleCategory | 'all'>('all');

  const visible = useMemo(() => {
    if (active === 'all') return modules;
    return modules.filter((m) => m.category === active);
  }, [active, modules]);

  return (
    <div className="space-y-4">
      {/* Chips catégories */}
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Catégories de modules"
      >
        <Chip
          active={active === 'all'}
          onClick={() => setActive('all')}
          label="Tous"
          count={modules.length}
        />
        {orderedCategories.map((c) => (
          <Chip
            key={c}
            active={active === c}
            onClick={() => setActive(c)}
            label={CATEGORY_LABELS[c]}
            count={countsByCategory[c]}
          />
        ))}
      </div>

      {/* Liste modules */}
      <ul className="space-y-2.5">
        {visible.map((m) => (
          <li key={m.id}>
            <Link
              href={`/schema/${m.id}`}
              data-testid={`schema-module-${m.id}`}
              className="block rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 hover:bg-white/[0.07] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${STATUS_DOTS[m.status]}`}
                  aria-label={STATUS_LABELS[m.status]}
                  title={STATUS_LABELS[m.status]}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14.5px] font-medium text-white/95 truncate">
                      {m.name}
                    </h3>
                    <span className="text-[10.5px] uppercase tracking-wider text-white/40">
                      {CATEGORY_LABELS[m.category]}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-white/60 line-clamp-2">
                    {m.responsibility}
                  </p>
                </div>
                <span className="text-white/30 text-[16px]">›</span>
              </div>
            </Link>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="text-center text-white/45 text-[13px] py-8">
            Aucun module dans cette catégorie.
          </li>
        )}
      </ul>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium transition-colors ' +
        (active
          ? 'bg-red-500/15 border border-red-400/30 text-white'
          : 'bg-white/[0.04] border border-white/10 text-white/75 hover:bg-white/[0.08] hover:text-white')
      }
    >
      <span>{label}</span>
      <span className="text-[10.5px] text-white/45">{count}</span>
    </button>
  );
}
