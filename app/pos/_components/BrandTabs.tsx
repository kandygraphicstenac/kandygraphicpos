'use client';

import type { FiltersResponse } from '@/lib/types/pos';
import { yearLabel } from '@/lib/utils/modelLabel';

type Props = {
  filters: FiltersResponse;
  selectedBrand: string | null;
  selectedModelId: number | null;
  onSelectBrand: (brand: string | null) => void;
  onSelectModel: (modelId: number | null) => void;
};

export function BrandTabs({
  filters,
  selectedBrand,
  selectedModelId,
  onSelectBrand,
  onSelectModel,
}: Props) {
  const models =
    selectedBrand != null
      ? (filters.brands.find((b) => b.brand === selectedBrand)?.models ?? [])
      : [];

  return (
    <div className="bg-surface border-b border-border shrink-0">
      {/* ── Brand tab row ── */}
      <div className="flex items-center gap-1 px-4 overflow-x-auto scrollbar-none py-1">
        {/* "All" tab */}
        <button
          type="button"
          onClick={() => { onSelectBrand(null); onSelectModel(null); }}
          className={[
            'shrink-0 px-3 h-9 text-[13px] font-medium rounded-md transition-colors duration-100',
            'min-w-[40px]',
            selectedBrand === null
              ? 'text-accent border-b-2 border-accent rounded-none pb-0'
              : 'text-text-2 hover:text-text hover:bg-border',
          ].join(' ')}
        >
          All
        </button>

        {filters.brands.map((b) => (
          <button
            key={b.brand}
            type="button"
            onClick={() => {
              onSelectBrand(b.brand);
              onSelectModel(null);
            }}
            className={[
              'shrink-0 px-3 h-9 text-[13px] font-medium rounded-md transition-colors duration-100',
              'min-w-[40px] whitespace-nowrap',
              selectedBrand === b.brand
                ? 'text-accent border-b-2 border-accent rounded-none pb-0'
                : 'text-text-2 hover:text-text hover:bg-border',
            ].join(' ')}
          >
            {b.brand}
          </button>
        ))}
      </div>

      {/* ── Model chip row — only when a brand is selected ── */}
      {selectedBrand !== null && models.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 pb-2 overflow-x-auto scrollbar-none">
          {models.map((m) => {
            const active = selectedModelId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectModel(active ? null : m.id)}
                className={[
                  'shrink-0 px-2.5 h-7 text-[12px] font-medium rounded-full',
                  'transition-colors duration-100 whitespace-nowrap min-w-[40px]',
                  active
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-border text-text-2 hover:bg-border-hover hover:text-text',
                ].join(' ')}
              >
                {m.model} {yearLabel(m.year, m.yearEnd)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
