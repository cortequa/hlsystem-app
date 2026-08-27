import { useCallback, useEffect, useRef, useState } from "react";
import { Paged } from "../services/http";

interface UsePagedListOptions<T> {
  /** Načte jednu stránku. `signal` zruší dotaz, který mezitím zestaral. */
  fetchPage: (
    page: number,
    limit: number,
    signal: AbortSignal,
  ) => Promise<Paged<T>>;
  /**
   * Hodnoty, jejichž změna znamená nový dotaz a návrat na stránku 1
   * (datový rozsah, hledání…). Musí být primitivní, porovnává se přes `join`.
   */
  filterKey: unknown[];
  initialLimit?: number;
}

interface UsePagedListResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  /** Znovu načte aktuální stránku — např. po smazání záznamu. */
  reload: () => void;
}

/**
 * Jeden seznam = jeden dotaz na změnu vstupu.
 *
 * Nahrazuje ručně psané `useState` + `useEffect` bloky, kde se efekty
 * navzájem přetahovaly a jedno otevření obrazovky spustilo několik stažení
 * kompletní kolekce. Rozsah dat řeší server, ne prohlížeč.
 */
export function usePagedList<T>({
  fetchPage,
  filterKey,
  initialLimit = 50,
}: UsePagedListOptions<T>): UsePagedListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(initialLimit);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // `fetchPage` je typicky inline šipková funkce — bez ref by její nová
  // identita při každém renderu spouštěla efekt donekonečna.
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const filterId = JSON.stringify(filterKey);
  const prevFilterId = useRef(filterId);

  // Změna filtru musí vrátit na první stránku — jinak by uživatel po zúžení
  // rozsahu skončil na stránce, která už neexistuje, a viděl prázdno.
  if (prevFilterId.current !== filterId) {
    prevFilterId.current = filterId;
    if (page !== 1) setPage(1);
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    fetchPageRef
      .current(page, limit, controller.signal)
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((err: unknown) => {
        // Zrušený dotaz není chyba — jen ho vystřídal novější.
        if (!active || (err instanceof Error && err.name === "AbortError")) return;
        console.error("Načtení seznamu selhalo:", err);
        setItems([]);
        setTotal(0);
        setError("Načtení dat se nezdařilo. Zkuste to prosím znovu.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [page, limit, filterId, reloadToken]);

  const setLimit = useCallback((next: number) => {
    setLimitState(next);
    setPage(1);
  }, []);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return {
    items,
    total,
    page,
    limit,
    loading,
    error,
    setPage,
    setLimit,
    reload,
  };
}
