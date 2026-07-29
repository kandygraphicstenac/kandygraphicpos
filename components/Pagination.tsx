'use client';

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

interface Props {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Singular noun for the count line, e.g. "part" → "1,204 parts". */
  itemLabel: string;
}

/**
 * Numbered pagination shared by every catalog list.
 *
 * Numbered (not infinite scroll) because the owner browses and edits these
 * lists — jumping to a page and seeing the total both matter.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel,
}: Props) {
  // Always render: the page-size selector and total stay useful on a single page.
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const btn =
    'h-8 min-w-8 px-2 rounded-lg text-[12px] font-medium transition-colors ' +
    'border border-border text-text-2 hover:border-border-hover hover:text-text ' +
    'disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <p className="text-[12px] text-text-3 tabular-nums">
          {total === 0
            ? `No ${itemLabel}s`
            : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} ${itemLabel}${total !== 1 ? 's' : ''}`}
        </p>
        <label className="flex items-center gap-1.5 text-[12px] text-text-3">
          Show
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            className="h-8 px-2 bg-surface border border-border rounded-lg text-[12px] text-text
                       focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors"
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={btn}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            ←
          </button>

          {pageNumbers(page, pageCount).map((n, i) =>
            n === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-[12px] text-text-3 select-none">…</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPageChange(n)}
                aria-label={`Page ${n}`}
                aria-current={n === page ? 'page' : undefined}
                className={
                  n === page
                    ? 'h-8 min-w-8 px-2 rounded-lg text-[12px] font-medium bg-accent text-accent-fg'
                    : btn
                }
              >
                {n}
              </button>
            ),
          )}

          <button
            type="button"
            className={btn}
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Windowed page list: always first and last, plus the current page ±1,
 * with ellipses for the gaps. Keeps the control a fixed width at any page count.
 */
function pageNumbers(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);

  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pageCount - 1) out.push('…');
  out.push(pageCount);

  return out;
}
