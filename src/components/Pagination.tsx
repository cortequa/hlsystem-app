const PAGE_SIZES = [25, 50, 100] as const;

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

/**
 * Patička seznamu: rozsah, volba velikosti stránky a krokování.
 * Sdílená napříč obrazovkami — každý seznam si dřív tabulku i navigaci
 * kreslil sám a stránkování neměl vůbec.
 */
export default function Pagination({
  page,
  limit,
  total,
  loading = false,
  onPageChange,
  onLimitChange,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  const btn =
    "px-2 py-1 rounded-md text-sm bg-secondary text-text-primary " +
    "hover:bg-secondary/70 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-secondary/30">
      <div className="text-sm text-text-secondary">
        {total === 0
          ? "Žádné záznamy"
          : `Zobrazeno ${first}–${last} z ${total.toLocaleString("cs-CZ")}`}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          className="px-2 py-1 bg-secondary text-text-primary rounded-md text-sm"
          aria-label="Počet záznamů na stránku"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / stránku
            </option>
          ))}
        </select>

        <button
          onClick={() => onPageChange(1)}
          disabled={loading || page <= 1}
          className={btn}
          aria-label="První stránka"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={loading || page <= 1}
          className={btn}
          aria-label="Předchozí stránka"
        >
          ‹
        </button>
        <span className="text-sm text-text-primary tabular-nums px-1">
          {page} / {pageCount}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={loading || page >= pageCount}
          className={btn}
          aria-label="Další stránka"
        >
          ›
        </button>
        <button
          onClick={() => onPageChange(pageCount)}
          disabled={loading || page >= pageCount}
          className={btn}
          aria-label="Poslední stránka"
        >
          »
        </button>
      </div>
    </div>
  );
}
