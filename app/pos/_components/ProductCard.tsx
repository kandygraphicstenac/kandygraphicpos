import { forwardRef } from 'react';
import type { PosSearchResult } from '@/lib/types/pos';
import { yearLabel } from '@/lib/utils/modelLabel';

const LKR = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' });

function stockPillCls(stock: number, reorderLevel: number) {
  if (stock === 0) return 'bg-danger-bg text-danger-fg';
  if (stock <= reorderLevel) return 'bg-warn-bg text-warn-fg';
  return 'bg-ok-bg text-ok-fg';
}

type NavDir = 'left' | 'right' | 'up' | 'down';

type Props = {
  result: PosSearchResult;
  index: number;
  onAdd: (r: PosSearchResult) => void;
  onOpenSetDetail?: (id: number) => void;
  onNavigate?: (dir: NavDir) => void;
};

export const ProductCard = forwardRef<HTMLButtonElement, Props>(function ProductCard(
  { result, onAdd, onOpenSetDetail, onNavigate },
  ref,
) {
  const stock = result.type === 'part' ? result.finishedStock : result.availability;
  const reorderLevel = result.type === 'part' ? result.reorderLevel : 3;
  const available = stock > 0;
  const imageUrl = result.imageUrl;
  const brandInitial = result.bikeModel.brand[0]?.toUpperCase() ?? '?';

  function handleClick() {
    if (result.type === 'set' && onOpenSetDetail) {
      onOpenSetDetail(result.id);
    } else {
      onAdd(result);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!onNavigate) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); onNavigate('left'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onNavigate('right'); }
    if (e.key === 'ArrowUp') { e.preventDefault(); onNavigate('up'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onNavigate('down'); }
    // Enter is handled by default button click
  }

  return (
    <button
      ref={ref}
      type="button"
      disabled={!available}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={[
        'w-full text-left bg-surface border border-border rounded-xl overflow-hidden',
        'flex flex-col transition-[border-color,transform] duration-120',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        available
          ? 'hover:border-border-hover active:scale-[0.98] cursor-pointer'
          : 'opacity-50 cursor-not-allowed',
      ].join(' ')}
    >
      {/* ── 4:3 image area ── */}
      <div className="aspect-4/3 w-full overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={result.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-pill-part-bg flex items-center justify-center">
            <span className="text-pill-part-fg text-3xl font-medium select-none">
              {brandInitial}
            </span>
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {/* Badge row: type pill + SKU */}
        <div className="flex items-center justify-between gap-1.5">
          <span
            className={[
              'shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md',
              result.type === 'part' && !result.isKit
                ? 'bg-pill-part-bg text-pill-part-fg'
                : 'bg-pill-set-bg text-pill-set-fg',
            ].join(' ')}
          >
            {result.type === 'set' ? 'Full set' : result.isKit ? 'Kit' : 'Part'}
          </span>
          <span className="font-mono text-[11px] text-text-3 tabular-nums truncate min-w-0">
            {result.sku}
          </span>
        </div>

        {/* Name */}
        <p className="text-[14px] font-medium leading-snug text-text line-clamp-2">
          {result.name}
        </p>

        {/* Model + year */}
        <p className="text-[12px] text-text-2 truncate">
          {result.bikeModel.brand} {result.bikeModel.model} {yearLabel(result.bikeModel.year, result.bikeModel.yearEnd)}
        </p>

        {/* Location tag */}
        {result.locationCode && (
          <p className="text-[11px] text-text-3 font-mono truncate">
            📍 {result.locationCode}
          </p>
        )}

        {/* Price left + stock pill right */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-1">
          <span className="text-[15px] font-medium tabular-nums text-text">
            {LKR.format(parseFloat(result.price))}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span
              className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md tabular-nums ${stockPillCls(stock, reorderLevel)}`}
            >
              {stock === 0 ? 'Out' : `Ready ${stock}`}
            </span>
            {result.type === 'part' && result.uncutQty > 0 && (
              <span className="text-[11px] text-text-3 tabular-nums whitespace-nowrap">
                · uncut {result.uncutQty}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
});
